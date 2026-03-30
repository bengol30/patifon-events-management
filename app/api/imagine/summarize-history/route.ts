import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * Summarize WhatsApp conversation history using AI
 * ONLY used by Imagine Me CRM - not system-wide
 */
export async function POST(request: Request) {
  try {
    const { messages, customerName, projectId, taskId } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ ok: false, error: 'Messages array required' }, { status: 400 });
    }

    // Format conversation for AI
    const conversationText = messages
      .map((m: any) => {
        const speaker = m.from === 'customer' ? customerName || 'לקוח' : 'בן (Imagine Me)';
        return `${speaker}: ${m.text}`;
      })
      .join('\n');

    const newestMessages = messages.slice(0, 10);
    const olderMessages = messages.slice(10, 70);

    const systemPrompt = `You are analyzing a WhatsApp conversation between Ben (from Imagine Me) and a customer.

Imagine Me is a business that creates AI-generated photos for events.

IMPORTANT:
- The conversation input contains up to the latest 70 messages.
- The messages are ordered NEWEST FIRST.
- You MUST give much more weight to the latest 5-10 messages than to older messages.
- If there is any contradiction between older parts of the conversation and the latest updates, the latest updates win.
- Your summary must reflect the FINAL current reality of the chat, not just the general theme.
- You must explicitly determine who currently holds the ball: Ben or the customer.
- If the customer asked a question and Ben still owes an answer, say that clearly.
- Do not hide unresolved open items behind a generic summary.

Newest messages (highest priority):
${newestMessages.map((m: any) => {
  const speaker = m.from === 'customer' ? customerName || 'לקוח' : 'בן (Imagine Me)';
  return `- ${speaker}: ${m.text}`;
}).join('\n')}

Older messages (supporting context only):
${olderMessages.length > 0 ? olderMessages.map((m: any) => {
  const speaker = m.from === 'customer' ? customerName || 'לקוח' : 'בן (Imagine Me)';
  return `- ${speaker}: ${m.text}`;
}).join('\n') : 'אין הודעות ישנות נוספות'}

Write the response in Hebrew, concise and factual, in exactly this structure:
סיכום כללי: ...
נקודות חשובות:
- ...
- ...
טון הלקוחה: ...
תאריכים/מספרים חשובים: ...
סטטוס נוכחי: ...
הודעות אחרונות שמשנות את התמונה:
- ...
- ...
אצל מי הכדור עכשיו: ...`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Analyze this WhatsApp conversation:\n\n${conversationText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!openaiRes.ok) {
      throw new Error(`OpenAI API error: ${await openaiRes.text()}`);
    }

    const openaiData = await openaiRes.json();
    const summary = openaiData.choices?.[0]?.message?.content || '';

    // Save summary to Firestore (in task's customData)
    if (taskId && adminDb) {
      try {
        const taskRef = adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();
        
        if (taskDoc.exists) {
          const existingData = taskDoc.data();
          const updatedCustomData = {
            ...(existingData?.customData || {}),
            conversationSummary: summary,
            lastSummaryUpdate: new Date().toISOString(),
          };
          
          await taskRef.update({
            customData: updatedCustomData,
          });
          
          console.log('Summary saved successfully to task:', taskId);
        }
      } catch (err) {
        console.error('Failed to save summary to Firestore:', err);
        // Don't fail the request if save fails
      }
    }

    return NextResponse.json({
      ok: true,
      summary,
      messageCount: messages.length,
    });
  } catch (error: any) {
    console.error('summarize-history error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

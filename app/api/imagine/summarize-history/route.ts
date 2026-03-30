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

    const newestMessages = messages.slice(0, 10);
    const olderMessages = messages.slice(10, 40);

    const renderMessage = (m: any) => {
      const speaker = m.from === 'customer' ? customerName || 'לקוח' : 'בן (Imagine Me)';
      const rawText = String(m.text || '').trim();
      const text = rawText.length > 280 ? `${rawText.slice(0, 280)}...` : rawText;
      return `- ${speaker}: ${text || '[ללא טקסט]'}`;
    };

    const systemPrompt = `You are analyzing a WhatsApp conversation between Ben (from Imagine Me) and a customer.

Imagine Me is a business that creates AI-generated photos for events.

CRITICAL RULES:
- The messages are ordered NEWEST FIRST.
- The latest 5-10 messages are the main source of truth.
- Older messages are background only.
- If older context conflicts with the latest messages, the latest messages win.
- You must identify the exact CURRENT state of the conversation now.
- You must identify who currently holds the ball.
- If the customer asked a question/request and Ben still owes an answer/check/confirmation, then the ball is with Ben.
- Do not write a generic sales summary if there is a specific unresolved item in the newest messages.
- Mention the exact unresolved item from the newest messages.
- If there are 2 open items in the latest messages (for example logo + free text), mention both and do not collapse them into one.
- The latestUpdates field must contain the concrete unresolved requests from the newest messages, not general business background.
- ALL field values must be written in Hebrew only.
- Do not use English sentences or English descriptions in any value.
- Only the enum in ballOwnerNow may be Ben or Customer.

Newest messages (highest priority):
${newestMessages.map(renderMessage).join('\n')}

Older messages (background only):
${olderMessages.length > 0 ? olderMessages.map(renderMessage).join('\n') : 'אין הודעות ישנות נוספות'}

Return ONLY valid JSON with this exact schema:
{
  "generalSummary": "string",
  "keyPoints": ["string", "string"],
  "customerTone": "string",
  "importantDatesOrNumbers": ["string"],
  "currentStatus": "string",
  "latestUpdates": ["string", "string"],
  "ballOwnerNow": "Ben|Customer"
}`;
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
          { role: 'user', content: 'Analyze the conversation and return JSON only.' },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      throw new Error(`OpenAI API error: ${await openaiRes.text()}`);
    }

    const openaiData = await openaiRes.json();
    const parsed = JSON.parse(openaiData.choices?.[0]?.message?.content || '{}');
    const keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.filter(Boolean) : [];
    const importantDatesOrNumbers = Array.isArray(parsed.importantDatesOrNumbers) ? parsed.importantDatesOrNumbers.filter(Boolean) : [];
    const latestUpdates = Array.isArray(parsed.latestUpdates) ? parsed.latestUpdates.filter(Boolean) : [];
    const ballOwnerNow = parsed.ballOwnerNow === 'Customer' ? 'הלקוחה' : 'בן';

    const summary = [
      `סיכום כללי: ${parsed.generalSummary || 'לא זוהה סיכום ברור'}`,
      `נקודות חשובות:\n${keyPoints.length ? keyPoints.map((item: string) => `- ${item}`).join('\n') : '- אין'}`,
      `טון הלקוחה: ${parsed.customerTone || 'לא זוהה'}`,
      `תאריכים/מספרים חשובים: ${importantDatesOrNumbers.length ? importantDatesOrNumbers.join(' | ') : 'אין'}`,
      `סטטוס נוכחי: ${parsed.currentStatus || 'לא זוהה'}`,
      `הודעות אחרונות שמשנות את התמונה:\n${latestUpdates.length ? latestUpdates.map((item: string) => `- ${item}`).join('\n') : '- אין'}`,
      `אצל מי הכדור עכשיו: ${ballOwnerNow}`,
    ].join('\n\n');

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

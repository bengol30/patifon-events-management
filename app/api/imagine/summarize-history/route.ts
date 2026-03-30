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

    const systemPrompt = `You are analyzing a WhatsApp conversation between Ben (from Imagine Me) and a customer.

Imagine Me is a business that creates AI-generated photos for events.

IMPORTANT:
- The conversation input contains up to the latest 70 messages.
- You MUST pay special attention to the newest messages at the top/end of the discussion chronology.
- If there is any contradiction between older parts of the conversation and the latest updates, the latest updates win.
- Your summary must reflect the FINAL current reality of the chat, not just the general theme.

Analyze the conversation and provide:
1. **Summary** - What was discussed? What happened overall?
2. **Key Points** - Important decisions, agreements, changes, or concerns
3. **Tone** - Customer's attitude (positive/neutral/negative/mixed)
4. **Important Dates/Numbers** - Any dates, prices, quantities mentioned
5. **Current Status** - Where does the conversation stand NOW based on the latest messages?
6. **Latest Updates** - Explicitly mention the final recent updates from the newest messages

Respond in Hebrew, be concise and factual.`;

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

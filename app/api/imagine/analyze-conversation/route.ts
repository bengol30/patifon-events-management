import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * Analyze conversation history and update task status
 * Called after fetching WhatsApp history
 * ONLY used by Imagine Me CRM
 */
export async function POST(request: Request) {
  try {
    const { projectId, taskId, conversationSummary, recentMessages } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!taskId) {
      return NextResponse.json({ ok: false, error: 'taskId required' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    // Analyze conversation to determine status
    const systemPrompt = `You are analyzing a WhatsApp conversation history to determine the current sales status.

**Context:**
- Business: Imagine Me (AI photo service for events)
- Just fetched conversation history from WhatsApp

**Recent conversation (last 5 messages):**
${recentMessages && recentMessages.length > 0 ? recentMessages.map((m: any) => {
  const date = new Date(m.timestamp * 1000);
  const sender = m.from === 'customer' ? 'Customer' : 'Ben';
  return `${sender} (${date.toLocaleDateString('he-IL')}): ${m.text.substring(0, 100)}`;
}).join('\n') : 'No recent messages'}

${conversationSummary ? `\n**Full Summary:**\n${conversationSummary}` : ''}

**Task:**
Based on the conversation history, determine:
1. **Current Status** (Hebrew, max 50 chars) - What stage is this lead in?
2. **Next Step** (Hebrew, max 80 chars) - What should Ben do next?
3. **Follow-up Status** - One of: "contacted" | "awaiting_response" | "negotiating" | "interested" | "not_interested"
4. **Priority** - One of: "NORMAL" | "HIGH" | "CRITICAL"

**Guidelines:**
- If customer is actively discussing details/pricing → "negotiating" + HIGH priority
- If customer asked question and waiting for Ben → "awaiting_response" + HIGH
- If Ben sent message and waiting for customer → "awaiting_response" + NORMAL
- If customer said they'll check/think about it → "interested" + NORMAL
- If customer said no/not interested → "not_interested" + NORMAL
- If last contact was >7 days ago → increase priority to HIGH

Respond ONLY with valid JSON:
{
  "currentStatus": "string",
  "nextStep": "string", 
  "followUpStatus": "contacted|awaiting_response|negotiating|interested|not_interested",
  "priority": "NORMAL|HIGH|CRITICAL"
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
          { role: 'user', content: 'Analyze and respond with JSON only.' },
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      throw new Error(`OpenAI API error: ${await openaiRes.text()}`);
    }

    const openaiData = await openaiRes.json();
    const analysis = JSON.parse(openaiData.choices?.[0]?.message?.content || '{}');

    // Update task in Firestore
    const taskRef = adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId);
    const taskDoc = await taskRef.get();

    if (!taskDoc.exists) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }

    const existingData = taskDoc.data();
    const updatedCustomData = {
      ...(existingData?.customData || {}),
      followUpStatus: analysis.followUpStatus || 'contacted',
      whatsappHistoryFetched: true,
      lastHistoryFetch: new Date().toISOString(),
    };

    await taskRef.update({
      currentStatus: analysis.currentStatus || 'נבדקת היסטוריית שיחה',
      nextStep: analysis.nextStep || 'לבדוק ולהחליט על הצעד הבא',
      priority: analysis.priority || 'NORMAL',
      customData: updatedCustomData,
    });

    return NextResponse.json({
      ok: true,
      analysis,
      updated: {
        currentStatus: analysis.currentStatus,
        nextStep: analysis.nextStep,
        priority: analysis.priority,
        followUpStatus: analysis.followUpStatus,
      },
    });
  } catch (error: any) {
    console.error('analyze-conversation error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

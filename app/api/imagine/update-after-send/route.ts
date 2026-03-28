import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * Update task status after sending follow-up message
 * ONLY used by Imagine Me CRM
 */
export async function POST(request: Request) {
  try {
    const { projectId, taskId, messageSent, conversationSummary, recentMessages } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!taskId || !messageSent) {
      return NextResponse.json({ ok: false, error: 'taskId and messageSent required' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    // Analyze conversation to determine status
    const systemPrompt = `You are analyzing a WhatsApp conversation to determine the current status and next step for a CRM task.

**Context:**
- Business: Imagine Me (AI photo service for events)
- Just sent a follow-up message: "${messageSent}"

**Recent conversation:**
${recentMessages && recentMessages.length > 0 ? recentMessages.map((m: any) => {
  const date = new Date(m.timestamp * 1000);
  const sender = m.from === 'customer' ? 'Customer' : 'Ben';
  return `${sender} (${date.toLocaleDateString('he-IL')}): ${m.text.substring(0, 100)}`;
}).join('\n') : 'No recent messages'}

${conversationSummary ? `\n**Summary:**\n${conversationSummary}` : ''}

**Task:**
Based on the conversation, determine:
1. **Current Status** (Hebrew, max 50 chars) - Where are we in the sales process?
2. **Next Step** (Hebrew, max 80 chars) - What should happen next?
3. **Follow-up Status** - One of: "contacted" | "awaiting_response" | "negotiating" | "interested" | "not_interested"
4. **Priority** - One of: "NORMAL" | "HIGH" | "CRITICAL"

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
    const nowIso = new Date().toISOString();
    const sentTimestamp = Math.floor(Date.now() / 1000);
    const existingRecentMessages = Array.isArray(recentMessages) && recentMessages.length > 0
      ? recentMessages
      : (Array.isArray(existingData?.customData?.recentMessages) ? existingData.customData.recentMessages : []);

    const recentMessagesWithSent = [
      {
        from: 'us',
        type: 'outgoing',
        text: messageSent,
        timestamp: sentTimestamp,
      },
      ...existingRecentMessages,
    ].slice(0, 5);

    const updatedCustomData = {
      ...(existingData?.customData || {}),
      followUpStatus: analysis.followUpStatus || 'contacted',
      lastContactDate: nowIso,
      lastMessageSent: messageSent,
      recentMessages: recentMessagesWithSent,
      conversationSummary: conversationSummary || existingData?.customData?.conversationSummary || '',
      pendingFollowupMessage: '',
    };

    await taskRef.update({
      status: 'IN_PROGRESS',
      scheduleStatus: 'DONE',
      currentStatus: analysis.currentStatus || 'נשלחה הודעת follow-up',
      nextStep: analysis.nextStep || 'המתנה לתגובה',
      priority: analysis.priority || 'NORMAL',
      customData: updatedCustomData,
    });

    return NextResponse.json({
      ok: true,
      analysis,
      updated: {
        status: 'IN_PROGRESS',
        scheduleStatus: 'DONE',
        currentStatus: analysis.currentStatus,
        nextStep: analysis.nextStep,
        priority: analysis.priority,
        followUpStatus: analysis.followUpStatus,
        recentMessages: recentMessagesWithSent,
        customData: updatedCustomData,
      },
    });
  } catch (error: any) {
    console.error('update-after-send error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

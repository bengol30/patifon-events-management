import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { analyzeConversationSummary, formatConversationSummary } from '@/lib/imagine-conversation-summary';

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

    const analysis = analyzeConversationSummary(messages, customerName);
    const summary = formatConversationSummary(analysis);

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
      analysis,
      messageCount: messages.length,
    });
  } catch (error: any) {
    console.error('summarize-history error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getLydiaLeadById } from '@/lib/lydia';

export const dynamic = 'force-dynamic';

/**
 * Import a new lead from Lydia into PATIFON as a task
 * ONLY for Imagine Me project
 */
export async function POST(request: Request) {
  try {
    const { projectId, lydiaId } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me project' },
        { status: 403 }
      );
    }

    if (!lydiaId) {
      return NextResponse.json({ ok: false, error: 'lydiaId required' }, { status: 400 });
    }

    const lead = await getLydiaLeadById(lydiaId);

    if (!lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found in Lydia' }, { status: 404 });
    }

    // Check if already imported
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    const existingTasksSnap = await adminDb
      .collection('projects')
      .doc(projectId)
      .collection('tasks')
      .where('customData.lydiaId', '==', lydiaId)
      .get();

    if (!existingTasksSnap.empty) {
      return NextResponse.json(
        { ok: false, error: 'Lead already imported', existingTaskId: existingTasksSnap.docs[0].id },
        { status: 409 }
      );
    }

    // Create task in PATIFON
    const taskTitle = `${lead.name || 'לקוח'}${lead.company ? ` - ${lead.company}` : ''}`;

    const newTask = {
      title: taskTitle,
      description: `ליד מ-Lydia - ${lead.event_type || 'אירוע'} ${lead.event_date || ''}`,
      status: 'TODO',
      priority: 'HIGH',
      currentStatus: 'לקוח חדש - טרם יצרנו קשר',
      nextStep: 'לחלץ היסטוריית שיחות WhatsApp ולהכין הצעת הודעה',
      scope: 'project',
      createdAt: new Date().toISOString(),
      customData: {
        lydiaId: lead.id,
        phone: lead.phone || null,
        company: lead.company || null,
        eventDate: lead.event_date || null,
        eventType: lead.event_type || null,
        eventLocation: lead.event_location || null,
        estimatedValue: lead.estimated_value || null,
        lydiaStatus: lead.status || null,
        followUpStatus: 'new',
        lastContactDate: null,
        lastMessageSent: null,
        whatsappHistoryFetched: false,
        aiSuggestionGenerated: false,
      },
    };

    const taskRef = await adminDb.collection('projects').doc(projectId).collection('tasks').add(newTask);

    return NextResponse.json({
      ok: true,
      taskId: taskRef.id,
      lead: {
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        eventType: lead.event_type,
        eventDate: lead.event_date,
      },
    });
  } catch (error: any) {
    console.error('import-lead error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { syncCampaignControlsWithTask } from '@/lib/marketing-campaign-controls';
import { detectEventContentDrift } from '@/lib/event-content-fetcher';

export const dynamic = 'force-dynamic';

const clean = (value: unknown) => String(value || '').trim();

export async function GET() {
  try {
    if (!adminDb) {
      console.error('❌ campaign-health: adminDb is null/undefined');
      throw new Error('Firebase Admin not initialized');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const eventsSnap = await adminDb.collection('events').get();
    const scheduledSnap = await adminDb.collection('scheduled_posts').get();
    const scheduledPosts = new Map(scheduledSnap.docs.map((doc) => [doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) }]));

    const issues: Array<Record<string, unknown>> = [];
    const checked: Array<Record<string, unknown>> = [];
    const taskExists = new Map<string, boolean>();

    // Check Instagram token
    const instagramSnap = await adminDb.collection('integrations').doc('instagram').get();
    const instagramData = instagramSnap.data() as Record<string, unknown> | undefined;
    const hasInstagramToken = !!(
      instagramData?.accessToken ||
      (Array.isArray(instagramData?.accounts) && instagramData.accounts.some((a: any) => a?.accessToken))
    );
    if (!hasInstagramToken) {
      issues.push({
        severity: 'critical',
        type: 'missing_instagram_token',
        message: 'Instagram integration has no valid access token - story campaigns will fail',
      });
    }

    for (const eventDoc of eventsSnap.docs) {
      const tasksSnap = await eventDoc.ref.collection('tasks').get();
      for (const taskDoc of tasksSnap.docs) {
        const task = taskDoc.data() as Record<string, unknown>;
        const specialType = clean(task.specialType);
        if (!['whatsapp_campaign_patifon', 'instagram_story_campaign_patifon'].includes(specialType)) continue;

        const base = {
          eventId: eventDoc.id,
          taskId: taskDoc.id,
          title: clean(task.title),
          specialType,
          status: clean(task.status),
        };

        const syncedControls = syncCampaignControlsWithTask(task, (task.campaignControls || {}) as Record<string, unknown>);
        const rawControls = (task.campaignControls || {}) as Record<string, unknown>;
        if (!task.campaignControls) {
          issues.push({ ...base, severity: 'medium', type: 'missing_campaign_controls', message: 'Campaign task has no campaignControls yet' });
        }
        if ((clean(task.status) === 'IN_PROGRESS' || clean(task.status) === 'DONE') && !task.startedAt) {
          issues.push({ ...base, severity: 'medium', type: 'missing_started_at', message: 'Campaign task progressed but startedAt is missing' });
        }
        if (clean(task.status) === 'DONE' && !task.completedAt) {
          issues.push({ ...base, severity: 'medium', type: 'missing_completed_at', message: 'Campaign task is DONE but completedAt is missing' });
        }
        const rawWindows = Array.isArray(rawControls.windows) ? rawControls.windows as Record<string, unknown>[] : [];
        if (rawWindows.length !== syncedControls.windows.length) {
          issues.push({ ...base, severity: 'medium', type: 'campaign_controls_drift', message: 'campaignControls windows count does not match current plan' });
        }
        const hasTimeDrift = rawWindows.some((window, index) => clean(window.scheduledAt) !== clean(syncedControls.windows[index]?.scheduledAt));
        if (hasTimeDrift) {
          issues.push({ ...base, severity: 'medium', type: 'campaign_window_time_drift', message: 'campaignControls scheduled times drift from task plan' });
        }
        const nextStepText = clean(task.nextStep);
        const blockedWindowMentioned = syncedControls.windows.find((window) => !window.enabled && nextStepText.includes(window.scheduledAt));
        if (blockedWindowMentioned) {
          issues.push({ ...base, severity: 'low', type: 'next_step_points_to_blocked_window', message: 'nextStep points to a blocked campaign window' });
        }
        if (clean(rawControls.status) === 'PAUSED') {
          checked.push({ ...base, note: 'campaign paused' });
        }

        // 🔍 Check for content drift (payload vs current event)
        try {
          const payload = (task.payload || {}) as Record<string, unknown>;
          const payloadText = clean(payload.messageText);
          const payloadMediaUrls = Array.isArray(payload.mediaUrls) ? payload.mediaUrls.map(clean).filter(Boolean) : [];
          
          const drift = await detectEventContentDrift(eventDoc.id, payloadText, payloadMediaUrls);
          if (drift) {
            issues.push({
              ...base,
              severity: 'medium',
              type: 'content_drift',
              message: 'Campaign content differs from current event text/media - consider refreshing',
              driftDetails: {
                textChanged: drift.text !== payloadText,
                mediaChanged: JSON.stringify(drift.mediaUrls.sort()) !== JSON.stringify(payloadMediaUrls.sort()),
              },
            });
          }
        } catch (driftError) {
          // Silently skip drift check if it fails (don't break the whole health check)
        }

        if (specialType === 'whatsapp_campaign_patifon') {
          const payload = (task.payload || {}) as Record<string, unknown>;
          const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan as Record<string, unknown>[] : [];
          if (!sendPlan.length) {
            issues.push({ ...base, severity: 'high', type: 'missing_send_plan', message: 'WhatsApp campaign has no sendPlan' });
            continue;
          }
          const malformed = sendPlan.some((step) => !Number.isFinite(Number(step.step || 0)) || !clean(step.scheduledAt) || !Array.isArray(step.targetGroups));
          if (malformed) {
            issues.push({ ...base, severity: 'high', type: 'malformed_send_plan', message: 'WhatsApp campaign sendPlan is not runnable' });
          }
          if (clean(task.executionMode) !== 'AUTOMATED') {
            issues.push({ ...base, severity: 'medium', type: 'non_automated_execution_mode', message: 'WhatsApp campaign is not marked AUTOMATED' });
          }
          const disabledSteps = syncedControls.windows.filter((window) => !window.enabled).length;
          if (disabledSteps > 0) {
            checked.push({ ...base, note: `${disabledSteps} whatsapp windows blocked` });
          }
          checked.push(base);
          continue;
        }

        if (specialType === 'instagram_story_campaign_patifon' && clean(task.executionMode) !== 'AUTOMATED') {
          issues.push({ ...base, severity: 'medium', type: 'non_automated_instagram_story', message: 'Instagram story campaign is not marked AUTOMATED' });
        }

        const payload = (task.payload || {}) as Record<string, unknown>;
        const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
        const postedCount = storyPlan.filter((step) => clean(step.status) === 'POSTED').length;
        if (clean(task.status) === 'DONE' && postedCount !== storyPlan.length) {
          issues.push({ ...base, severity: 'high', type: 'done_without_all_posts_completed', message: 'Instagram story task is DONE but not all story steps are POSTED' });
        }
        const disabledStorySteps = syncedControls.windows.filter((window) => !window.enabled).length;
        if (disabledStorySteps > 0) {
          checked.push({ ...base, note: `${disabledStorySteps} instagram windows blocked` });
        }
        if (!storyPlan.length) {
          issues.push({ ...base, severity: 'high', type: 'missing_story_plan', message: 'Instagram story campaign has no storyPlan' });
          continue;
        }

        for (const step of storyPlan) {
          const stepIndex = Number(step.stepIndex || 0);
          if (!stepIndex) {
            issues.push({ ...base, severity: 'high', type: 'invalid_story_step', message: 'Story step missing stepIndex' });
            continue;
          }
          const expectedId = `ig-story-${eventDoc.id}-${taskDoc.id}-step${stepIndex}`;
          const scheduled = scheduledPosts.get(expectedId) as (Record<string, unknown> & { id: string }) | undefined;
          const status = clean((step as Record<string, unknown>).status);
          const taskStatus = clean(task.status);
          // Only flag missing scheduled_post if step is not POSTED and task is not DONE
          if (!scheduled && status !== 'POSTED' && taskStatus !== 'DONE') {
            issues.push({ ...base, severity: 'high', type: 'missing_scheduled_post', stepIndex, message: 'Story campaign step has no scheduled_posts mirror' });
            continue;
          }
          if (scheduled) {
            const pending = clean(scheduled.status) === 'pending';
            const overdue = Number(scheduled.scheduleTime || 0) <= nowSec;
            if (pending && overdue) {
              issues.push({ ...base, severity: 'medium', type: 'overdue_pending_story', stepIndex, message: 'Story scheduled_post is overdue and still pending' });
            }
            if (clean(scheduled.lastError)) {
              issues.push({ ...base, severity: 'medium', type: 'story_publish_error', stepIndex, message: clean(scheduled.lastError) });
            }
          }
          if (status === 'FAILED') {
            issues.push({ ...base, severity: 'medium', type: 'story_step_failed', stepIndex, message: clean((step as Record<string, unknown>).error) || 'Story step marked FAILED' });
          }
          if (status === 'FAILED' && clean(task.status) === 'DONE') {
            issues.push({ ...base, severity: 'high', type: 'done_with_failed_story_step', stepIndex, message: 'Task is DONE but a story step is FAILED' });
          }
        }
        checked.push(base);
        taskExists.set(`${eventDoc.id}:${taskDoc.id}`, true);
      }
    }

    for (const [postId, post] of scheduledPosts.entries()) {
      const eventId = clean((post as Record<string, unknown>).eventId);
      const taskId = clean((post as Record<string, unknown>).taskId);
      const source = clean((post as Record<string, unknown>).source);
      if (source !== 'instagram_story_campaign_patifon') continue;
      const status = clean((post as Record<string, unknown>).status);
      if (status !== 'pending') continue;
      const taskKey = `${eventId}:${taskId}`;
      if (!taskExists.has(taskKey)) {
        const taskRef = adminDb.collection('events').doc(eventId).collection('tasks').doc(taskId);
        const taskSnap = await taskRef.get();
        if (!taskSnap.exists || clean((taskSnap.data() as Record<string, unknown> | undefined)?.status) === 'DONE') {
          issues.push({
            eventId,
            taskId,
            severity: 'medium',
            type: 'orphaned_scheduled_post',
            scheduledPostId: postId,
            message: 'Pending scheduled_post exists but task is deleted or DONE - should be cleaned up',
          });
        }
      }
    }

    return NextResponse.json({ ok: true, checked: checked.length, issueCount: issues.length, issues, checkedTasks: checked });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'campaign-health failed' }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}

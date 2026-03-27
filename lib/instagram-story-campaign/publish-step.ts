import { FieldValue } from 'firebase-admin/firestore';
import admin, { adminDb } from '@/lib/firebase-admin';
import { resolveInstagramAccountToken } from './scheduler';
import { convertImageUrlToStoryBuffer } from './convert';
import { shouldAllowCampaignStepExecution } from '@/lib/marketing-campaign-controls';

const clean = (value: unknown) => String(value || '').trim();

const formatLocalDateTime = (value: string | Date) => new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(value instanceof Date ? value : new Date(value));

const buildProgressDescription = (task: Record<string, unknown>, note: string) => {
  const base = clean(task.description);
  return [base, '', note].filter(Boolean).join('\n').trim();
};

export async function publishInstagramStoryCampaignStep(args: { eventId: string; taskId: string; stepIndex: number; ignoreCampaignControls?: boolean }) {
  if (!adminDb) throw new Error('Firebase Admin not initialized');
  const { eventId, taskId, stepIndex, ignoreCampaignControls = false } = args;
  const taskRef = adminDb.collection('events').doc(eventId).collection('tasks').doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) throw new Error('Task not found');
  const task = (snap.data() || {}) as Record<string, unknown>;
  if (!ignoreCampaignControls && !shouldAllowCampaignStepExecution(task, `ig-${stepIndex}`)) {
    throw new Error(`Campaign window ig-${stepIndex} is paused or blocked`);
  }
  const payload = (task.payload || {}) as Record<string, unknown>;
  const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
  const step = storyPlan.find((item) => Number(item.stepIndex || 0) === stepIndex);
  if (!step) throw new Error(`Step ${stepIndex} not found`);

  const mediaUrls = Array.isArray(step.mediaUrls) ? step.mediaUrls.map(clean).filter(Boolean) : [];
  const originalImageUrl = mediaUrls[0];
  if (!originalImageUrl) throw new Error('No media URL for story step');

  const { accountId, accessToken } = await resolveInstagramAccountToken(clean(payload.accountId));
  if (!accountId || !accessToken) throw new Error('Instagram integration missing token/accountId');

  const convertedBuffer = await convertImageUrlToStoryBuffer(originalImageUrl);
  const bucket = admin.storage().bucket('patifon-events.firebasestorage.app');
  if (!bucket) throw new Error('Admin storage not initialized');
  const destPath = `events/${eventId}/stories/story-${Date.now()}-step${stepIndex}.jpg`;
  const file = bucket.file(destPath);
  await file.save(convertedBuffer, {
    contentType: 'image/jpeg',
    metadata: {
      metadata: {
        originalUrl: originalImageUrl,
        convertedFor: 'instagram-story',
        aspectRatio: '9:16',
      },
    },
  });
  const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });

  const version = 'v19.0';
  const params = new URLSearchParams();
  params.append('access_token', accessToken);
  params.append('media_type', 'STORIES');
  params.append('image_url', signedUrl);

  const createRes = await fetch(`https://graph.facebook.com/${version}/${accountId}/media?${params.toString()}`, { method: 'POST' });
  const createData = await createRes.json();
  if (createData.error) throw new Error(createData.error.message);
  const containerId = createData.id;

  let attempts = 0;
  while (attempts < 10) {
    const statusRes = await fetch(`https://graph.facebook.com/${version}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const statusData = await statusRes.json();
    if (statusData.status_code === 'FINISHED') break;
    if (statusData.status_code === 'ERROR' || statusData.status_code === 'EXPIRED') throw new Error('Media processing failed');
    await new Promise((r) => setTimeout(r, 3000));
    attempts += 1;
  }
  if (attempts >= 10) throw new Error('Timeout waiting for media');

  const publishParams = new URLSearchParams();
  publishParams.append('access_token', accessToken);
  publishParams.append('creation_id', containerId);
  const publishRes = await fetch(`https://graph.facebook.com/${version}/${accountId}/media_publish?${publishParams.toString()}`, { method: 'POST' });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(publishData.error.message);

  const nextPlan = storyPlan.map((item) => {
    const base = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)) as Record<string, unknown>;
    if (Number(item.stepIndex || 0) !== stepIndex) return base;
    return {
      ...base,
      status: 'POSTED',
      postedAt: new Date().toISOString(),
      convertedImagePath: destPath,
      publishedStoryId: publishData.id,
      error: '',
    };
  });
  const completed = nextPlan.filter((item) => clean(item.status) === 'POSTED').length;
  const total = nextPlan.length;
  const remaining = Math.max(0, total - completed);
  const nextPending = nextPlan.find((item) => !clean((item as Record<string, unknown>).status) || clean((item as Record<string, unknown>).status) === 'PENDING') as Record<string, unknown> | undefined;
  const note = [
    `בוצע: סטורי ${stepIndex} — ${clean(step.contentType) || 'story'} — ${formatLocalDateTime(new Date())}`,
    `  → פורסם ל-bengolano`,
    `  → Instagram Story ID: ${publishData.id}`,
    ``,
    `סטטוס נוכחי: ${completed} מתוך ${total} הושלמו`,
    `השלב הבא: ${nextPending ? `סטורי ${nextPending.stepIndex} — ${clean(nextPending.scheduledTime)}` : 'כל הסטוריז הושלמו ✅'}`,
  ].join('\n');

  await taskRef.update({
    payload: {
      ...payload,
      storyPlan: nextPlan,
      totalStoriesPosted: completed,
    },
    remainingCompletions: remaining,
    status: remaining === 0 ? 'DONE' : completed > 0 ? 'IN_PROGRESS' : 'TODO',
    currentStatus: `${completed} מתוך ${total} הושלמו`,
    nextStep: nextPending ? `סטורי ${nextPending.stepIndex} — ${clean(nextPending.scheduledTime)}` : 'הושלם ✅',
    description: buildProgressDescription(task, note),
    startedAt: (task as any).startedAt || FieldValue.serverTimestamp(),
    ...(remaining === 0 ? { completedAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true, storyId: publishData.id, convertedImagePath: destPath };
}

import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

const clean = (value: unknown) => String(value || '').trim();

export const getInstagramIntegration = async () => {
  if (!adminDb) throw new Error('Firebase Admin לא מוגדר');
  const snap = await adminDb.collection('integrations').doc('instagram').get();
  const data = (snap.data() || {}) as Record<string, unknown>;
  const accountId = clean(data.accountId);
  const accessToken = clean(data.accessToken);
  const accounts = Array.isArray(data.accounts) ? data.accounts as Record<string, unknown>[] : [];
  return { accountId, accessToken, accounts, raw: data };
};

export const resolveInstagramAccountToken = async (accountId: string) => {
  const integration = await getInstagramIntegration();
  const wanted = clean(accountId);
  const matching = integration.accounts.find((acc) => clean(acc.accountId) === wanted);
  return {
    accountId: wanted || integration.accountId,
    accessToken: integration.accessToken || clean(matching?.accessToken),
  };
};

export const syncInstagramStoryScheduledPosts = async (args: {
  eventId: string;
  taskId: string;
  payload: Record<string, unknown>;
}) => {
  if (!adminDb) throw new Error('Firebase Admin לא מוגדר');
  const eventId = clean(args.eventId);
  const taskId = clean(args.taskId);
  const payload = args.payload || {};
  const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
  const accountId = clean(payload.accountId);
  if (!eventId || !taskId || !storyPlan.length) return { ok: true, created: 0 };

  const integration = await resolveInstagramAccountToken(accountId);
  if (!integration.accountId || !integration.accessToken) {
    throw new Error('Instagram integration token/accountId missing');
  }

  let created = 0;
  for (const step of storyPlan) {
    const stepIndex = Number(step.stepIndex || 0);
    const scheduledTime = clean(step.scheduledTime);
    if (!stepIndex || !scheduledTime) continue;
    const scheduleTime = Math.floor(new Date(scheduledTime).getTime() / 1000);
    if (!Number.isFinite(scheduleTime)) continue;
    const mediaUrls = Array.isArray(step.mediaUrls) ? step.mediaUrls.map(clean).filter(Boolean) : [];
    const imageUrl = mediaUrls[0] || '';
    const videoUrl = '';
    const docId = `ig-story-${eventId}-${taskId}-step${stepIndex}`;
    await adminDb.collection('scheduled_posts').doc(docId).set({
      eventId,
      taskId,
      stepIndex,
      source: 'instagram_story_campaign_patifon',
      type: 'STORY',
      accountId: integration.accountId,
      accessToken: integration.accessToken,
      imageUrl,
      videoUrl: videoUrl || null,
      caption: '',
      scheduleTime,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    created += 1;
  }

  return { ok: true, created };
};

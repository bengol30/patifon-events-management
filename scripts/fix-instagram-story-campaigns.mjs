import admin from 'firebase-admin';
import fs from 'node:fs';

const serviceAccount = JSON.parse(fs.readFileSync('/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const clean = (value) => String(value || '').trim();

const integrationSnap = await db.collection('integrations').doc('instagram').get();
const integration = integrationSnap.data() || {};
const accounts = Array.isArray(integration.accounts) ? integration.accounts : [];
const defaultToken = clean(integration.accessToken);
const defaultAccountId = clean(integration.accountId);
const resolve = (accountId) => {
  const wanted = clean(accountId);
  const match = accounts.find((acc) => clean(acc.accountId) === wanted);
  return {
    accountId: wanted || defaultAccountId,
    accessToken: clean(match?.accessToken) || defaultToken,
  };
};

const events = await db.collection('events').get();
const updates = [];
for (const ev of events.docs) {
  const tasksSnap = await ev.ref.collection('tasks').where('specialType', '==', 'instagram_story_campaign_patifon').get();
  for (const taskDoc of tasksSnap.docs) {
    const data = taskDoc.data();
    const payload = data.payload || {};
    const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan : [];
    if (!storyPlan.length) continue;
    const resolved = resolve(payload.accountId);
    for (const step of storyPlan) {
      const stepIndex = Number(step.stepIndex || 0);
      const scheduledTime = clean(step.scheduledTime);
      if (!stepIndex || !scheduledTime) continue;
      const scheduleTime = Math.floor(new Date(scheduledTime).getTime() / 1000);
      const mediaUrls = Array.isArray(step.mediaUrls) ? step.mediaUrls.map(clean).filter(Boolean) : [];
      const docId = `ig-story-${ev.id}-${taskDoc.id}-step${stepIndex}`;
      await db.collection('scheduled_posts').doc(docId).set({
        eventId: ev.id,
        taskId: taskDoc.id,
        stepIndex,
        source: 'instagram_story_campaign_patifon',
        type: 'STORY',
        accountId: resolved.accountId,
        accessToken: resolved.accessToken,
        imageUrl: mediaUrls[0] || '',
        videoUrl: null,
        caption: '',
        scheduleTime,
        status: 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    updates.push({ eventId: ev.id, taskId: taskDoc.id, storyCount: storyPlan.length });
  }
}
console.log(JSON.stringify({ ok: true, updatedTasks: updates.length, updates }, null, 2));

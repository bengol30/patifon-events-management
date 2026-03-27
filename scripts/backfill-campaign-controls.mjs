import admin from 'firebase-admin';
import fs from 'fs';

const dryRun = !process.argv.includes('--apply');
const onlyEventId = process.argv.find((arg) => arg.startsWith('--event='))?.split('=')[1] || '';

const clean = (value) => String(value || '').trim();

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  ? JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'))
  : {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  const fallbackPath = '/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json';
  if (fs.existsSync(fallbackPath)) {
    Object.assign(serviceAccount, JSON.parse(fs.readFileSync(fallbackPath, 'utf8')));
  }
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const buildControls = (task) => {
  const payload = task.payload || {};
  let windows = [];
  if (task.specialType === 'whatsapp_campaign_patifon') {
    const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan : [];
    windows = sendPlan.map((step, index) => ({
      stepKey: `wa-${Number(step.step || index + 1)}`,
      enabled: clean(step.status).toUpperCase() !== 'CANCELLED',
      scheduledAt: clean(step.scheduledAt),
      label: clean(step.scheduledLabel) || `שליחה ${Number(step.step || index + 1)}`,
    })).filter((item) => item.scheduledAt);
  } else if (task.specialType === 'instagram_story_campaign_patifon') {
    const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan : [];
    windows = storyPlan.map((step, index) => ({
      stepKey: `ig-${Number(step.stepIndex || index + 1)}`,
      enabled: clean(step.status).toUpperCase() !== 'CANCELLED',
      scheduledAt: clean(step.scheduledTime),
      label: `סטורי ${Number(step.stepIndex || index + 1)}`,
    })).filter((item) => item.scheduledAt);
  }
  const hasEnabled = windows.some((window) => window.enabled);
  return {
    status: hasEnabled ? 'ACTIVE' : 'WINDOW_BLOCKED',
    windows,
    lastManualRunAt: task.campaignControls?.lastManualRunAt || null,
    lastManualRunStepKey: task.campaignControls?.lastManualRunStepKey || null,
  };
};

const inferStartedAt = (task) => {
  if (task.startedAt) return null;
  if (task.status !== 'IN_PROGRESS' && task.status !== 'DONE') return null;
  return admin.firestore.FieldValue.serverTimestamp();
};

const inferCompletedAt = (task) => {
  if (task.completedAt) return null;
  if (task.status !== 'DONE') return null;
  return admin.firestore.FieldValue.serverTimestamp();
};

const main = async () => {
  const eventsSnap = onlyEventId
    ? { docs: [await db.collection('events').doc(onlyEventId).get()].filter((doc) => doc.exists) }
    : await db.collection('events').get();

  const changes = [];

  for (const eventDoc of eventsSnap.docs) {
    const tasksSnap = await eventDoc.ref.collection('tasks').get();
    for (const taskDoc of tasksSnap.docs) {
      const task = { id: taskDoc.id, ...taskDoc.data() };
      if (!['whatsapp_campaign_patifon', 'instagram_story_campaign_patifon'].includes(task.specialType)) continue;

      const nextControls = buildControls(task);
      const needsControls = !task.campaignControls || JSON.stringify(task.campaignControls?.windows || []) !== JSON.stringify(nextControls.windows) || clean(task.campaignControls?.status) !== nextControls.status;
      const startedAt = inferStartedAt(task);
      const completedAt = inferCompletedAt(task);

      if (!needsControls && !startedAt && !completedAt) continue;

      changes.push({
        eventId: eventDoc.id,
        taskId: taskDoc.id,
        title: task.title || '',
        specialType: task.specialType,
        needsControls,
        addStartedAt: !!startedAt,
        addCompletedAt: !!completedAt,
        controls: nextControls,
      });

      if (!dryRun) {
        const update = {};
        if (needsControls) update.campaignControls = nextControls;
        if (startedAt) update.startedAt = startedAt;
        if (completedAt) update.completedAt = completedAt;
        update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await taskDoc.ref.update(update);
      }
    }
  }

  console.log(JSON.stringify({ dryRun, onlyEventId: onlyEventId || null, changeCount: changes.length, changes }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

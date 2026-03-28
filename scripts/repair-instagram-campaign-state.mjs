import admin from 'firebase-admin';
import fs from 'fs';

const [, , eventId, taskId, ...flags] = process.argv;
const apply = flags.includes('--apply');
const clean = (value) => String(value || '').trim();

if (!eventId || !taskId) {
  console.error('Usage: node scripts/repair-instagram-campaign-state.mjs <eventId> <taskId> [--apply]');
  process.exit(1);
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  ? JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'))
  : {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  const fallbackPath = '/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json';
  if (fs.existsSync(fallbackPath)) Object.assign(serviceAccount, JSON.parse(fs.readFileSync(fallbackPath, 'utf8')));
}
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const main = async () => {
  const taskRef = db.collection('events').doc(eventId).collection('tasks').doc(taskId);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) throw new Error('Task not found');
  const task = taskSnap.data() || {};
  const payload = task.payload || {};
  const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan : [];
  const posted = storyPlan.filter((step) => clean(step.status) === 'POSTED').length;
  const failed = storyPlan.filter((step) => clean(step.status) === 'FAILED').length;
  const pending = storyPlan.filter((step) => !clean(step.status) || clean(step.status) === 'PENDING').length;
  const total = storyPlan.length;
  const shouldBeDone = total > 0 && posted === total;
  const nextPending = storyPlan.find((step) => {
    const status = clean(step.status);
    return !status || status === 'PENDING' || status === 'FAILED';
  });

  const patch = {
    status: shouldBeDone ? 'DONE' : (posted > 0 || failed > 0 ? 'IN_PROGRESS' : 'TODO'),
    remainingCompletions: Math.max(0, total - posted),
    currentStatus: shouldBeDone
      ? `${posted} מתוך ${total} הושלמו`
      : failed > 0
        ? `${posted} מתוך ${total} הושלמו · ${failed} נכשלו`
        : `${posted} מתוך ${total} הושלמו`,
    nextStep: shouldBeDone
      ? 'הושלם ✅'
      : nextPending
        ? `סטורי ${nextPending.stepIndex} — ${clean(nextPending.scheduledTime)}${clean(nextPending.status) === 'FAILED' ? ' (דורש תיקון)' : ''}`
        : 'ממתין לבדיקה',
    completedAt: shouldBeDone ? (task.completedAt || admin.firestore.FieldValue.serverTimestamp()) : admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const result = { eventId, taskId, posted, failed, pending, total, currentStatus: task.currentStatus, currentTaskStatus: task.status, patch, apply };
  console.log(JSON.stringify(result, null, 2));
  if (apply) await taskRef.update(patch);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import admin from 'firebase-admin';
import fs from 'node:fs';

const serviceAccount = JSON.parse(fs.readFileSync('/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function normalizeStep(step, index, payload) {
  if (step && typeof step.step === 'number' && step.scheduledAt && Array.isArray(step.targetGroups)) {
    return {
      ...step,
      status: step.status || 'PENDING',
      messageText: step.messageText || payload.messageText || '',
    };
  }
  const scheduledAt = step?.scheduledTime || step?.scheduledAt || null;
  const targetGroups = Array.isArray(step?.targetGroups) ? step.targetGroups : (Array.isArray(step?.groups) ? step.groups : payload.targetGroups || []);
  return {
    step: index + 1,
    scheduledAt,
    scheduledAtLocal: step?.scheduledAtLocal || '',
    scheduledLabel: step?.scheduledLabel || step?.label || `שליחה ${index + 1}`,
    status: step?.status || 'PENDING',
    targetGroups,
    messageText: step?.messageText || step?.messageVariant || payload.messageText || '',
    error: step?.error || '',
    sentAt: step?.sentAt || '',
    sentAtLocal: step?.sentAtLocal || '',
  };
}

const events = await db.collection('events').get();
const updates = [];
for (const ev of events.docs) {
  const tasks = await ev.ref.collection('tasks').where('specialType', '==', 'whatsapp_campaign_patifon').get();
  for (const taskDoc of tasks.docs) {
    const data = taskDoc.data();
    const payload = data.payload || {};
    const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan : [];
    if (!sendPlan.length) continue;
    const normalizedPlan = sendPlan.map((step, index) => normalizeStep(step, index, payload));
    const firstScheduledAt = normalizedPlan[0]?.scheduledAt || data.dueDate || null;
    const completedCount = normalizedPlan.filter((step) => step.status === 'SENT').length;
    const remaining = Math.max(0, normalizedPlan.length - completedCount);
    const nextPending = normalizedPlan.find((step) => step.status === 'PENDING');
    const nextStatus = remaining === 0 ? 'DONE' : completedCount > 0 ? 'IN_PROGRESS' : 'TODO';
    await taskDoc.ref.update({
      executionMode: 'AUTOMATED',
      scheduledAt: firstScheduledAt,
      scheduleStatus: nextStatus === 'DONE' ? 'DONE' : 'PENDING',
      status: nextStatus,
      remainingCompletions: remaining,
      requiredCompletions: normalizedPlan.length,
      currentStatus: `${completedCount} מתוך ${normalizedPlan.length} הושלמו`,
      nextStep: nextPending ? (nextPending.scheduledLabel || `שליחה ${nextPending.step}`) : 'הקמפיין הושלם',
      payload: {
        ...payload,
        sendPlan: normalizedPlan,
        messageVariants: normalizedPlan.map((step) => step.messageText),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    updates.push({ eventId: ev.id, taskId: taskDoc.id, title: data.title, normalizedPlanCount: normalizedPlan.length });
  }
}
console.log(JSON.stringify({ ok: true, updated: updates.length, updates }, null, 2));

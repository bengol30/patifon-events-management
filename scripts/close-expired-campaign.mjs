#!/usr/bin/env node
/**
 * Close an expired Instagram campaign when the event has passed
 */

import admin from 'firebase-admin';
import fs from 'fs';

const localVaultPath = '/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json';
const serviceAccount = JSON.parse(fs.readFileSync(localVaultPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function closeExpiredCampaign(eventId, taskId) {
  console.log(`🔒 Closing expired campaign ${taskId}...\n`);

  const taskRef = db.collection('events').doc(eventId).collection('tasks').doc(taskId);
  const taskSnap = await taskRef.get();
  
  if (!taskSnap.exists) {
    console.error('❌ Task not found');
    return false;
  }

  const task = taskSnap.data();
  const storyPlan = task.payload?.storyPlan || [];

  // Mark all pending stories as SKIPPED
  const updatedPlan = storyPlan.map((step) => {
    if (step.status === 'pending' || !step.status) {
      return {
        ...step,
        status: 'SKIPPED',
        skippedReason: 'Event already passed',
        skippedAt: new Date().toISOString(),
      };
    }
    return step;
  });

  const postedCount = updatedPlan.filter((s) => s.status === 'POSTED').length;
  const skippedCount = updatedPlan.filter((s) => s.status === 'SKIPPED').length;

  // Update task
  await taskRef.update({
    status: 'DONE',
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    'payload.storyPlan': updatedPlan,
    currentStatus: `הקמפיין הושלם: ${postedCount} פורסמו, ${skippedCount} דולגו`,
    nextStep: 'הקמפיין הושלם ✅',
    description: (task.description || '') + `\n\n🔒 הקמפיין נסגר אוטומטית (${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}):\n- ${postedCount} סטוריז פורסמו\n- ${skippedCount} סטוריז דולגו (האירוע כבר עבר)\n\nהקמפיין סומן כהושלם.`,
  });

  // Mark all pending scheduled_posts as done/skipped
  const scheduledSnap = await db
    .collection('scheduled_posts')
    .where('eventId', '==', eventId)
    .where('taskId', '==', taskId)
    .where('status', '==', 'pending')
    .get();

  const batch = db.batch();
  scheduledSnap.docs.forEach((doc) => {
    batch.update(doc.ref, {
      status: 'skipped',
      lastError: 'Campaign closed - event already passed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  if (!batch._ops || batch._ops.length > 0) {
    await batch.commit();
  }

  console.log(`✅ Campaign closed successfully`);
  console.log(`   Posted: ${postedCount}`);
  console.log(`   Skipped: ${skippedCount}`);
  console.log(`   Scheduled posts cleaned: ${scheduledSnap.size}`);

  return true;
}

const [eventId, taskId] = process.argv.slice(2);

if (!eventId || !taskId) {
  console.error('Usage: node close-expired-campaign.mjs <eventId> <taskId>');
  process.exit(1);
}

closeExpiredCampaign(eventId, taskId)
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

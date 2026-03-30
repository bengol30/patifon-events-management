#!/usr/bin/env node
/**
 * Daily campaign maintenance - runs automatically to prevent common issues
 * 
 * What it does:
 * 1. Refreshes content for active campaigns (fixes content drift)
 * 2. Closes expired campaigns (when event has passed)
 * 3. Handles overdue stories intelligently
 * 4. Reports summary
 * 
 * Run this daily via cron: 0 9 * * * (9 AM)
 */

import admin from 'firebase-admin';
import fs from 'fs';
import { parseISO, isPast, differenceInDays } from 'date-fns';

const localVaultPath = '/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json';
const serviceAccount = JSON.parse(fs.readFileSync(localVaultPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const clean = (value) => String(value || '').trim();

async function refreshCampaignContent(eventId, taskId) {
  const taskRef = db.collection('events').doc(eventId).collection('tasks').doc(taskId);
  const taskSnap = await taskRef.get();
  
  if (!taskSnap.exists) return { ok: false, reason: 'task not found' };
  
  const task = taskSnap.data();
  const eventSnap = await db.collection('events').doc(eventId).get();
  const event = eventSnap.data();
  
  if (!event) return { ok: false, reason: 'event not found' };
  
  // Get current event content
  const currentText = clean(event.officialPostText || event.description || '');
  const currentMediaUrls = [
    event.officialFlyerUrl,
    event.coverImageUrl,
    event.imageUrl,
  ].filter(Boolean);
  
  // Check if update needed
  const payload = task.payload || {};
  const payloadText = clean(payload.messageText || '');
  const payloadMediaUrls = Array.isArray(payload.mediaUrls) ? payload.mediaUrls : [];
  
  const textChanged = currentText !== payloadText;
  const mediaChanged = JSON.stringify(currentMediaUrls.sort()) !== JSON.stringify(payloadMediaUrls.sort());
  
  if (!textChanged && !mediaChanged) {
    return { ok: true, updated: false, reason: 'no drift' };
  }
  
  // Update payload
  await taskRef.update({
    'payload.messageText': currentText,
    'payload.mediaUrls': currentMediaUrls,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  return { ok: true, updated: true, textChanged, mediaChanged };
}

async function closeExpiredCampaign(eventId, taskId, eventDate) {
  const taskRef = db.collection('events').doc(eventId).collection('tasks').doc(taskId);
  const taskSnap = await taskRef.get();
  
  if (!taskSnap.exists) return { ok: false, reason: 'task not found' };
  
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
  
  // Mark all pending scheduled_posts as skipped
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
  
  return { ok: true, postedCount, skippedCount, scheduledCleaned: scheduledSnap.size };
}

async function dailyMaintenance() {
  console.log('🔧 Starting daily campaign maintenance...\n');
  
  const now = new Date();
  const stats = {
    checked: 0,
    refreshed: 0,
    closed: 0,
    errors: [],
  };
  
  const eventsSnap = await db.collection('events').get();
  
  for (const eventDoc of eventsSnap.docs) {
    const tasksSnap = await eventDoc.ref.collection('tasks').get();
    
    for (const taskDoc of tasksSnap.docs) {
      const task = taskDoc.data();
      const specialType = clean(task.specialType);
      
      if (specialType !== 'instagram_story_campaign_patifon') continue;
      if (clean(task.status) === 'DONE') continue;
      
      stats.checked++;
      
      const eventId = eventDoc.id;
      const taskId = taskDoc.id;
      const eventSnap = await eventDoc.ref.get();
      const event = eventSnap.data();
      
      // Check if event has passed
      const eventDateStr = clean(event.date || event.eventDate || '');
      let eventPassed = false;
      
      if (eventDateStr) {
        try {
          const eventDate = parseISO(eventDateStr);
          eventPassed = isPast(eventDate) && differenceInDays(now, eventDate) >= 1;
        } catch (e) {
          // Invalid date, skip
        }
      }
      
      if (eventPassed) {
        console.log(`🔒 Closing expired campaign: ${clean(task.title)} (${eventId})`);
        try {
          const result = await closeExpiredCampaign(eventId, taskId, eventDateStr);
          if (result.ok) {
            stats.closed++;
            console.log(`   ✅ Closed: ${result.postedCount} posted, ${result.skippedCount} skipped\n`);
          } else {
            stats.errors.push(`Failed to close ${taskId}: ${result.reason}`);
          }
        } catch (error) {
          stats.errors.push(`Error closing ${taskId}: ${error.message}`);
        }
        continue;
      }
      
      // Refresh content for active campaigns
      console.log(`🔄 Refreshing content: ${clean(task.title)} (${eventId})`);
      try {
        const result = await refreshCampaignContent(eventId, taskId);
        if (result.ok && result.updated) {
          stats.refreshed++;
          const changes = [];
          if (result.textChanged) changes.push('text');
          if (result.mediaChanged) changes.push('media');
          console.log(`   ✅ Updated: ${changes.join(', ')}\n`);
        } else if (result.ok) {
          console.log(`   ⏭️  No drift detected\n`);
        } else {
          stats.errors.push(`Failed to refresh ${taskId}: ${result.reason}`);
        }
      } catch (error) {
        stats.errors.push(`Error refreshing ${taskId}: ${error.message}`);
      }
    }
  }
  
  // Summary
  console.log('📊 Daily maintenance summary:');
  console.log(`   Checked: ${stats.checked} campaigns`);
  console.log(`   Refreshed: ${stats.refreshed} campaigns`);
  console.log(`   Closed: ${stats.closed} expired campaigns`);
  
  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    stats.errors.forEach((error, i) => {
      console.log(`   ${i + 1}. ${error}`);
    });
    return false;
  }
  
  console.log('\n✅ Daily maintenance completed successfully!');
  return true;
}

dailyMaintenance()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

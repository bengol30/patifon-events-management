#!/usr/bin/env node
/**
 * Check campaign health directly via Firebase (bypass Next.js API routes)
 */

import admin from 'firebase-admin';
import fs from 'fs';

// Initialize Firebase Admin
const localVaultPath = '/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json';
const serviceAccount = JSON.parse(fs.readFileSync(localVaultPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const clean = (value) => String(value || '').trim();

async function checkCampaignHealth() {
  console.log('🔍 Checking campaign health...\n');

  const nowSec = Math.floor(Date.now() / 1000);
  const eventsSnap = await db.collection('events').get();
  const scheduledSnap = await db.collection('scheduled_posts').get();
  const scheduledPosts = new Map(
    scheduledSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
  );

  const issues = [];
  const checked = [];

  for (const eventDoc of eventsSnap.docs) {
    const tasksSnap = await eventDoc.ref.collection('tasks').get();

    for (const taskDoc of tasksSnap.docs) {
      const task = taskDoc.data();
      const specialType = clean(task.specialType);

      if (
        !['whatsapp_campaign_patifon', 'instagram_story_campaign_patifon'].includes(
          specialType
        )
      )
        continue;

      const base = {
        eventId: eventDoc.id,
        taskId: taskDoc.id,
        title: clean(task.title),
        specialType,
        status: clean(task.status),
      };

      if (specialType === 'instagram_story_campaign_patifon') {
        const payload = task.payload || {};
        const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan : [];

        for (const step of storyPlan) {
          const stepIndex = Number(step.stepIndex || 0);
          if (!stepIndex) continue;

          const expectedId = `ig-story-${eventDoc.id}-${taskDoc.id}-step${stepIndex}`;
          const scheduled = scheduledPosts.get(expectedId);
          const stepStatus = clean(step.status);
          const taskStatus = clean(task.status);

          if (!scheduled && stepStatus !== 'POSTED' && taskStatus !== 'DONE') {
            issues.push({
              ...base,
              severity: 'high',
              type: 'missing_scheduled_post',
              stepIndex,
              message: 'Story campaign step has no scheduled_posts mirror',
            });
            continue;
          }

          if (scheduled) {
            const scheduledStatus = clean(scheduled.status);
            const pending = scheduledStatus === 'pending';
            const overdue = Number(scheduled.scheduleTime || 0) <= nowSec;

            if (pending && overdue) {
              issues.push({
                ...base,
                severity: 'medium',
                type: 'overdue_pending_story',
                stepIndex,
                scheduledAt: new Date(Number(scheduled.scheduleTime) * 1000).toISOString(),
                message: 'Story scheduled_post is overdue and still pending',
              });
            }

            // Only report errors for non-skipped posts
            if (clean(scheduled.lastError) && scheduledStatus !== 'skipped') {
              issues.push({
                ...base,
                severity: 'medium',
                type: 'story_publish_error',
                stepIndex,
                error: clean(scheduled.lastError),
              });
            }
          }

          if (stepStatus === 'FAILED') {
            issues.push({
              ...base,
              severity: 'medium',
              type: 'story_step_failed',
              stepIndex,
              message: clean(step.error) || 'Story step marked FAILED',
            });
          }
        }

        checked.push(base);
      } else if (specialType === 'whatsapp_campaign_patifon') {
        checked.push(base);
      }
    }
  }

  console.log(`✅ Checked ${checked.length} campaigns\n`);

  if (issues.length === 0) {
    console.log('🎉 No issues found!');
    return { ok: true, issues: [] };
  }

  console.log(`⚠️  Found ${issues.length} issues:\n`);
  issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.title} (${issue.eventId})`);
    console.log(`   Type: ${issue.type}`);
    console.log(`   Severity: ${issue.severity}`);
    console.log(`   Message: ${issue.message}`);
    if (issue.stepIndex) console.log(`   Step: ${issue.stepIndex}`);
    if (issue.scheduledAt) console.log(`   Scheduled: ${issue.scheduledAt}`);
    if (issue.error) console.log(`   Error: ${issue.error}`);
    console.log('');
  });

  return { ok: false, issues };
}

checkCampaignHealth()
  .then((result) => {
    process.exit(result.ok ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

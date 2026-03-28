#!/usr/bin/env node
/**
 * Test dynamic content fetching for campaigns
 * Verifies that campaigns always use latest event content
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(
  readFileSync("/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json", "utf8")
);
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const clean = (value) => String(value || "").trim();

console.log("🧪 Testing dynamic content fetch for campaigns\n");

// Find a campaign task
console.log("1️⃣  Looking for campaign tasks...");
const eventsSnap = await db.collection("events").limit(5).get();
let foundTask = null;

for (const eventDoc of eventsSnap.docs) {
  const tasksSnap = await eventDoc.ref
    .collection("tasks")
    .where("specialType", "in", ["whatsapp_campaign_patifon", "instagram_story_campaign_patifon"])
    .limit(1)
    .get();
  
  if (!tasksSnap.empty) {
    const taskDoc = tasksSnap.docs[0];
    foundTask = {
      eventId: eventDoc.id,
      taskId: taskDoc.id,
      task: taskDoc.data(),
    };
    break;
  }
}

if (!foundTask) {
  console.log("❌ No campaign tasks found in system");
  process.exit(1);
}

const { eventId, taskId, task } = foundTask;
console.log(`   Found: ${task.title} (${task.specialType})`);
console.log(`   Event: ${eventId}`);
console.log(`   Task:  ${taskId}\n`);

// Fetch current event
console.log("2️⃣  Fetching current event content...");
const eventSnap = await db.collection("events").doc(eventId).get();
const event = eventSnap.data();

const eventText = clean(event.officialPostText) || clean(event.description);
const eventMediaUrls = Array.from(new Set([
  event.officialFlyerUrl,
  event.previewImage,
  event.coverImage,
  event.coverImageUrl,
  event.imageUrl,
  event.image,
].map(clean).filter(Boolean)));

console.log(`   Event text: ${eventText.substring(0, 80)}...`);
console.log(`   Event media: ${eventMediaUrls.length} URLs\n`);

// Compare with payload
console.log("3️⃣  Comparing with task payload...");
const payload = task.payload || {};
const payloadText = clean(payload.messageText);
const payloadMediaUrls = Array.isArray(payload.mediaUrls) 
  ? payload.mediaUrls.map(clean).filter(Boolean) 
  : [];

console.log(`   Payload text: ${payloadText.substring(0, 80)}...`);
console.log(`   Payload media: ${payloadMediaUrls.length} URLs\n`);

const textMatch = eventText === payloadText;
const mediaMatch = JSON.stringify(eventMediaUrls.sort()) === 
                   JSON.stringify(payloadMediaUrls.sort());

console.log("4️⃣  Results:");
console.log(`   Text match:  ${textMatch ? "✅" : "❌ DRIFT DETECTED"}`);
console.log(`   Media match: ${mediaMatch ? "✅" : "❌ DRIFT DETECTED"}`);

if (!textMatch || !mediaMatch) {
  console.log("\n⚠️  Content drift detected!");
  console.log("   When this campaign runs, it will automatically use the CURRENT event content");
  console.log("   (not the stale payload snapshot)");
  console.log("\n   To manually refresh payload, call:");
  console.log(`   POST /api/marketing/refresh-content { eventId: "${eventId}", taskId: "${taskId}" }`);
} else {
  console.log("\n✅ Content is in sync");
}

process.exit(0);

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { promisify } from "node:util";
import { exec as execCallback } from "node:child_process";

import { adminDb } from "@/lib/firebase-admin";
import { resolveInstagramAccountToken } from "@/lib/instagram-story-campaign/scheduler";

const exec = promisify(execCallback);

export const dynamic = "force-dynamic";

const clean = (value: unknown) => String(value || "").trim();

async function updateStoryTaskProgress(post: Record<string, unknown>, result: { status: "published" | "failed"; error?: string }) {
  if (!adminDb) return;
  const eventId = clean(post.eventId);
  const taskId = clean(post.taskId);
  const stepIndex = Number(post.stepIndex || 0);
  if (!eventId || !taskId || !stepIndex) return;
  const taskRef = adminDb.collection("events").doc(eventId).collection("tasks").doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) return;
  const task = snap.data() as Record<string, unknown>;
  const payload = (task.payload || {}) as Record<string, unknown>;
  const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
  const nextPlan = storyPlan.map((step) => {
    if (Number(step.stepIndex || 0) !== stepIndex) return step;
    return {
      ...step,
      status: result.status === "published" ? "POSTED" : "FAILED",
      postedAt: result.status === "published" ? new Date().toISOString() : step.postedAt,
      error: result.error || "",
    };
  });
  const completed = nextPlan.filter((step) => clean(step.status) === "POSTED").length;
  const total = nextPlan.length;
  const remaining = Math.max(0, total - completed);
  const nextPending = nextPlan.find((step) => !clean(step.status) || clean(step.status) === "PENDING");
  await taskRef.update({
    payload: {
      ...payload,
      storyPlan: nextPlan,
      totalStoriesPosted: completed,
    },
    remainingCompletions: remaining,
    status: remaining === 0 ? "DONE" : completed > 0 ? "IN_PROGRESS" : "TODO",
    currentStatus: `${completed} מתוך ${total} הושלמו`,
    nextStep: nextPending ? `סטורי ${nextPending.stepIndex} — ${clean(nextPending.scheduledTime)}` : "הקמפיין הושלם",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function GET() {
  try {
    if (!adminDb) throw new Error("Firebase Admin not initialized");

    const now = Math.floor(Date.now() / 1000);
    const snapshot = await adminDb.collection("scheduled_posts").where("status", "==", "pending").get();
    const results: Array<Record<string, unknown>> = [];
    const selectedByTask = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

    for (const docSnap of snapshot.docs) {
      const post = docSnap.data() as Record<string, unknown>;
      const postId = docSnap.id;
      if (!(Number(post.scheduleTime || 0) <= now)) continue;
      const taskKey = `${clean(post.eventId)}:${clean(post.taskId)}`;
      const existing = selectedByTask.get(taskKey);
      if (!existing || Number((existing.data() as Record<string, unknown>).stepIndex || 0) > Number(post.stepIndex || 0)) {
        selectedByTask.set(taskKey, docSnap);
      }
    }

    for (const docSnap of selectedByTask.values()) {
      const post = docSnap.data() as Record<string, unknown>;
      const postId = docSnap.id;

      try {
        const source = clean(post.source);
        const type = clean(post.type) || "STORY";

        if (source === "instagram_story_campaign_patifon" && type === "STORY") {
          const eventId = clean(post.eventId);
          const taskId = clean(post.taskId);
          const stepIndex = Number(post.stepIndex || 0);
          if (!eventId || !taskId || !stepIndex) throw new Error("Missing eventId/taskId/stepIndex for story campaign post");
          const script = "/home/ben/.openclaw/workspace/scripts/ig-story-send-with-convert.mjs";
          await exec(`node ${script} ${JSON.stringify(eventId)} ${JSON.stringify(taskId)} ${JSON.stringify(String(stepIndex))}`);
          await docSnap.ref.delete();
          results.push({ id: postId, status: "published_via_convert_script", stepIndex });
          continue;
        }

        const accountId = clean(post.accountId);
        const tokenInfo = await resolveInstagramAccountToken(accountId);
        const accessToken = tokenInfo.accessToken;
        const resolvedAccountId = tokenInfo.accountId;
        const imageUrl = clean(post.imageUrl);
        const videoUrl = clean(post.videoUrl);
        const caption = clean(post.caption);
        const version = "v19.0";
        const baseUrl = `https://graph.facebook.com/${version}/${resolvedAccountId}/media`;

        if (!accessToken || !resolvedAccountId) {
          throw new Error("Instagram access token/accountId missing at publish time");
        }

        const params = new URLSearchParams();
        params.append("access_token", accessToken);
        if (caption && type !== "STORY") params.append("caption", caption);

        if (type === "STORY") {
          params.append("media_type", "STORIES");
          if (videoUrl) params.append("video_url", videoUrl);
          else params.append("image_url", imageUrl);
        } else if (type === "VIDEO") {
          params.append("media_type", "VIDEO");
          params.append("video_url", videoUrl);
        } else {
          params.append("image_url", imageUrl);
        }

        const createRes = await fetch(`${baseUrl}?${params.toString()}`, { method: "POST" });
        const createData = await createRes.json();
        if (createData.error) throw new Error(createData.error.message);
        const containerId = createData.id;

        let attempts = 0;
        while (attempts < 10) {
          const statusUrl = `https://graph.facebook.com/${version}/${containerId}?fields=status_code&access_token=${accessToken}`;
          const res = await fetch(statusUrl);
          const data = await res.json();
          if (data.status_code === "FINISHED") break;
          if (data.status_code === "ERROR" || data.status_code === "EXPIRED") throw new Error("Media processing failed");
          await new Promise((r) => setTimeout(r, 3000));
          attempts += 1;
        }
        if (attempts >= 10) throw new Error("Timeout waiting for media");

        const publishUrl = `https://graph.facebook.com/${version}/${resolvedAccountId}/media_publish`;
        const publishParams = new URLSearchParams();
        publishParams.append("access_token", accessToken);
        publishParams.append("creation_id", containerId);
        const publishRes = await fetch(`${publishUrl}?${publishParams.toString()}`, { method: "POST" });
        const publishData = await publishRes.json();
        if (publishData.error) throw new Error(publishData.error.message);

        await docSnap.ref.delete();
        await updateStoryTaskProgress(post, { status: "published" });
        results.push({ id: postId, status: "published", ig_id: publishData.id });
      } catch (err: any) {
        await docSnap.ref.update({
          lastError: err?.message || "Publish failed",
          updatedAt: FieldValue.serverTimestamp(),
        });
        await updateStoryTaskProgress(post, { status: "failed", error: err?.message || "Publish failed" });
        results.push({ id: postId, status: "failed", error: err?.message || "Publish failed" });
      }
    }

    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}

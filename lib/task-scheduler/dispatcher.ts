import crypto from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { normalizeTaskSchedule, parseScheduledAt } from "./normalize";

const OPENCLAW_TASK_WEBHOOK_URL = process.env.OPENCLAW_TASK_WEBHOOK_URL || "";
const OPENCLAW_TASK_WEBHOOK_SECRET = process.env.OPENCLAW_TASK_WEBHOOK_SECRET || "";

const buildHeaders = (payload: string): Record<string, string> => {
  if (!OPENCLAW_TASK_WEBHOOK_SECRET) {
    return { "Content-Type": "application/json" };
  }
  const signature = crypto.createHmac("sha256", OPENCLAW_TASK_WEBHOOK_SECRET).update(payload).digest("hex");
  return {
    "Content-Type": "application/json",
    "X-OpenClaw-Signature": signature,
  };
};

const getPendingTaskDocs = async () => {
  if (!adminDb) return [] as FirebaseFirestore.QueryDocumentSnapshot[];

  try {
    const tasksSnap = await adminDb
      .collectionGroup("tasks")
      .where("scheduleStatus", "==", "PENDING")
      .limit(50)
      .get();
    return tasksSnap.docs;
  } catch (error) {
    console.warn("collectionGroup scheduler query failed, falling back to per-event scan", error);

    const eventDocs = await adminDb.collection("events").limit(100).get();
    const taskDocGroups = await Promise.all(
      eventDocs.docs.map(async (eventDoc) => {
        const tasksSnap = await eventDoc.ref
          .collection("tasks")
          .where("scheduleStatus", "==", "PENDING")
          .limit(20)
          .get();
        return tasksSnap.docs;
      }),
    );

    return taskDocGroups.flat();
  }
};

export const triggerScheduledTasks = async () => {
  if (!adminDb) {
    throw new Error("Firebase Admin לא מוגדר. אי אפשר להריץ scheduler למשימות כרגע.");
  }

  const now = new Date();
  const runId = crypto.randomUUID();
  const taskDocs = await getPendingTaskDocs();

  const dueDocs = taskDocs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const scheduledAt = parseScheduledAt(data.scheduledAt);
    return !!scheduledAt && scheduledAt.getTime() <= now.getTime();
  });

  const results: Array<{ taskId: string; eventId?: string; title?: string; status: string; detail?: string }> = [];

  for (const taskDoc of dueDocs) {
    const taskData = taskDoc.data() as Record<string, unknown>;
    const schedule = normalizeTaskSchedule(taskData);
    const eventRef = taskDoc.ref.parent.parent;
    const eventId = eventRef?.id || undefined;
    const title = String(taskData.title || "משימה ללא שם");

    await taskDoc.ref.update({
      scheduleStatus: "TRIGGERED",
      triggerLockId: runId,
      lastTriggeredAt: FieldValue.serverTimestamp(),
      schedulerLastRunAt: FieldValue.serverTimestamp(),
    });

    const payload = {
      source: "PATIFON_TASK_SCHEDULER",
      runId,
      taskId: taskDoc.id,
      eventId,
      title,
      executionMode: schedule.executionMode,
      scheduledAt: schedule.scheduledAt?.toISOString() || null,
      agentInstruction: schedule.agentInstruction || title,
      payload: schedule.payload || {},
      taskPath: taskDoc.ref.path,
    };

    let dispatched = false;
    if (OPENCLAW_TASK_WEBHOOK_URL) {
      try {
        const body = JSON.stringify(payload);
        const res = await fetch(OPENCLAW_TASK_WEBHOOK_URL, {
          method: "POST",
          headers: buildHeaders(body),
          body,
        });
        if (!res.ok) {
          throw new Error(`Webhook failed (${res.status})`);
        }
        dispatched = true;
      } catch (error) {
        await taskDoc.ref.update({
          scheduleStatus: "FAILED",
          executionResult: error instanceof Error ? error.message : "Webhook dispatch failed",
        });
        results.push({ taskId: taskDoc.id, eventId, title, status: "FAILED", detail: error instanceof Error ? error.message : "Webhook dispatch failed" });
        continue;
      }
    }

    if (!dispatched) {
      await adminDb.collection("agent_triggers").add({
        ...payload,
        status: "PENDING",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await taskDoc.ref.update({
      executionResult: dispatched ? "Webhook dispatched" : "Queued in agent_triggers",
    });
    results.push({ taskId: taskDoc.id, eventId, title, status: dispatched ? "WEBHOOK_SENT" : "QUEUED" });
  }

  return {
    runId,
    scanned: taskDocs.length,
    due: dueDocs.length,
    results,
  };
};

import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

const OPENCLAW_TASK_WEBHOOK_URL = process.env.OPENCLAW_TASK_WEBHOOK_URL || "";
const OPENCLAW_TASK_WEBHOOK_SECRET = process.env.OPENCLAW_TASK_WEBHOOK_SECRET || "";

const buildHeaders = (): Record<string, string> => {
  if (!OPENCLAW_TASK_WEBHOOK_SECRET) {
    return { "Content-Type": "application/json" };
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENCLAW_TASK_WEBHOOK_SECRET}`,
  };
};

export const dispatchPendingAgentTriggers = async () => {
  if (!adminDb) {
    throw new Error("Firebase Admin לא מוגדר. אי אפשר לצרוך agent_triggers כרגע.");
  }

  const snap = await adminDb
    .collection("agent_triggers")
    .where("status", "==", "PENDING")
    .limit(25)
    .get();

  const results: Array<{ id: string; status: string; detail?: string }> = [];

  for (const triggerDoc of snap.docs) {
    const data = triggerDoc.data() as Record<string, unknown>;
    const taskPayload = {
      source: String(data.source || "PATIFON_TASK_SCHEDULER"),
      runId: String(data.runId || ""),
      triggerId: triggerDoc.id,
      taskId: String(data.taskId || ""),
      eventId: String(data.eventId || ""),
      title: String(data.title || "משימה ללא שם"),
      executionMode: String(data.executionMode || "NOTIFY_ONLY"),
      scheduledAt: data.scheduledAt || null,
      agentInstruction: String(data.agentInstruction || data.title || ""),
      payload: (data.payload || {}) as Record<string, unknown>,
      taskPath: String(data.taskPath || ""),
    };

    const targetGroupNames = Array.isArray((taskPayload.payload as Record<string, unknown>)?.targetGroups)
      ? ((taskPayload.payload as Record<string, unknown>).targetGroups as Array<Record<string, unknown>>)
          .map((group) => String(group?.name || group?.chatId || group?.id || "").trim())
          .filter(Boolean)
      : [];

    const message = [
      "PATIFON scheduled task triggered.",
      `Task: ${taskPayload.title}`,
      taskPayload.eventId ? `Event ID: ${taskPayload.eventId}` : "",
      taskPayload.taskId ? `Task ID: ${taskPayload.taskId}` : "",
      taskPayload.scheduledAt ? `Scheduled at: ${String(taskPayload.scheduledAt)}` : "",
      `Execution mode: ${taskPayload.executionMode}`,
      `Instruction: ${taskPayload.agentInstruction}`,
      targetGroupNames.length ? `Target groups: ${targetGroupNames.join(", ")}` : "",
      Object.keys(taskPayload.payload || {}).length ? `Payload: ${JSON.stringify(taskPayload.payload)}` : "",
      taskPayload.taskPath ? `Firestore path: ${taskPayload.taskPath}` : "",
    ].filter(Boolean).join("\n");

    const payload = {
      message,
      name: "PATIFON Task",
      agentId: "main",
      wakeMode: "now",
      deliver: false,
    };

    if (!OPENCLAW_TASK_WEBHOOK_URL) {
      await triggerDoc.ref.update({
        status: "WAITING_WEBHOOK",
        lastAttemptAt: FieldValue.serverTimestamp(),
        lastError: "OPENCLAW_TASK_WEBHOOK_URL is not configured",
      });
      results.push({ id: triggerDoc.id, status: "WAITING_WEBHOOK", detail: "OPENCLAW_TASK_WEBHOOK_URL is not configured" });
      continue;
    }

    try {
      const body = JSON.stringify(payload);
      const res = await fetch(OPENCLAW_TASK_WEBHOOK_URL, {
        method: "POST",
        headers: buildHeaders(),
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Webhook failed (${res.status}): ${text || "empty response"}`);
      }

      await triggerDoc.ref.update({
        status: "DISPATCHED",
        dispatchedAt: FieldValue.serverTimestamp(),
        lastAttemptAt: FieldValue.serverTimestamp(),
        lastError: "",
      });
      results.push({ id: triggerDoc.id, status: "DISPATCHED" });
    } catch (error) {
      await triggerDoc.ref.update({
        status: "FAILED",
        lastAttemptAt: FieldValue.serverTimestamp(),
        lastError: error instanceof Error ? error.message : "dispatch failed",
      });
      results.push({ id: triggerDoc.id, status: "FAILED", detail: error instanceof Error ? error.message : "dispatch failed" });
    }
  }

  return {
    scanned: snap.size,
    results,
    webhookConfigured: !!OPENCLAW_TASK_WEBHOOK_URL,
  };
};

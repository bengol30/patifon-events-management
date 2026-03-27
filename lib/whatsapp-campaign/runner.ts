import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "../firebase-admin.ts";
import { formatLocalDateTime } from "./builder.ts";
import { sendWhatsappFileToChat, sendWhatsappTextToChat } from "./sender.ts";
import type { WhatsappCampaignPayload, WhatsappCampaignSendStep, WhatsappCampaignTaskLike } from "./types.ts";
import { shouldAllowCampaignStepExecution } from "@/lib/marketing-campaign-controls";

const clean = (value: unknown) => String(value || "").trim();

const getTaskRef = (eventId: string, taskId: string) => adminDb?.collection("events").doc(eventId).collection("tasks").doc(taskId) || null;

const asPayload = (task: WhatsappCampaignTaskLike) => ((task.payload || {}) as WhatsappCampaignPayload);

export const getSendPlanStep = (task: WhatsappCampaignTaskLike, stepNumber: number): WhatsappCampaignSendStep | null => {
  const payload = asPayload(task);
  const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan : [];
  const step = sendPlan.find((item) => Number(item?.step) === stepNumber) || null;
  return step as WhatsappCampaignSendStep | null;
};

export const assertRunnableCampaignStep = (task: WhatsappCampaignTaskLike, stepNumber: number) => {
  if (task.specialType !== "whatsapp_campaign_patifon") {
    throw new Error("Task is not a whatsapp campaign task");
  }
  const step = getSendPlanStep(task, stepNumber);
  if (!step) throw new Error(`Campaign step ${stepNumber} not found`);
  if (step.status !== "PENDING") {
    throw new Error(`Campaign step ${stepNumber} is not pending`);
  }
  if (!Array.isArray(step.targetGroups) || step.targetGroups.length === 0) {
    throw new Error(`Campaign step ${stepNumber} has no target groups`);
  }
  return step;
};

const buildProgressDescription = (task: WhatsappCampaignTaskLike, note: string) => {
  const base = clean(task.description);
  return [base, "", note].filter(Boolean).join("\n").trim();
};

export const runWhatsappCampaignStep = async ({ eventId, taskId, stepNumber, ignoreCampaignControls = false }: { eventId: string; taskId: string; stepNumber: number; ignoreCampaignControls?: boolean }) => {
  if (!adminDb) throw new Error("Firebase Admin is not configured");
  const taskRef = getTaskRef(eventId, taskId);
  if (!taskRef) throw new Error("Task ref unavailable");
  const snap = await taskRef.get();
  if (!snap.exists) throw new Error("Campaign task was deleted from PATIFON");
  const task = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as unknown as WhatsappCampaignTaskLike & Record<string, unknown>;
  if (!ignoreCampaignControls && !shouldAllowCampaignStepExecution(task, `wa-${stepNumber}`)) {
    throw new Error(`Campaign window wa-${stepNumber} is paused or blocked`);
  }
  const step = assertRunnableCampaignStep(task, stepNumber);
  const payload = asPayload(task);
  const sentAt = new Date().toISOString();
  const firstMediaUrl = Array.isArray(payload.mediaUrls) ? payload.mediaUrls.map(clean).find(Boolean) : "";

  try {
    for (const group of step.targetGroups) {
      if (!clean(group.chatId).endsWith("@g.us")) {
        throw new Error(`Invalid group chatId for ${group.name || group.id}`);
      }
      if (firstMediaUrl) {
        await sendWhatsappFileToChat(group.chatId, firstMediaUrl, step.messageText);
      } else {
        await sendWhatsappTextToChat(group.chatId, step.messageText);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "WhatsApp send failed";
    const failedPlan = (Array.isArray(payload.sendPlan) ? payload.sendPlan : []).map((item) => {
      if (Number(item.step) !== stepNumber) return item;
      return { ...item, status: "FAILED", error: message };
    });
    await taskRef.update({
      payload: {
        ...payload,
        sendPlan: failedPlan,
        messageVariants: failedPlan.map((item) => item.messageText),
      },
      currentStatus: `שליחה ${stepNumber} נכשלה`,
      nextStep: `נדרש טיפול בשליחה ${stepNumber}`,
      description: buildProgressDescription(task, `תקלה: שליחה ${stepNumber} נכשלה — ${message}`),
      startedAt: task.startedAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw error;
  }

  const sendPlan = (Array.isArray(payload.sendPlan) ? payload.sendPlan : []).map((item) => {
    if (Number(item.step) !== stepNumber) return item;
    return { ...item, status: "SENT", sentAt, sentAtLocal: formatLocalDateTime(sentAt), error: "" };
  });
  const completedCount = sendPlan.filter((item) => item.status === "SENT").length;
  const totalCount = sendPlan.length || Math.max(1, Number(task.requiredCompletions) || 1);
  const remaining = Math.max(0, totalCount - completedCount);
  const nextPending = sendPlan.find((item) => item.status === "PENDING");
  const nextStatus = remaining === 0 ? "DONE" : completedCount > 0 ? "IN_PROGRESS" : "TODO";
  const note = [
    `בוצע: שליחה ${stepNumber} — ${formatLocalDateTime(sentAt)}`,
    `  → נשלח אל: ${step.targetGroups.map((group) => group.name).join(", ")}`,
    `  → סטטוס נוכחי: ${completedCount} מתוך ${totalCount} הושלמו`,
    `  → השלב הבא: ${nextPending ? (nextPending.scheduledLabel || `שליחה ${nextPending.step} — ${nextPending.scheduledAt}`) : "הקמפיין הושלם ✅"}`,
  ].join("\n");

  await taskRef.update({
    payload: {
      ...payload,
      sendPlan,
      messageVariants: sendPlan.map((item) => item.messageText),
    },
    remainingCompletions: remaining,
    status: nextStatus,
    scheduledAt: nextPending ? (nextPending.scheduledAt || null) : null,
    scheduleStatus: remaining === 0 ? "DONE" : "PENDING",
    currentStatus: `${completedCount} מתוך ${totalCount} הושלמו`,
    nextStep: nextPending ? (nextPending.scheduledLabel || `שליחה ${nextPending.step} מתוזמנת ל-${nextPending.scheduledAt}`) : "הושלם ✅",
    description: buildProgressDescription(task, note),
    startedAt: (task as any).startedAt || FieldValue.serverTimestamp(),
    ...(remaining === 0 ? { completedAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    eventId,
    taskId,
    stepNumber,
    sentAt,
    totalCount,
    completedCount,
    remaining,
    nextStatus,
  };
};

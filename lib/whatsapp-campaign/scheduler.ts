import { adminDb } from "../firebase-admin.ts";
import { parseScheduledAt } from "../task-scheduler/normalize.ts";
import { runWhatsappCampaignStep } from "./runner.ts";
import type { WhatsappCampaignTaskLike } from "./types.ts";

export const runDueWhatsappCampaignSteps = async () => {
  if (!adminDb) {
    throw new Error("Firebase Admin לא מוגדר. אי אפשר להריץ קמפייני וואטסאפ כרגע.");
  }

  const now = new Date();
  const eventDocs = await adminDb.collection("events").limit(100).get();
  const results: Array<{ eventId: string; taskId: string; step: number; status: string; detail?: string }> = [];

  for (const eventDoc of eventDocs.docs) {
    const tasksSnap = await eventDoc.ref
      .collection("tasks")
      .where("specialType", "==", "whatsapp_campaign_patifon")
      .limit(50)
      .get();

    for (const taskDoc of tasksSnap.docs) {
      const task = { id: taskDoc.id, ...(taskDoc.data() as Record<string, unknown>) } as WhatsappCampaignTaskLike;
      const sendPlan = Array.isArray(task.payload?.sendPlan) ? task.payload?.sendPlan : [];
      const dueSteps = sendPlan.filter((step) => step?.status === "PENDING" && (() => {
        const scheduledAt = parseScheduledAt(step?.scheduledAt);
        return !!scheduledAt && scheduledAt.getTime() <= now.getTime();
      })());

      for (const step of dueSteps) {
        const stepNumber = Number(step?.step || 0);
        if (!Number.isFinite(stepNumber) || stepNumber <= 0) continue;
        try {
          await runWhatsappCampaignStep({ eventId: eventDoc.id, taskId: taskDoc.id, stepNumber });
          results.push({ eventId: eventDoc.id, taskId: taskDoc.id, step: stepNumber, status: "SENT" });
        } catch (error) {
          results.push({
            eventId: eventDoc.id,
            taskId: taskDoc.id,
            step: stepNumber,
            status: "FAILED",
            detail: error instanceof Error ? error.message : "Campaign step failed",
          });
        }
      }
    }
  }

  return {
    ok: true,
    scannedEvents: eventDocs.size,
    results,
  };
};

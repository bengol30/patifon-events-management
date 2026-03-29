import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { normalizeCampaignControls, updateCampaignTaskControls, syncCampaignControlsWithTask, formatCampaignWindowLabel, buildCampaignNextStepText, type CampaignControlStatus } from "@/lib/marketing-campaign-controls";
import { runWhatsappCampaignStep } from "@/lib/whatsapp-campaign/runner";
import { publishInstagramStoryCampaignStep } from "@/lib/instagram-story-campaign/publish-step";

const clean = (value: unknown) => String(value || "").trim();

const currentWindowEnabled = (taskOrPlan: Record<string, unknown>[] | Record<string, unknown>, stepKey: string) => {
  if (Array.isArray(taskOrPlan)) return true;
  const controls = syncCampaignControlsWithTask(taskOrPlan, normalizeCampaignControls(taskOrPlan));
  const found = controls.windows.find((window) => window.stepKey === stepKey);
  return found ? found.enabled : true;
};

export async function POST(req: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ ok: false, error: "Firebase Admin לא מוגדר" }, { status: 500 });
    const body = await req.json() as Record<string, unknown>;
    const eventId = clean(body.eventId);
    const taskId = clean(body.taskId);
    const action = clean(body.action);
    const stepKey = clean(body.stepKey);
    const scheduledAtInput = clean(body.scheduledAt);

    if (!eventId || !taskId || !action) {
      return NextResponse.json({ ok: false, error: "eventId/taskId/action חסרים" }, { status: 400 });
    }

    if (action === "pause") {
      const controls = await updateCampaignTaskControls({ eventId, taskId, updater: (current) => ({ ...current, status: "PAUSED" }) });
      return NextResponse.json({ ok: true, controls });
    }

    if (action === "resume") {
      const controls = await updateCampaignTaskControls({ eventId, taskId, updater: (current) => ({ ...current, status: "ACTIVE" }) });
      return NextResponse.json({ ok: true, controls });
    }

    if (action === "toggle_window") {
      if (!stepKey) return NextResponse.json({ ok: false, error: "stepKey חסר" }, { status: 400 });
      const taskRef = adminDb.collection("events").doc(eventId).collection("tasks").doc(taskId);
      const snap = await taskRef.get();
      if (!snap.exists) return NextResponse.json({ ok: false, error: "המשימה לא נמצאה" }, { status: 404 });
      const task = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown> & { specialType?: unknown; nextStep?: unknown };
      const specialType = clean(task.specialType);
      const controls = await updateCampaignTaskControls({
        eventId,
        taskId,
        updater: (current) => {
          const windows = current.windows.map((window) => window.stepKey === stepKey ? { ...window, enabled: !window.enabled } : window);
          const hasEnabledWindows = windows.some((window) => window.enabled);
          return {
            ...current,
            windows,
            status: current.status === "PAUSED" ? "PAUSED" : hasEnabledWindows ? "ACTIVE" : "WINDOW_BLOCKED",
          };
        },
      });
      const nextStatus: CampaignControlStatus = controls.windows.some((window) => window.enabled)
        ? (controls.status === "PAUSED" ? "PAUSED" : "ACTIVE")
        : "WINDOW_BLOCKED";
      const normalized = { ...controls, status: nextStatus };
      const nextStep = buildCampaignNextStepText(task, normalized);
      const nextEnabledWindow = normalized.windows.find((window) => window.enabled);
      await taskRef.update({ nextStep });
      return NextResponse.json({ ok: true, controls: normalized, nextEnabledWindow: nextEnabledWindow?.stepKey || null });
    }

    if (action === "update_time") {
      if (!stepKey || !scheduledAtInput) {
        return NextResponse.json({ ok: false, error: "stepKey/scheduledAt חסרים" }, { status: 400 });
      }
      const scheduledDate = new Date(scheduledAtInput);
      if (Number.isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
      }
      const normalizedIso = scheduledDate.toISOString();
      const taskRef = adminDb.collection("events").doc(eventId).collection("tasks").doc(taskId);
      const snap = await taskRef.get();
      if (!snap.exists) return NextResponse.json({ ok: false, error: "המשימה לא נמצאה" }, { status: 404 });
      const task = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown> & { id: string; specialType?: unknown; title?: unknown; currentStatus?: unknown; nextStep?: unknown };
      const specialType = clean(task.specialType);
      const payload = (task.payload || {}) as Record<string, unknown>;

      if (specialType === "whatsapp_campaign_patifon") {
        const stepNumber = Number(stepKey.replace("wa-", ""));
        const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan as Record<string, unknown>[] : [];
        const nextPlan = sendPlan.map((step, index) => {
          const currentStep = Number(step.step || index + 1);
          if (currentStep !== stepNumber) return step;
          return {
            ...step,
            scheduledAt: normalizedIso,
            scheduledAtLocal: normalizedIso,
            scheduledLabel: formatCampaignWindowLabel(specialType, stepKey, normalizedIso),
          };
        });
        await taskRef.update({
          payload: { ...payload, sendPlan: nextPlan, messageVariants: nextPlan.map((step) => step.messageText) },
        });
        const controls = await updateCampaignTaskControls({
          eventId,
          taskId,
          updater: (current) => ({
            ...current,
            windows: current.windows.map((window) => window.stepKey === stepKey ? { ...window, scheduledAt: normalizedIso, label: formatCampaignWindowLabel(specialType, stepKey, normalizedIso) } : window),
          }),
        });
        await taskRef.update({ nextStep: buildCampaignNextStepText({ ...task, payload: { ...payload, sendPlan: nextPlan } }, controls) });
        return NextResponse.json({ ok: true, controls, scheduledAt: normalizedIso });
      }

      if (specialType === "instagram_story_campaign_patifon") {
        const stepIndex = Number(stepKey.replace("ig-", ""));
        const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
        const nextPlan = storyPlan.map((step, index) => {
          const currentStep = Number(step.stepIndex || index + 1);
          if (currentStep !== stepIndex) return step;
          return { ...step, scheduledTime: normalizedIso };
        });
        const scheduleTime = Math.floor(scheduledDate.getTime() / 1000);
        const scheduledPostId = `ig-story-${eventId}-${taskId}-step${stepIndex}`;
        const scheduledPostRef = adminDb.collection("scheduled_posts").doc(scheduledPostId);
        await taskRef.update({
          payload: { ...payload, storyPlan: nextPlan },
        });
        const postSnap = await scheduledPostRef.get();
        if (postSnap.exists) {
          await scheduledPostRef.update({ scheduleTime, updatedAt: new Date().toISOString() });
        }
        const controls = await updateCampaignTaskControls({
          eventId,
          taskId,
          updater: (current) => ({
            ...current,
            windows: current.windows.map((window) => window.stepKey === stepKey ? { ...window, scheduledAt: normalizedIso, label: formatCampaignWindowLabel(specialType, stepKey, normalizedIso) } : window),
          }),
        });
        await taskRef.update({ nextStep: buildCampaignNextStepText({ ...task, payload: { ...payload, storyPlan: nextPlan } }, controls) });
        return NextResponse.json({ ok: true, controls, scheduledAt: normalizedIso, scheduledPostUpdated: postSnap.exists });
      }

      return NextResponse.json({ ok: false, error: "סוג קמפיין לא נתמך לעדכון זמן" }, { status: 400 });
    }

    if (action === "run_now") {
      const taskRef = adminDb.collection("events").doc(eventId).collection("tasks").doc(taskId);
      const snap = await taskRef.get();
      if (!snap.exists) return NextResponse.json({ ok: false, error: "המשימה לא נמצאה" }, { status: 404 });
      const task = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown> & { id: string; specialType?: unknown };
      const controls = syncCampaignControlsWithTask(task, normalizeCampaignControls(task));
      const target = stepKey
        ? controls.windows.find((window) => window.stepKey === stepKey && window.enabled)
        : controls.windows.find((window) => window.enabled);
      if (!target) return NextResponse.json({ ok: false, error: "אין חלון פרסום פעיל להפעלה" }, { status: 400 });

      const specialType = clean(task.specialType);
      if (specialType === "whatsapp_campaign_patifon") {
        const stepNumber = Number(target.stepKey.replace("wa-", ""));
        const result = await runWhatsappCampaignStep({ eventId, taskId, stepNumber, ignoreCampaignControls: true });
        const updatedControls = await updateCampaignTaskControls({
          eventId,
          taskId,
          updater: (current) => ({ ...current, status: "ACTIVE", lastManualRunAt: new Date().toISOString(), lastManualRunStepKey: target.stepKey }),
        });
        return NextResponse.json({ ok: true, result, controls: updatedControls });
      }

      if (specialType === "instagram_story_campaign_patifon") {
        const stepIndex = Number(target.stepKey.replace("ig-", ""));
        const result = await publishInstagramStoryCampaignStep({ eventId, taskId, stepIndex, ignoreCampaignControls: true });
        const updatedControls = await updateCampaignTaskControls({
          eventId,
          taskId,
          updater: (current) => ({ ...current, status: "ACTIVE", lastManualRunAt: new Date().toISOString(), lastManualRunStepKey: target.stepKey }),
        });
        return NextResponse.json({ ok: true, result, controls: updatedControls });
      }

      return NextResponse.json({ ok: false, error: "סוג קמפיין לא נתמך" }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: "action לא נתמך" }, { status: 400 });
  } catch (error) {
    console.error("campaign-controls failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "שגיאת שליטה בקמפיין" }, { status: 500 });
  }
}

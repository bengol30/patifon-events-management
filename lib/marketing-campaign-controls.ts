import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

const clean = (value: unknown) => String(value || "").trim();

export type CampaignControlStatus = "ACTIVE" | "PAUSED" | "WINDOW_BLOCKED";
export type CampaignControlType = "whatsapp_campaign_patifon" | "instagram_story_campaign_patifon";

export interface CampaignControlWindow {
  stepKey: string;
  enabled: boolean;
  scheduledAt: string;
  label: string;
}

export interface CampaignControls {
  status: CampaignControlStatus;
  windows: CampaignControlWindow[];
  lastManualRunAt?: string | null;
  lastManualRunStepKey?: string | null;
}

export const isMarketingCampaignTask = (specialType?: string | null) => (
  specialType === "whatsapp_campaign_patifon" || specialType === "instagram_story_campaign_patifon"
);

export const getCampaignStepWindows = (task: Record<string, unknown>) : CampaignControlWindow[] => {
  const specialType = clean(task.specialType);
  const payload = (task.payload || {}) as Record<string, unknown>;

  if (specialType === "whatsapp_campaign_patifon") {
    const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan as Record<string, unknown>[] : [];
    return sendPlan
      .map((step, index) => {
        const stepNumber = Number(step.step || index + 1);
        const scheduledAt = clean(step.scheduledAt);
        if (!stepNumber || !scheduledAt) return null;
        return {
          stepKey: `wa-${stepNumber}`,
          enabled: clean(step.status).toUpperCase() !== "CANCELLED",
          scheduledAt,
          label: clean(step.scheduledLabel) || `שליחה ${stepNumber}`,
        } satisfies CampaignControlWindow;
      })
      .filter(Boolean) as CampaignControlWindow[];
  }

  if (specialType === "instagram_story_campaign_patifon") {
    const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
    return storyPlan
      .map((step, index) => {
        const stepIndex = Number(step.stepIndex || index + 1);
        const scheduledAt = clean(step.scheduledTime);
        if (!stepIndex || !scheduledAt) return null;
        return {
          stepKey: `ig-${stepIndex}`,
          enabled: clean(step.status).toUpperCase() !== "CANCELLED",
          scheduledAt,
          label: `סטורי ${stepIndex}`,
        } satisfies CampaignControlWindow;
      })
      .filter(Boolean) as CampaignControlWindow[];
  }

  return [];
};

export const buildDefaultCampaignControls = (task: Record<string, unknown>) : CampaignControls => ({
  status: "ACTIVE",
  windows: getCampaignStepWindows(task),
  lastManualRunAt: null,
  lastManualRunStepKey: null,
});

export const normalizeCampaignControls = (task: Record<string, unknown>) : CampaignControls => {
  const raw = (task.campaignControls || {}) as Partial<CampaignControls>;
  const defaults = buildDefaultCampaignControls(task);
  const rawStatus = clean(raw.status).toUpperCase();
  const status: CampaignControlStatus = rawStatus === "PAUSED" || rawStatus === "WINDOW_BLOCKED" ? rawStatus as CampaignControlStatus : "ACTIVE";
  const rawWindows = Array.isArray(raw.windows) ? raw.windows as CampaignControlWindow[] : [];
  const windows = defaults.windows.map((base) => {
    const found = rawWindows.find((item) => clean(item.stepKey) === base.stepKey);
    return {
      ...base,
      enabled: found?.enabled ?? base.enabled,
      scheduledAt: clean(found?.scheduledAt) || base.scheduledAt,
      label: clean(found?.label) || base.label,
    };
  });
  return {
    status,
    windows,
    lastManualRunAt: clean(raw.lastManualRunAt) || null,
    lastManualRunStepKey: clean(raw.lastManualRunStepKey) || null,
  };
};

export const isCampaignWindowEnabled = (task: Record<string, unknown>, stepKey: string) => {
  const controls = normalizeCampaignControls(task);
  if (controls.status !== "ACTIVE") return false;
  const found = controls.windows.find((item) => clean(item.stepKey) === clean(stepKey));
  return found ? Boolean(found.enabled) : false;
};

export const shouldAllowCampaignStepExecution = (task: Record<string, unknown>, stepKey: string) => {
  const controls = normalizeCampaignControls(task);
  if (controls.status === "PAUSED" || controls.status === "WINDOW_BLOCKED") return false;
  const window = controls.windows.find((item) => clean(item.stepKey) === clean(stepKey));
  return window ? window.enabled : false;
};

export const syncCampaignControlsWithTask = (task: Record<string, unknown>, current?: Partial<CampaignControls> | null): CampaignControls => {
  const defaults = buildDefaultCampaignControls(task);
  const incoming = current || (task.campaignControls as Partial<CampaignControls> | undefined) || {};
  const incomingWindows = Array.isArray(incoming.windows) ? incoming.windows as CampaignControlWindow[] : [];
  const windows = defaults.windows.map((base) => {
    const found = incomingWindows.find((item) => clean(item.stepKey) === clean(base.stepKey));
    return found ? { ...base, enabled: found.enabled, label: clean(found.label) || base.label, scheduledAt: clean(found.scheduledAt) || base.scheduledAt } : base;
  });
  const hasEnabledWindows = windows.some((window) => window.enabled);
  const requestedStatus = clean(incoming.status).toUpperCase();
  const status: CampaignControlStatus = requestedStatus === "PAUSED"
    ? "PAUSED"
    : hasEnabledWindows
      ? "ACTIVE"
      : "WINDOW_BLOCKED";
  return {
    status,
    windows,
    lastManualRunAt: clean(incoming.lastManualRunAt) || null,
    lastManualRunStepKey: clean(incoming.lastManualRunStepKey) || null,
  };
};

export const formatCampaignWindowLabel = (specialType: string, stepKey: string, scheduledAt: string) => {
  const date = new Date(scheduledAt);
  const safeDate = Number.isNaN(date.getTime()) ? scheduledAt : new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  if (specialType === 'whatsapp_campaign_patifon') {
    const stepNumber = Number(stepKey.replace('wa-', '')) || 0;
    return `שליחה ${stepNumber} · ${safeDate}`;
  }
  const stepIndex = Number(stepKey.replace('ig-', '')) || 0;
  return `סטורי ${stepIndex} · ${safeDate}`;
};

export const getNextActiveCampaignWindow = (task: Record<string, unknown>, controlsInput?: Partial<CampaignControls> | null) => {
  const controls = syncCampaignControlsWithTask(task, controlsInput);
  const now = Date.now();
  const enabledWindows = controls.windows.filter((window) => window.enabled);
  if (!enabledWindows.length) return null;

  const sortedWindows = [...enabledWindows].sort((a, b) => {
    const aTime = new Date(a.scheduledAt).getTime();
    const bTime = new Date(b.scheduledAt).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return aTime - bTime;
  });

  const upcomingWindow = sortedWindows.find((window) => {
    const ts = new Date(window.scheduledAt).getTime();
    return !Number.isNaN(ts) && ts >= now;
  });

  return upcomingWindow || sortedWindows[sortedWindows.length - 1] || null;
};

export const buildCampaignNextStepText = (task: Record<string, unknown>, controlsInput?: Partial<CampaignControls> | null) => {
  const specialType = clean(task.specialType);
  const payload = (task.payload || {}) as Record<string, unknown>;
  const controls = syncCampaignControlsWithTask(task, controlsInput);
  const nextWindow = getNextActiveCampaignWindow(task, controls);
  if (!nextWindow) {
    return controls.status === 'WINDOW_BLOCKED' ? 'אין מועד פעיל כרגע — כל חלונות הקמפיין חסומים' : clean(task.nextStep);
  }

  if (specialType === 'whatsapp_campaign_patifon') {
    const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan as Record<string, unknown>[] : [];
    const stepNumber = Number(nextWindow.stepKey.replace('wa-', '')) || 0;
    const step = sendPlan.find((item, index) => Number(item.step || index + 1) === stepNumber);
    return clean(step?.scheduledLabel) || formatCampaignWindowLabel(specialType, nextWindow.stepKey, nextWindow.scheduledAt);
  }

  if (specialType === 'instagram_story_campaign_patifon') {
    const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
    const stepIndex = Number(nextWindow.stepKey.replace('ig-', '')) || 0;
    const step = storyPlan.find((item, index) => Number(item.stepIndex || index + 1) === stepIndex);
    const scheduledTime = clean(step?.scheduledTime) || nextWindow.scheduledAt;
    return `סטורי ${stepIndex} — ${scheduledTime}`;
  }

  return clean(task.nextStep);
};

export const updateCampaignTaskControls = async (args: {
  eventId: string;
  taskId: string;
  updater: (current: CampaignControls, task: Record<string, unknown>) => CampaignControls;
}) => {
  if (!adminDb) throw new Error("Firebase Admin לא מוגדר");
  const ref = adminDb.collection("events").doc(args.eventId).collection("tasks").doc(args.taskId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("המשימה לא נמצאה");
  const task = { id: snap.id, ...(snap.data() as Record<string, unknown>) } as Record<string, unknown> & { id: string; specialType?: unknown };
  if (!isMarketingCampaignTask(clean(task.specialType))) {
    throw new Error("המשימה הזו אינה משימת קמפיין נתמכת");
  }
  const current = normalizeCampaignControls(task);
  const next = syncCampaignControlsWithTask(task, args.updater(current, task));
  await ref.update({
    campaignControls: next,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return next;
};

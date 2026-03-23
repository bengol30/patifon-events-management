import type { TaskExecutionMode, TaskScheduleConfig, TaskScheduleStatus, TaskScheduleType } from "./types";

const isValidDate = (value: Date | null) => !!value && !Number.isNaN(value.getTime());

export const parseScheduledAt = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isValidDate(value) ? value : null;
  if (typeof value === "object" && value && "seconds" in (value as Record<string, unknown>)) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  const parsed = new Date(String(value));
  return isValidDate(parsed) ? parsed : null;
};

export const normalizeTaskSchedule = (input: TaskScheduleConfig) => {
  const scheduledAt = parseScheduledAt(input.scheduledAt);
  const scheduleType: TaskScheduleType = input.scheduleType || "ONE_TIME";
  const scheduleStatus: TaskScheduleStatus = input.scheduleStatus || "PENDING";
  const executionMode: TaskExecutionMode = input.executionMode || "NOTIFY_ONLY";

  return {
    scheduledAt,
    scheduleType,
    scheduleStatus,
    executionMode,
    agentInstruction: input.agentInstruction?.trim() || "",
    payload: input.payload || {},
    executionResult: input.executionResult || "",
    triggerLockId: input.triggerLockId || "",
    lastTriggeredAt: parseScheduledAt(input.lastTriggeredAt),
    notifiedSession: input.notifiedSession || "",
  };
};

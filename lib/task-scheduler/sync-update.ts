import type { TaskScheduleStatus } from "./types";

type SchedulableTaskLike = {
  dueDate?: string | null;
  scheduledAt?: string | null;
  scheduleStatus?: TaskScheduleStatus | null;
};

export const buildTaskScheduleUpdate = <
  TTask extends SchedulableTaskLike,
  TUpdates extends Record<string, any> & Partial<SchedulableTaskLike>,
>(
  task: TTask | null | undefined,
  updates: TUpdates,
) => {
  const nextDueDate = updates.dueDate !== undefined ? updates.dueDate : task?.dueDate;
  const nextScheduledAt = updates.scheduledAt !== undefined ? updates.scheduledAt : task?.scheduledAt;
  const nextScheduleStatus = updates.scheduleStatus !== undefined ? updates.scheduleStatus : task?.scheduleStatus;

  const isScheduledTask = !!(nextScheduledAt || nextScheduleStatus === "PENDING" || nextScheduleStatus === "TRIGGERED");

  if (!isScheduledTask) {
    return updates;
  }

  const normalizedDueDate = nextDueDate || null;
  const lockedStatus = nextScheduleStatus === "DONE" || nextScheduleStatus === "CANCELLED";

  return {
    ...updates,
    dueDate: normalizedDueDate,
    scheduledAt: normalizedDueDate,
    ...(lockedStatus ? {} : { scheduleStatus: "PENDING" as TaskScheduleStatus }),
  };
};

export const getScheduledExecutionLabel = (dueDate?: string | null, scheduledAt?: string | null) => {
  const actual = scheduledAt || dueDate || null;
  if (!actual) return null;

  return new Date(actual).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

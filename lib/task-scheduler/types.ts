export type TaskScheduleType = "ONE_TIME" | "RECURRING" | "REMINDER";
export type TaskExecutionMode = "NOTIFY_ONLY" | "AGENT_ACTION" | "EXTERNAL_ACTION";
export type TaskScheduleStatus = "PENDING" | "TRIGGERED" | "DONE" | "FAILED" | "CANCELLED";

export interface TaskScheduleConfig {
  scheduledAt?: string | Date | null;
  scheduleType?: TaskScheduleType;
  scheduleStatus?: TaskScheduleStatus;
  executionMode?: TaskExecutionMode;
  agentInstruction?: string;
  payload?: Record<string, unknown>;
  lastTriggeredAt?: string | Date | null;
  executionResult?: string;
  triggerLockId?: string;
  notifiedSession?: string;
}

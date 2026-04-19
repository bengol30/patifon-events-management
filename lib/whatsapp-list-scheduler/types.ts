export const ISRAEL_TZ = "Asia/Jerusalem";

export type ListScheduleSendMode = "custom" | "event";
export type ListScheduleType = "once" | "recurring";
export type ListScheduleStatus = "active" | "paused" | "done" | "failed" | "pending_client";

export interface ListSchedule {
  id: string;
  listId: string;
  listName: string;

  /** What to send */
  sendMode: ListScheduleSendMode;
  messageText?: string; // for sendMode="custom"
  eventId?: string;     // for sendMode="event"
  mediaUrl?: string;    // optional extra media (custom mode)

  /** When to send */
  scheduleType: ListScheduleType;

  // --- one-time ---
  scheduledAt?: string; // ISO string

  // --- recurring ---
  recurringDays?: number[]; // 0=Sun, 1=Mon, …, 6=Sat
  recurringTime?: string;   // "HH:MM" in Israel timezone (Asia/Jerusalem)

  /** Lifecycle */
  status: ListScheduleStatus;
  nextRunAt?: string;  // ISO string – pre-calculated next fire time (used for querying)
  lastRunAt?: string;  // ISO string – last successful execution

  createdAt: any;
}

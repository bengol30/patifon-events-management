import { ISRAEL_TZ, type ListSchedule } from "./types";

export const HEBREW_DAYS_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
export const HEBREW_DAYS_LONG = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/**
 * Returns the day of week (0=Sunday) for a UTC date expressed in Israel timezone.
 */
export function getIsraelDayOfWeek(utcDate: Date): number {
  return new Date(utcDate.toLocaleString("en-US", { timeZone: ISRAEL_TZ })).getDay();
}

/**
 * Returns a "YYYY-MM-DD" string for a UTC date in Israel timezone.
 */
export function getIsraelDateStr(utcDate: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: ISRAEL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(utcDate); // sv-SE locale gives "YYYY-MM-DD"
}

/**
 * Converts a date+time expressed in Israel timezone to a UTC Date.
 *
 * Strategy: probe UTC noon of the same calendar day to determine the current
 * Israel UTC offset (handles DST automatically), then shift accordingly.
 *
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:MM"
 */
export function israelLocalToUTC(dateStr: string, timeStr: string): Date {
  // Probe: UTC noon on the given calendar day
  const probe = new Date(`${dateStr}T12:00:00.000Z`);

  // What time does Israel report for that UTC noon?
  const probeIsrael = new Intl.DateTimeFormat("en-US", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(probe);

  // e.g. "15:00" in summer (+3) or "14:00" in winter (+2)
  const [probeH, probeM] = probeIsrael.split(":").map(Number);
  // Offset in minutes: Israel - UTC = (probeH*60+probeM) - 12*60
  const offsetMin = probeH * 60 + probeM - 12 * 60;

  // Build the UTC date for "dateStr at timeStr Israel time"
  const [tH, tM] = timeStr.split(":").map(Number);
  const result = new Date(`${dateStr}T00:00:00.000Z`);
  // setUTCMinutes handles day-boundary overflow automatically
  result.setUTCMinutes(tH * 60 + tM - offsetMin);
  return result;
}

/**
 * Returns the next UTC Date when the recurring schedule should fire,
 * starting strictly after `fromDate` (defaults to now).
 *
 * @param recurringDays  Array of day-of-week numbers (0=Sun … 6=Sat)
 * @param recurringTime  "HH:MM" in Israel timezone
 * @param fromDate       Reference UTC moment (exclusive lower bound)
 */
export function calculateNextRunAt(
  recurringDays: number[],
  recurringTime: string,
  fromDate: Date = new Date(),
): Date {
  if (!recurringDays.length) throw new Error("recurringDays must not be empty");

  // Scan up to 8 days ahead – guarantees we hit every day in a week
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = new Date(fromDate);
    candidate.setUTCDate(candidate.getUTCDate() + offset);

    const israelDay = getIsraelDayOfWeek(candidate);
    if (!recurringDays.includes(israelDay)) continue;

    const israelDateStr = getIsraelDateStr(candidate);
    const utcFire = israelLocalToUTC(israelDateStr, recurringTime);

    if (utcFire > fromDate) return utcFire;
  }

  // Should be unreachable for valid inputs
  throw new Error("calculateNextRunAt: no occurrence found within 8 days");
}

/**
 * Human-readable Hebrew label for a schedule, e.g.
 *   "כל שני וחמישי ב-14:00"
 *   "פעם אחת ב-15/01 ב-10:00"
 */
export function formatScheduleDescription(schedule: Pick<
  ListSchedule,
  "scheduleType" | "scheduledAt" | "recurringDays" | "recurringTime"
>): string {
  if (schedule.scheduleType === "once") {
    if (!schedule.scheduledAt) return "חד-פעמי";
    const d = new Date(schedule.scheduledAt);
    return `פעם אחת ב-${d.toLocaleString("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: ISRAEL_TZ,
    })}`;
  }

  const days = (schedule.recurringDays ?? []).slice().sort();
  const time = schedule.recurringTime ?? "";

  if (!days.length) return "קבוע";

  const dayStr = days.map((d) => HEBREW_DAYS_LONG[d]).join(" ו");
  return `כל ${dayStr} ב-${time}`;
}

/**
 * Returns true if the schedule is due to run right now.
 */
export function isDue(schedule: Pick<ListSchedule, "status" | "nextRunAt">, now: Date = new Date()): boolean {
  if (schedule.status !== "active") return false;
  if (!schedule.nextRunAt) return false;
  return new Date(schedule.nextRunAt) <= now;
}

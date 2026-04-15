/**
 * Tests for schedule-calc.ts
 * Run: npx tsx lib/whatsapp-list-scheduler/schedule-calc.test.ts
 */

import {
  israelLocalToUTC,
  getIsraelDayOfWeek,
  getIsraelDateStr,
  calculateNextRunAt,
  formatScheduleDescription,
  isDue,
} from "./schedule-calc";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    → ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function eq<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${msg ?? "assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function nearlyEq(actual: Date, expected: Date, toleranceMs = 60_000): void {
  const diff = Math.abs(actual.getTime() - expected.getTime());
  if (diff > toleranceMs) {
    throw new Error(
      `Dates differ by ${diff}ms (tolerance ${toleranceMs}ms).\n  actual:   ${actual.toISOString()}\n  expected: ${expected.toISOString()}`,
    );
  }
}

// ─── israelLocalToUTC ─────────────────────────────────────────────────────────

console.log("\nisraelLocalToUTC");

test("summer (+3): 14:00 Israel → 11:00 UTC", () => {
  // July 15 2024 is in Israeli DST (UTC+3)
  const utc = israelLocalToUTC("2024-07-15", "14:00");
  eq(utc.getUTCHours(), 11, "UTC hour");
  eq(utc.getUTCMinutes(), 0, "UTC minutes");
  eq(utc.toISOString().slice(0, 10), "2024-07-15", "date");
});

test("summer (+3): 02:00 Israel → 23:00 UTC previous day", () => {
  const utc = israelLocalToUTC("2024-07-15", "02:00");
  eq(utc.getUTCHours(), 23, "UTC hour");
  eq(utc.toISOString().slice(0, 10), "2024-07-14", "date wrapped to previous day");
});

test("winter (+2): 14:00 Israel → 12:00 UTC", () => {
  // January 15 2024 is in Israeli winter (UTC+2)
  const utc = israelLocalToUTC("2024-01-15", "14:00");
  eq(utc.getUTCHours(), 12, "UTC hour");
  eq(utc.getUTCMinutes(), 0, "UTC minutes");
  eq(utc.toISOString().slice(0, 10), "2024-01-15", "date");
});

test("winter (+2): 00:30 Israel → 22:30 UTC previous day", () => {
  const utc = israelLocalToUTC("2024-01-15", "00:30");
  eq(utc.getUTCHours(), 22, "UTC hour");
  eq(utc.getUTCMinutes(), 30, "UTC minutes");
  eq(utc.toISOString().slice(0, 10), "2024-01-14", "wrapped to previous day");
});

// ─── getIsraelDayOfWeek ───────────────────────────────────────────────────────

console.log("\ngetIsraelDayOfWeek");

test("Monday July 15 2024 at UTC noon → Israel day = 1 (Monday)", () => {
  // 2024-07-15 is a Monday
  const utc = new Date("2024-07-15T12:00:00Z");
  eq(getIsraelDayOfWeek(utc), 1, "day of week");
});

test("Friday Jan 5 2024 at UTC noon → Israel day = 5 (Friday)", () => {
  // 2024-01-05 is a Friday
  const utc = new Date("2024-01-05T12:00:00Z");
  eq(getIsraelDayOfWeek(utc), 5, "day of week");
});

test("Saturday UTC 22:00 = Sunday Israel (UTC+2)", () => {
  // 2024-01-06 (Saturday) at 22:00 UTC = 2024-01-07 (Sunday) at 00:00 Israel (winter +2)
  const utc = new Date("2024-01-06T22:00:00Z");
  eq(getIsraelDayOfWeek(utc), 0, "day wraps to Sunday in Israel");
});

// ─── getIsraelDateStr ─────────────────────────────────────────────────────────

console.log("\ngetIsraelDateStr");

test("returns correct YYYY-MM-DD for a UTC date in summer", () => {
  const utc = new Date("2024-07-15T14:00:00Z"); // 17:00 Israel summer
  eq(getIsraelDateStr(utc), "2024-07-15", "date string");
});

test("wraps to next day when Israel is ahead of UTC date", () => {
  // 2024-07-14 at 22:30 UTC = 2024-07-15 at 01:30 Israel (summer +3)
  const utc = new Date("2024-07-14T22:30:00Z");
  eq(getIsraelDateStr(utc), "2024-07-15", "wrapped to next day");
});

// ─── calculateNextRunAt ───────────────────────────────────────────────────────

console.log("\ncalculateNextRunAt");

test("next Monday 14:00 when fromDate is Sunday 12:00 UTC (same week)", () => {
  // 2024-07-14 is a Sunday, 12:00 UTC = 15:00 Israel (summer)
  const from = new Date("2024-07-14T12:00:00Z");
  const next = calculateNextRunAt([1], "14:00", from); // Monday = 1
  eq(getIsraelDayOfWeek(next), 1, "result is Monday");
  // 2024-07-15 14:00 Israel = 11:00 UTC
  nearlyEq(next, new Date("2024-07-15T11:00:00Z"));
});

test("next Monday when fromDate is already Monday but past the time", () => {
  // 2024-07-15 (Monday) at 12:00 UTC = 15:00 Israel (summer) → past 14:00
  const from = new Date("2024-07-15T12:00:00Z");
  const next = calculateNextRunAt([1], "14:00", from);
  // Should give NEXT Monday = 2024-07-22
  eq(getIsraelDayOfWeek(next), 1, "result is Monday");
  nearlyEq(next, new Date("2024-07-22T11:00:00Z"));
});

test("next Monday when fromDate is Monday before the fire time", () => {
  // 2024-07-15 (Monday) at 08:00 UTC = 11:00 Israel (summer) → before 14:00
  const from = new Date("2024-07-15T08:00:00Z");
  const next = calculateNextRunAt([1], "14:00", from);
  // Should give same Monday = 2024-07-15 14:00 Israel = 11:00 UTC
  nearlyEq(next, new Date("2024-07-15T11:00:00Z"));
});

test("multiple days: [0,3] (Sun, Wed) from Thursday → next Sunday", () => {
  // 2024-07-18 is a Thursday
  const from = new Date("2024-07-18T12:00:00Z");
  const next = calculateNextRunAt([0, 3], "09:00", from);
  // Next occurrence: Sunday 2024-07-21
  eq(getIsraelDayOfWeek(next), 0, "result is Sunday");
});

test("throws for empty days array", () => {
  let threw = false;
  try { calculateNextRunAt([], "09:00"); } catch { threw = true; }
  eq(threw, true, "should throw");
});

test("winter schedule: every Friday 20:00 Israel → UTC 18:00", () => {
  // 2024-01-01 (Monday) → next Friday = 2024-01-05
  const from = new Date("2024-01-01T12:00:00Z");
  const next = calculateNextRunAt([5], "20:00", from); // Friday=5
  eq(getIsraelDayOfWeek(next), 5, "result is Friday");
  nearlyEq(next, new Date("2024-01-05T18:00:00Z")); // winter +2 → 20:00-2=18:00 UTC
});

// ─── formatScheduleDescription ────────────────────────────────────────────────

console.log("\nformatScheduleDescription");

test("recurring Mon+Thu at 14:00", () => {
  const desc = formatScheduleDescription({
    scheduleType: "recurring",
    recurringDays: [1, 4],
    recurringTime: "14:00",
  });
  eq(desc, "כל שני וחמישי ב-14:00", "description");
});

test("recurring single day Sunday", () => {
  const desc = formatScheduleDescription({ scheduleType: "recurring", recurringDays: [0], recurringTime: "09:00" });
  eq(desc, "כל ראשון ב-09:00", "description");
});

test("once with scheduledAt", () => {
  const desc = formatScheduleDescription({
    scheduleType: "once",
    scheduledAt: "2024-07-15T11:00:00.000Z", // 14:00 Israel summer
  });
  // Just verify it contains a recognisable part
  if (!desc.startsWith("פעם אחת")) throw new Error(`unexpected: ${desc}`);
});

// ─── isDue ────────────────────────────────────────────────────────────────────

console.log("\nisDue");

test("active schedule with past nextRunAt → true", () => {
  const sched = { status: "active" as const, nextRunAt: new Date(Date.now() - 5000).toISOString() };
  eq(isDue(sched), true, "should be due");
});

test("active schedule with future nextRunAt → false", () => {
  const sched = { status: "active" as const, nextRunAt: new Date(Date.now() + 60_000).toISOString() };
  eq(isDue(sched), false, "should not be due");
});

test("paused schedule with past nextRunAt → false", () => {
  const sched = { status: "paused" as const, nextRunAt: new Date(Date.now() - 5000).toISOString() };
  eq(isDue(sched), false, "paused schedule should not fire");
});

test("active schedule with no nextRunAt → false", () => {
  const sched = { status: "active" as const, nextRunAt: undefined };
  eq(isDue(sched), false, "no nextRunAt → not due");
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("All tests passed ✓");
}

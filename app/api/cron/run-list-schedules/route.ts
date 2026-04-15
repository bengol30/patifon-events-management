import { NextResponse } from "next/server";

import { runDueListSchedules } from "@/lib/whatsapp-list-scheduler/runner";

export async function GET() {
  try {
    const result = await runDueListSchedules();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("run-list-schedules cron failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Scheduler failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}

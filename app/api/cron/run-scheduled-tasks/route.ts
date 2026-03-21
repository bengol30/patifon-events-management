import { NextResponse } from "next/server";

import { triggerScheduledTasks } from "@/lib/task-scheduler/dispatcher";

export async function GET() {
  try {
    const result = await triggerScheduledTasks();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("run-scheduled-tasks failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Scheduler failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}

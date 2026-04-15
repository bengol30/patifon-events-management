import { NextResponse } from "next/server";

import { runScheduledListMessage } from "@/lib/whatsapp-list-scheduler/runner";

/**
 * POST /api/whatsapp/list-schedule/run-now
 * Body: { scheduleId: string }
 *
 * Force-runs a specific schedule immediately, bypassing status and timing checks.
 * The schedule state is NOT updated (no lastRunAt / nextRunAt change),
 * so this is safe to use as a "test send".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scheduleId } = body as { scheduleId?: string };

    if (!scheduleId?.trim()) {
      return NextResponse.json({ ok: false, error: "scheduleId is required" }, { status: 400 });
    }

    const result = await runScheduledListMessage(scheduleId, false, /* force */ true);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[run-now] failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "שגיאה בשליחה" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { dispatchPendingAgentTriggers } from "@/lib/task-scheduler/agent-trigger-consumer";

export async function GET() {
  try {
    const result = await dispatchPendingAgentTriggers();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("dispatch-agent-triggers failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "dispatch failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}

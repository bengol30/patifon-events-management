import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { runDueListSchedules } from "@/lib/whatsapp-list-scheduler/runner";

async function handler(request: Request) {
  // If CRON_SECRET is configured, verify the caller
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const headersList = await headers();
    const incoming = headersList.get("x-cron-secret");
    if (incoming !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

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

export async function GET(request: Request) {
  return handler(request);
}

export async function POST(request: Request) {
  return handler(request);
}

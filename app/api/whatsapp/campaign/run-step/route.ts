import { NextRequest, NextResponse } from "next/server";

import { runWhatsappCampaignStep } from "@/lib/whatsapp-campaign/runner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventId = String(body.eventId || "").trim();
    const taskId = String(body.taskId || "").trim();
    const stepNumber = Number(body.stepNumber || body.step || 0);

    if (!eventId || !taskId || !Number.isFinite(stepNumber) || stepNumber <= 0) {
      return NextResponse.json({ ok: false, error: "eventId, taskId, and stepNumber are required" }, { status: 400 });
    }

    const result = await runWhatsappCampaignStep({ eventId, taskId, stepNumber });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed running campaign step" },
      { status: 500 },
    );
  }
}

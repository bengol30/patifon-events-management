import { NextResponse } from "next/server";

import { runDueWhatsappCampaignSteps } from "@/lib/whatsapp-campaign/scheduler";

export async function GET() {
  try {
    const result = await runDueWhatsappCampaignSteps();
    return NextResponse.json(result);
  } catch (error) {
    console.error("run-whatsapp-campaigns failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "WhatsApp campaign scheduler failed" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return GET();
}

import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { buildSendPlan } from "@/lib/whatsapp-campaign/builder";
import type { WhatsappCampaignEventInput, WhatsappCampaignGroup } from "@/lib/whatsapp-campaign/types";

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: "Firebase Admin not configured" }, { status: 500 });
    }

    const body = await request.json();
    const eventId = String(body.eventId || "").trim();
    const schedule = Array.isArray(body.schedule) ? body.schedule.map((item: unknown) => String(item || "").trim()).filter(Boolean) : [];
    const targetGroups = Array.isArray(body.targetGroups) ? body.targetGroups as WhatsappCampaignGroup[] : [];
    const registrationBaseUrl = String(body.registrationBaseUrl || "").trim();

    if (!eventId) return NextResponse.json({ ok: false, error: "eventId is required" }, { status: 400 });
    if (!schedule.length) return NextResponse.json({ ok: false, error: "schedule is required" }, { status: 400 });
    if (!targetGroups.length) return NextResponse.json({ ok: false, error: "targetGroups are required" }, { status: 400 });

    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    }

    const event = { id: eventSnap.id, ...(eventSnap.data() as Record<string, unknown>) } as WhatsappCampaignEventInput;
    const payload = buildSendPlan({ event, targetGroups, schedule, registrationBaseUrl });

    return NextResponse.json({ ok: true, eventId, payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed building campaign" },
      { status: 500 },
    );
  }
}

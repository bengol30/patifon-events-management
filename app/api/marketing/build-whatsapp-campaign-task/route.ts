import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { buildWhatsappCampaignDraft } from "@/lib/marketing-suggestions";
import type { WhatsappCampaignGroup } from "@/lib/whatsapp-campaign/types";

export async function POST(req: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 500 });
    const body = await req.json() as Record<string, unknown>;
    const eventId = String(body.eventId || "").trim();
    if (!eventId) return NextResponse.json({ error: "eventId חסר" }, { status: 400 });

    const eventSnap = await adminDb.collection("events").doc(eventId).get();
    if (!eventSnap.exists) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

    const groupsRaw = Array.isArray(body.targetGroups) ? body.targetGroups : null;
    const groupsSnap = groupsRaw ? null : await adminDb.collection("whatsapp_groups").limit(200).get();
    const targetGroups = (groupsRaw
      ? groupsRaw
      : groupsSnap?.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) || [])
      .map((group) => ({
        id: String((group as Record<string, unknown>).id || ""),
        name: String((group as Record<string, unknown>).name || "קבוצה ללא שם"),
        chatId: String((group as Record<string, unknown>).chatId || ""),
      }))
      .filter((group) => group.id) as WhatsappCampaignGroup[];

    const draft = buildWhatsappCampaignDraft({
      event: { id: eventSnap.id, ...(eventSnap.data() as Record<string, unknown>) },
      groups: targetGroups,
      registrationBaseUrl: String(body.registrationBaseUrl || process.env.NEXT_PUBLIC_BASE_URL || ""),
      stepCount: Number(body.stepCount || 0) || undefined,
    });

    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    console.error("build whatsapp draft failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה בבניית טיוטת קמפיין וואטסאפ" }, { status: 500 });
  }
}

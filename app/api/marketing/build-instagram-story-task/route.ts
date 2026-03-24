import { NextRequest, NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { buildInstagramStoryCampaignDraft } from "@/lib/marketing-suggestions";

export async function POST(req: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 500 });
    const body = await req.json() as Record<string, unknown>;
    const eventId = String(body.eventId || "").trim();
    if (!eventId) return NextResponse.json({ error: "eventId חסר" }, { status: 400 });

    const [eventSnap, instagramSnap] = await Promise.all([
      adminDb.collection("events").doc(eventId).get(),
      adminDb.collection("integrations").doc("instagram").get(),
    ]);
    if (!eventSnap.exists) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

    const instagramData = instagramSnap.data() || {};
    const draft = buildInstagramStoryCampaignDraft({
      event: { id: eventSnap.id, ...(eventSnap.data() as Record<string, unknown>) },
      accountId: String(body.accountId || instagramData.accountId || ""),
      storyCount: Number(body.storyCount || 0) || undefined,
      isTest: body.isTest === true,
    });

    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    console.error("build instagram draft failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "שגיאה בבניית טיוטת קמפיין סטוריז" }, { status: 500 });
  }
}

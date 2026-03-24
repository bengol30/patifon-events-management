import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 500 });
    const body = await req.json() as Record<string, unknown>;
    const eventId = String(body.eventId || "").trim();
    const suggestionType = String(body.suggestionType || "").trim();
    const action = String(body.action || "dismiss").trim();
    if (!eventId || !suggestionType) return NextResponse.json({ error: "eventId או suggestionType חסרים" }, { status: 400 });

    const status = action === "suppress" ? "SUPPRESSED" : "DISMISSED";
    const until = status === "DISMISSED" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    await adminDb.collection("marketing_suggestions_state").doc(`${eventId}_${suggestionType}`).set({
      eventId,
      suggestionType,
      status,
      until,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("update suggestion state failed", error);
    return NextResponse.json({ error: "שגיאה בעדכון מצב הצעת שיווק" }, { status: 500 });
  }
}

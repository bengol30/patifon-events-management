import { NextResponse } from "next/server";

import { adminDb } from "@/lib/firebase-admin";
import { generateMarketingSuggestions, type MarketingSuggestionStateRecord } from "@/lib/marketing-suggestions";
import type { WhatsappCampaignGroup } from "@/lib/whatsapp-campaign/types";

export async function GET() {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 500 });
    }

    const [eventsSnap, whatsappGroupsSnap, instagramSnap, stateSnap] = await Promise.all([
      adminDb.collection("events").limit(100).get(),
      adminDb.collection("whatsapp_groups").limit(200).get(),
      adminDb.collection("integrations").doc("instagram").get(),
      adminDb.collection("marketing_suggestions_state").limit(500).get(),
    ]);

    const tasksEntries = await Promise.all(eventsSnap.docs.map(async (eventDoc) => {
      const tasksSnap = await eventDoc.ref.collection("tasks").limit(100).get();
      return [eventDoc.id, tasksSnap.docs.map((taskDoc) => ({ id: taskDoc.id, ...(taskDoc.data() as Record<string, unknown>) }))] as const;
    }));

    const tasksByEventId = Object.fromEntries(tasksEntries);
    const suggestions = generateMarketingSuggestions({
      events: eventsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })),
      tasksByEventId,
      whatsappGroups: whatsappGroupsSnap.docs.map((doc) => ({
        id: doc.id,
        name: String(doc.data().name || "קבוצה ללא שם"),
        chatId: String(doc.data().chatId || ""),
      })) as WhatsappCampaignGroup[],
      instagramConnected: Boolean((instagramSnap.data() || {}).accessToken && (instagramSnap.data() || {}).accountId),
      stateRecords: stateSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as MarketingSuggestionStateRecord[],
    });

    return NextResponse.json({ ok: true, suggestions });
  } catch (error) {
    console.error("marketing suggestions failed", error);
    return NextResponse.json({ error: "שגיאה בטעינת הצעות שיווק" }, { status: 500 });
  }
}

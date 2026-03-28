import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { fetchEventContent } from "@/lib/event-content-fetcher";

const clean = (value: unknown) => String(value || "").trim();

/**
 * POST /api/marketing/refresh-content
 * 
 * Refresh campaign task content from latest event data
 * Useful when event text/media is updated after task creation
 */
export async function POST(req: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: "Firebase Admin לא מוגדר" }, { status: 500 });
    }

    const body = await req.json() as Record<string, unknown>;
    const eventId = clean(body.eventId);
    const taskId = clean(body.taskId);

    if (!eventId || !taskId) {
      return NextResponse.json({ ok: false, error: "eventId או taskId חסרים" }, { status: 400 });
    }

    // Fetch task
    const taskRef = adminDb.collection("events").doc(eventId).collection("tasks").doc(taskId);
    const taskSnap = await taskRef.get();

    if (!taskSnap.exists) {
      return NextResponse.json({ ok: false, error: "המשימה לא נמצאה" }, { status: 404 });
    }

    const task = taskSnap.data() as Record<string, unknown>;
    const specialType = clean(task.specialType);

    if (specialType !== "whatsapp_campaign_patifon" && specialType !== "instagram_story_campaign_patifon") {
      return NextResponse.json({ ok: false, error: "סוג המשימה לא נתמך" }, { status: 400 });
    }

    // Fetch latest event content
    const eventContent = await fetchEventContent(eventId);

    const payload = (task.payload || {}) as Record<string, unknown>;
    let updated = false;

    if (specialType === "whatsapp_campaign_patifon") {
      const sendPlan = Array.isArray(payload.sendPlan) ? payload.sendPlan as Record<string, unknown>[] : [];
      const nextPlan = sendPlan.map((step) => ({
        ...step,
        messageText: eventContent.text, // Update all message variants with latest text
      }));
      
      await taskRef.update({
        payload: {
          ...payload,
          messageText: eventContent.text,
          mediaUrls: eventContent.mediaUrls,
          sendPlan: nextPlan,
          messageVariants: nextPlan.map((s) => s.messageText),
        },
        description: [
          clean(task.description).split("\n\n")[0], // Keep original description
          "",
          `🔄 תוכן עודכן אוטומטית מהאירוע — ${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
        ].filter(Boolean).join("\n"),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated = true;
    }

    if (specialType === "instagram_story_campaign_patifon") {
      const storyPlan = Array.isArray(payload.storyPlan) ? payload.storyPlan as Record<string, unknown>[] : [];
      const nextPlan = storyPlan.map((step) => ({
        ...step,
        mediaUrls: eventContent.mediaUrls, // Update all story media
      }));

      await taskRef.update({
        payload: {
          ...payload,
          storyPlan: nextPlan,
        },
        description: [
          clean(task.description).split("\n\n")[0],
          "",
          `🔄 מדיה עודכנה אוטומטית מהאירוע — ${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}`,
        ].filter(Boolean).join("\n"),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated = true;
    }

    if (!updated) {
      return NextResponse.json({ ok: false, error: "לא בוצע עדכון" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      eventContent: {
        text: eventContent.text.substring(0, 100) + (eventContent.text.length > 100 ? "..." : ""),
        mediaCount: eventContent.mediaUrls.length,
      },
    });
  } catch (error) {
    console.error("refresh-content failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "שגיאה ברענון התוכן" },
      { status: 500 }
    );
  }
}

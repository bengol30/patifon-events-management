import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebase-admin";
import { buildInstagramStoryCampaignDraft, buildWhatsappCampaignDraft } from "@/lib/marketing-suggestions";
import { syncInstagramStoryScheduledPosts } from "@/lib/instagram-story-campaign/scheduler";
import { buildDefaultCampaignControls, syncCampaignControlsWithTask } from "@/lib/marketing-campaign-controls";
import type { WhatsappCampaignGroup } from "@/lib/whatsapp-campaign/types";

export async function POST(req: NextRequest) {
  try {
    if (!adminDb) return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 500 });
    const body = await req.json() as Record<string, unknown>;
    const eventId = String(body.eventId || "").trim();
    const suggestionType = String(body.suggestionType || "").trim();
    if (!eventId || !suggestionType) return NextResponse.json({ error: "eventId או suggestionType חסרים" }, { status: 400 });

    const eventRef = adminDb.collection("events").doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

    let draft;
    if (suggestionType === "whatsapp_campaign") {
      const targetGroups = (Array.isArray(body.targetGroups) ? body.targetGroups : []).map((group) => ({
        id: String((group as Record<string, unknown>).id || ""),
        name: String((group as Record<string, unknown>).name || "קבוצה ללא שם"),
        chatId: String((group as Record<string, unknown>).chatId || ""),
      })).filter((group) => group.id) as WhatsappCampaignGroup[];
      draft = buildWhatsappCampaignDraft({
        event: { id: eventSnap.id, ...(eventSnap.data() as Record<string, unknown>) },
        groups: targetGroups,
        registrationBaseUrl: String(body.registrationBaseUrl || process.env.NEXT_PUBLIC_BASE_URL || ""),
        stepCount: Number(body.stepCount || 0) || undefined,
      });
      const payload = draft.payload as any;
      if (typeof body.messageText === "string" && body.messageText.trim()) {
        const messageText = body.messageText.trim();
        payload.messageText = messageText;
        payload.sendPlan = (payload.sendPlan || []).map((step: any) => ({ ...step, messageText }));
        payload.messageVariants = (payload.sendPlan || []).map((step: any) => step.messageText || messageText);
      }
      if (Array.isArray(body.schedule)) {
        const nextSchedule = body.schedule.map((value) => String(value || "").trim()).filter(Boolean);
        if (nextSchedule.length) {
          draft = buildWhatsappCampaignDraft({
            event: { id: eventSnap.id, ...(eventSnap.data() as Record<string, unknown>) },
            groups: targetGroups,
            registrationBaseUrl: String(body.registrationBaseUrl || process.env.NEXT_PUBLIC_BASE_URL || ""),
            stepCount: nextSchedule.length,
          });
          (draft.payload as any).sendPlan = (draft.payload as any).sendPlan.map((step: any, index: number) => ({
            ...step,
            scheduledAt: nextSchedule[index] || step.scheduledAt,
            scheduledLabel: nextSchedule[index] || step.scheduledLabel,
          }));
          draft.dueDate = nextSchedule[0] || draft.dueDate;
        }
      }
    } else if (suggestionType === "instagram_story_campaign") {
      draft = buildInstagramStoryCampaignDraft({
        event: { id: eventSnap.id, ...(eventSnap.data() as Record<string, unknown>) },
        accountId: String(body.accountId || ""),
        storyCount: Number(body.storyCount || 0) || undefined,
        isTest: body.isTest === true,
      });
      const payload = draft.payload as any;
      if (Array.isArray(body.storyPlan) && body.storyPlan.length) {
        payload.storyPlan = body.storyPlan;
        draft.requiredCompletions = body.storyPlan.length;
        draft.remainingCompletions = body.storyPlan.length;
      }
    } else {
      return NextResponse.json({ error: "suggestionType לא נתמך" }, { status: 400 });
    }

    const adminUserId = process.env.ADMIN_USER_ID || "oeOslKHvZwPWHH6u0kAJuSLQZSg1";
    const adminUserName = process.env.ADMIN_USER_NAME || "בן גולן";
    const adminUserEmail = process.env.ADMIN_USER_EMAIL || "bengo0469@gmail.com";

    const isWhatsappCampaign = draft.specialType === "whatsapp_campaign_patifon";
    const firstScheduledAt = isWhatsappCampaign
      ? String(((draft.payload as any)?.sendPlan?.[0]?.scheduledAt) || draft.dueDate || "")
      : "";

    const taskPayload = {
      title: draft.title,
      description: draft.description,
      status: draft.status,
      priority: draft.priority,
      executionMode: isWhatsappCampaign ? "AUTOMATED" : draft.executionMode,
      requiredCompletions: draft.requiredCompletions,
      remainingCompletions: draft.remainingCompletions,
      dueDate: draft.dueDate,
      scheduledAt: isWhatsappCampaign ? firstScheduledAt || null : null,
      scheduleStatus: isWhatsappCampaign ? "PENDING" : null,
      specialType: draft.specialType,
      payload: draft.payload,
      eventId,
      eventTitle: draft.eventTitle,
      assignee: adminUserName,
      assigneeId: adminUserId,
      assigneeEmail: adminUserEmail,
      assignees: [{ name: adminUserName, userId: adminUserId, email: adminUserEmail }],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      currentStatus: isWhatsappCampaign ? "0 מתוך " + String(draft.requiredCompletions || 0) + " הושלמו" : "משימה חדשה נוצרה ממערכת ההצעות",
      nextStep: isWhatsappCampaign ? String(((draft.payload as any)?.sendPlan?.[0]?.scheduledLabel) || "ממתין לשליחה הראשונה") : "סקור את הפרטים ובצע לפי התוכנית",
      campaignControls: syncCampaignControlsWithTask({ specialType: draft.specialType, payload: draft.payload }, buildDefaultCampaignControls({ specialType: draft.specialType, payload: draft.payload })),
    };

    const taskRef = await eventRef.collection("tasks").add(taskPayload);

    if (draft.specialType === "instagram_story_campaign_patifon") {
      await syncInstagramStoryScheduledPosts({
        eventId,
        taskId: taskRef.id,
        payload: taskPayload.payload as unknown as Record<string, unknown>,
      });
    }

    await adminDb.collection("marketing_suggestions_state").doc(`${eventId}_${suggestionType}`).set({
      eventId,
      suggestionType,
      status: "ACCEPTED",
      acceptedAt: FieldValue.serverTimestamp(),
      taskId: taskRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ ok: true, taskId: taskRef.id, task: { id: taskRef.id, ...taskPayload } });
  } catch (error) {
    console.error("create marketing task failed", error);
    return NextResponse.json({ error: "שגיאה ביצירת משימת שיווק" }, { status: 500 });
  }
}

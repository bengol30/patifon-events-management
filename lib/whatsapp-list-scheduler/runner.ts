import admin from "firebase-admin";
import { adminDb } from "../firebase-admin";
import { readWhatsappConfig } from "../whatsapp-campaign/sender";
import { calculateNextRunAt } from "./schedule-calc";
import type { ListSchedule } from "./types";

// ─── Storage cleanup helper ───────────────────────────────────────────────────

/** Extracts the object path from a Firebase Storage download URL, or null for external URLs */
function storagePathFromUrl(url: string): string | null {
  if (!url.includes("firebasestorage.googleapis.com")) return null;
  const match = url.match(/\/o\/([^?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function deleteStorageFile(mediaUrl: string): Promise<void> {
  const path = storagePathFromUrl(mediaUrl);
  if (!path) return; // external URL, nothing to delete
  try {
    const bucket = admin.storage().bucket();
    await bucket.file(path).delete();
  } catch (err) {
    console.warn("[runner] Could not delete media from Storage (non-critical):", err);
  }
}

// ─── Phone normalisation (same logic as settings page) ───────────────────────

function normalizePhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

// ─── Low-level Green-API wrappers (work for both @c.us and @g.us) ─────────────

async function greenApiSendText(
  chatId: string,
  message: string,
  cfg: { idInstance: string; apiTokenInstance: string; baseUrl: string },
): Promise<void> {
  const endpoint = `${cfg.baseUrl}/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp text send failed (${res.status}): ${text}`);
  }
}

async function greenApiSendFile(
  chatId: string,
  urlFile: string,
  caption: string,
  cfg: { idInstance: string; apiTokenInstance: string; baseUrl: string },
): Promise<void> {
  const endpoint = `${cfg.baseUrl}/waInstance${cfg.idInstance}/SendFileByUrl/${cfg.apiTokenInstance}`;
  // Firebase Storage URLs encode '/' as '%2F', so decode the last path segment
  // and extract only the actual filename (after the last '/').
  const rawSegment = urlFile.split("?")[0].split("/").pop() ?? "media";
  const decoded = (() => { try { return decodeURIComponent(rawSegment); } catch { return rawSegment; } })();
  const fileName = decoded.includes("/") ? (decoded.split("/").pop() ?? "media") : decoded;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      urlFile,
      fileName,
      ...(caption ? { caption } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp file send failed (${res.status}): ${text}`);
  }
}

// ─── Rate-limit helper (1 msg / second) ───────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Core execution ───────────────────────────────────────────────────────────

export interface RunScheduleResult {
  skipped?: boolean;
  reason?: string;
  dry?: boolean;
  successCount?: number;
  failures?: { id: string; name: string; reason: string }[];
}

/**
 * Execute a single scheduled list message.
 * @param dry    If true, no messages are sent – only validates and returns info.
 * @param force  If true, bypasses status check (useful for manual "send now" testing).
 *               In force mode the schedule state is NOT updated afterwards.
 */
export async function runScheduledListMessage(
  scheduleId: string,
  dry = false,
  force = false,
): Promise<RunScheduleResult> {
  if (!adminDb) throw new Error("Firebase Admin not configured");

  const schedRef = adminDb.collection("whatsapp_list_schedules").doc(scheduleId);
  const schedSnap = await schedRef.get();
  if (!schedSnap.exists) throw new Error(`Schedule ${scheduleId} not found`);

  const sched = { id: schedSnap.id, ...schedSnap.data() } as ListSchedule;

  if (!force && sched.status !== "active") return { skipped: true, reason: `status=${sched.status}` };

  // Load the list
  const listSnap = await adminDb.collection("whatsapp_sending_lists").doc(sched.listId).get();
  if (!listSnap.exists) {
    await schedRef.update({ status: "failed" });
    throw new Error(`Sending list ${sched.listId} not found – schedule marked failed`);
  }

  const members: Array<{
    type: string;
    id: string;
    name: string;
    phone?: string;
    chatId?: string;
  }> = (listSnap.data() as any).members ?? [];

  if (!members.length) return { skipped: true, reason: "empty list" };

  if (dry) return { dry: true, successCount: 0, failures: [] };

  // Resolve message content
  const cfg = await readWhatsappConfig();
  if (!cfg) throw new Error("WhatsApp configuration missing");

  let messageText = sched.messageText ?? "";
  // Custom mediaUrl uploaded by the user takes precedence over anything derived later
  let mediaUrl = sched.mediaUrl ?? "";

  if (sched.sendMode === "event" && sched.eventId) {
    const eventSnap = await adminDb.collection("events").doc(sched.eventId).get();
    if (eventSnap.exists) {
      const ed = eventSnap.data() as Record<string, any>;
      messageText = String(ed.officialPostText ?? "").trim();
      // Only fall back to the event flyer when no custom media was explicitly set
      if (!mediaUrl) {
        mediaUrl = String(ed.officialFlyerUrl ?? "").trim();
      }
    }
    if (!messageText) throw new Error("אין מלל רשמי לאירוע");
  }

  if (!messageText && !mediaUrl) throw new Error("אין תוכן להודעה – לא הוגדרו טקסט ולא מדיה");

  // Send to each member
  const failures: { id: string; name: string; reason: string }[] = [];
  let successCount = 0;

  for (const member of members) {
    let chatId = "";

    if (member.type === "wa_group") {
      chatId = member.chatId ?? "";
    } else {
      const phone = normalizePhone(member.phone ?? "");
      if (!phone) {
        failures.push({ id: member.id, name: member.name, reason: "חסר מספר טלפון" });
        continue;
      }
      chatId = `${phone}@c.us`;
    }

    if (!chatId) {
      failures.push({ id: member.id, name: member.name, reason: "לא ניתן לקבוע chatId" });
      continue;
    }

    try {
      if (mediaUrl) {
        await greenApiSendFile(chatId, mediaUrl, messageText, cfg);
      } else {
        await greenApiSendText(chatId, messageText, cfg);
      }
      successCount++;
      await sleep(1200); // ~1 msg/sec rate limit
    } catch (err) {
      failures.push({
        id: member.id,
        name: member.name,
        reason: err instanceof Error ? err.message : "שגיאה",
      });
    }
  }

  // Save to message history (before any media cleanup)
  if (successCount > 0 && (messageText || mediaUrl)) {
    try {
      const isRecurring = sched.scheduleType === "recurring";
      await adminDb.collection("whatsapp_message_history").add({
        messageText,
        mediaUrl: mediaUrl || "",
        // For recurring: file stays in storage. For once: file will be deleted below.
        mediaAvailable: isRecurring || !mediaUrl,
        sentAt: admin.firestore.Timestamp.now(),
        listId: sched.listId,
        listName: sched.listName,
        source: isRecurring ? "scheduled_recurring" : "scheduled_once",
      });
    } catch (histErr) {
      console.warn("[runner] Failed to save message history (non-critical):", histErr);
    }
  }

  // Update schedule state (skipped in force/test mode)
  if (!force) {
    const now = new Date().toISOString();
    if (sched.scheduleType === "once") {
      // Delete media from Storage – one-time schedule is done, file no longer needed
      if (mediaUrl) await deleteStorageFile(mediaUrl);
      await schedRef.update({
        status: "done",
        lastRunAt: now,
        nextRunAt: null,
        ...(mediaUrl ? { mediaUrl: admin.firestore.FieldValue.delete() } : {}),
      });
    } else {
      // Recurring – keep media for future runs
      const nextRun = calculateNextRunAt(sched.recurringDays ?? [], sched.recurringTime ?? "09:00");
      await schedRef.update({ lastRunAt: now, nextRunAt: nextRun.toISOString() });
    }
  }

  return { successCount, failures };
}

// ─── Batch runner (called by cron) ───────────────────────────────────────────

export async function runDueListSchedules(): Promise<{
  scanned: number;
  due: number;
  results: Array<{ id: string; status: string; detail?: string }>;
}> {
  if (!adminDb) throw new Error("Firebase Admin not configured");

  const now = new Date();

  // Fetch all active schedules; in-memory filter avoids requiring a composite index
  const snap = await adminDb
    .collection("whatsapp_list_schedules")
    .where("status", "==", "active")
    .limit(100)
    .get();

  const due = snap.docs.filter((d) => {
    const nextRunAt = d.data().nextRunAt as string | undefined;
    return !!nextRunAt && new Date(nextRunAt) <= now;
  });

  const results: Array<{ id: string; status: string; detail?: string }> = [];

  for (const docSnap of due) {
    try {
      const result = await runScheduledListMessage(docSnap.id);
      results.push({
        id: docSnap.id,
        status: result.skipped ? "skipped" : "sent",
        detail: result.skipped ? result.reason : `sent=${result.successCount}, failed=${result.failures?.length ?? 0}`,
      });
    } catch (err) {
      results.push({
        id: docSnap.id,
        status: "error",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { scanned: snap.size, due: due.length, results };
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { assertValidGreenApiBaseUrl, DEFAULT_GREEN_API_BASE_URL } from '@/lib/whatsapp-base-url';
import { buildConversationSummaryFromRecentMessages } from '@/lib/imagine-followup-state';

export const dynamic = 'force-dynamic';

const normalizePhoneForWhatsApp = (phone: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
};

const readWhatsappConfig = async () => {
  const envId = process.env.WHATSAPP_ID_INSTANCE || process.env.NEXT_PUBLIC_WHATSAPP_ID_INSTANCE;
  const envToken = process.env.WHATSAPP_API_TOKEN || process.env.NEXT_PUBLIC_WHATSAPP_API_TOKEN;
  const envBase = process.env.WHATSAPP_BASE_URL || process.env.NEXT_PUBLIC_WHATSAPP_BASE_URL;
  if (envId && envToken) {
    return {
      idInstance: envId,
      apiTokenInstance: envToken,
      baseUrl: assertValidGreenApiBaseUrl(envBase || DEFAULT_GREEN_API_BASE_URL),
    };
  }

  if (!adminDb) return null;
  const snap = await adminDb.collection('integrations').doc('whatsapp').get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (!data?.idInstance || !data?.apiTokenInstance) return null;

  return {
    idInstance: String(data.idInstance),
    apiTokenInstance: String(data.apiTokenInstance),
    baseUrl: assertValidGreenApiBaseUrl(String(data.baseUrl || DEFAULT_GREEN_API_BASE_URL)),
  };
};

const sendWhatsappText = async (phone: string, message: string) => {
  const cfg = await readWhatsappConfig();
  if (!cfg) throw new Error('חסרות הגדרות וואטסאפ');

  const phoneClean = normalizePhoneForWhatsApp(phone);
  if (!phoneClean) throw new Error('מספר טלפון לא תקין');

  const endpoint = `${cfg.baseUrl}/waInstance${cfg.idInstance}/SendMessage/${cfg.apiTokenInstance}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: `${phoneClean}@c.us`,
      message,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Green API error (${res.status})`);
  }

  return true;
};

/**
 * Sends due scheduled Imagine Me CRM follow-up messages.
 * Triggered by cron together with other scheduled PATIFON tasks.
 */
export async function POST() {
  try {
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    const now = new Date();

    const tasksSnap = await adminDb
      .collection('projects')
      .doc(IMAGINE_ME_PROJECT_ID)
      .collection('tasks')
      .where('scheduleStatus', '==', 'PENDING')
      .limit(50)
      .get();

    const dueTasks = tasksSnap.docs.filter((doc) => {
      const data = doc.data() as any;
      const isImagineMe = data?.customData?.crmActionType === 'send_followup_message';
      const scheduledAtRaw = data?.scheduledAt || data?.customData?.suggestedSendAt || null;
      if (!isImagineMe || !scheduledAtRaw) return false;
      const scheduledAt = new Date(String(scheduledAtRaw));
      return !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() <= now.getTime();
    });

    const results: Array<{ taskId: string; status: string; detail?: string }> = [];

    for (const taskDoc of dueTasks) {
      const data = taskDoc.data() as any;
      const customData = data?.customData || {};
      const phone = String(customData.phone || '').trim();
      const messageText = String(customData.pendingFollowupMessage || '').trim();

      if (!phone || !messageText) {
        await taskDoc.ref.update({
          scheduleStatus: 'FAILED',
          executionResult: 'Missing phone or pendingFollowupMessage',
          schedulerLastRunAt: new Date().toISOString(),
        });
        results.push({ taskId: taskDoc.id, status: 'FAILED', detail: 'Missing phone or pendingFollowupMessage' });
        continue;
      }

      try {
        await sendWhatsappText(phone, messageText);

        const nowIso = new Date().toISOString();
        const sentTimestamp = Math.floor(Date.now() / 1000);
        const recentMessages = [
          {
            from: 'us',
            type: 'outgoing',
            text: messageText,
            timestamp: sentTimestamp,
          },
          ...(Array.isArray(customData?.recentMessages) ? customData.recentMessages : []),
        ].slice(0, 5);
        const derived = buildConversationSummaryFromRecentMessages({
          customerName: String(data?.title || '').split(' - ')[0],
          existingSummary: customData?.conversationSummary || '',
          recentMessages,
          messageSent: messageText,
        });

        await taskDoc.ref.update({
          status: 'IN_PROGRESS',
          scheduleStatus: 'DONE',
          executionMode: 'EXTERNAL_ACTION',
          executionResult: 'Imagine Me scheduled follow-up sent',
          currentStatus: derived.currentStatus,
          nextStep: derived.nextStep,
          priority: data?.priority || derived.priority || 'NORMAL',
          dueDate: data?.dueDate || data?.scheduledAt || null,
          customData: {
            ...customData,
            followUpStatus: derived.followUpStatus,
            lastContactDate: nowIso,
            lastMessageSent: messageText,
            lastScheduledSendAt: data?.scheduledAt || customData?.suggestedSendAt || null,
            recentMessages,
            conversationSummary: derived.summary,
            pendingFollowupMessage: '',
            crmActionType: 'send_followup_message',
          },
        });

        results.push({ taskId: taskDoc.id, status: 'SENT' });
      } catch (error: any) {
        await taskDoc.ref.update({
          scheduleStatus: 'FAILED',
          executionMode: 'EXTERNAL_ACTION',
          executionResult: error?.message || 'Scheduled send failed',
          schedulerLastRunAt: new Date().toISOString(),
        });
        results.push({ taskId: taskDoc.id, status: 'FAILED', detail: error?.message || 'Scheduled send failed' });
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: tasksSnap.size,
      due: dueTasks.length,
      results,
    });
  } catch (error: any) {
    console.error('imagine send-scheduled failed', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}

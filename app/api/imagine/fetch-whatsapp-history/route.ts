import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { transcribeWhatsappVoiceFromUrl } from '@/lib/whatsapp-voice-transcription';

export const dynamic = 'force-dynamic';

/**
 * Fetch WhatsApp history for Imagine Me CRM
 * ONLY used by Imagine Me project - not system-wide
 */
export async function POST(request: Request) {
  try {
    const { phone, taskId, projectId } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Phone number required' }, { status: 400 });
    }

    // Normalize phone for WhatsApp (same logic as PATIFON's send endpoint)
    const normalizePhone = (p: string) => {
      const digits = (p || '').replace(/\D/g, '');
      if (!digits) return '';
      if (digits.startsWith('00')) return digits.slice(2);
      if (digits.startsWith('972')) return digits;
      if (digits.startsWith('0')) return `972${digits.slice(1)}`;
      return digits;
    };

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json({ ok: false, error: 'Invalid phone number' }, { status: 400 });
    }

    const chatId = `${normalizedPhone}@c.us`;

    // Get WhatsApp settings from Firestore
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    const whatsappDoc = await adminDb.collection('integrations').doc('whatsapp').get();
    const whatsappData = whatsappDoc.data() as { idInstance?: string; apiTokenInstance?: string } | undefined;

    if (!whatsappData?.idInstance || !whatsappData?.apiTokenInstance) {
      return NextResponse.json(
        { ok: false, error: 'WhatsApp not configured in PATIFON' },
        { status: 500 }
      );
    }

    const instanceId = whatsappData.idInstance;
    const token = whatsappData.apiTokenInstance;
    const apiUrl = `https://api.green-api.com/waInstance${instanceId}`;

    // Get last 70 messages
    const messagesRes = await fetch(`${apiUrl}/getChatHistory/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        count: 70,
      }),
    });

    if (!messagesRes.ok) {
      const errorText = await messagesRes.text();
      return NextResponse.json(
        { ok: false, error: `Green API error: ${errorText}` },
        { status: messagesRes.status }
      );
    }

    const messages = await messagesRes.json();

    // Filter messages from 10.2.2026 onwards
    const cutoffDate = new Date('2026-02-10T00:00:00Z').getTime() / 1000; // Unix timestamp

    const filteredMessages = Array.isArray(messages)
      ? messages
          .filter((msg: any) => msg.timestamp >= cutoffDate)
          .sort((a, b) => b.timestamp - a.timestamp)
      : [];

    const formattedMessages = await Promise.all(
      filteredMessages.map(async (msg: any) => {
        const typeMessage = String(msg.typeMessage || '');
        const isVoice = typeMessage === 'audioMessage' || typeMessage === 'pttMessage';
        let text = msg.textMessage || msg.extendedTextMessage?.text || '';

        if (!text && isVoice && msg.downloadUrl) {
          try {
            const transcript = await transcribeWhatsappVoiceFromUrl(String(msg.downloadUrl));
            text = transcript ? `[הודעה קולית מתומללת] ${transcript}` : '[הודעה קולית ללא תמלול]';
          } catch (error) {
            console.error('voice transcription failed', { idMessage: msg.idMessage, error });
            text = '[הודעה קולית - התמלול נכשל]';
          }
        }

        if (!text) {
          text = isVoice ? '[הודעה קולית]' : '[media]';
        }

        return {
          timestamp: msg.timestamp,
          from: msg.type === 'incoming' ? 'customer' : 'us',
          text,
          type: msg.type,
          typeMessage,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      phone,
      chatId,
      messageCount: formattedMessages.length,
      messages: formattedMessages,
    });
  } catch (error: any) {
    console.error('fetch-whatsapp-history error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

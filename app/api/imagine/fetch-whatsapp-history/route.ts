import { NextResponse } from 'next/server';

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

    // Format phone for WhatsApp (remove + and spaces)
    const formattedPhone = phone.replace(/[\s\+\-]/g, '');
    const chatId = `${formattedPhone}@c.us`;

    // Get WhatsApp settings
    const whatsappSettings = await fetch(
      `${process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || ''}/settings/whatsapp.json`
    ).then((r) => r.json());

    if (!whatsappSettings?.instanceId || !whatsappSettings?.token) {
      return NextResponse.json(
        { ok: false, error: 'WhatsApp not configured in PATIFON' },
        { status: 500 }
      );
    }

    const { instanceId, token } = whatsappSettings;
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

    // Format for AI processing
    const formattedMessages = Array.isArray(messages)
      ? messages.map((msg: any) => ({
          timestamp: msg.timestamp,
          from: msg.chatId === chatId ? 'customer' : 'us',
          text: msg.textMessage || msg.extendedTextMessage?.text || '[media]',
        }))
      : [];

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

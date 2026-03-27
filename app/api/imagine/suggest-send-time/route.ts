import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const clampToBusinessHours = (date: Date) => {
  const next = new Date(date);
  const hour = next.getHours();

  if (hour < 9) {
    next.setHours(10, 0, 0, 0);
    return next;
  }

  if (hour >= 20) {
    next.setDate(next.getDate() + 1);
    next.setHours(10, 0, 0, 0);
    return next;
  }

  return next;
};

const roundToQuarterHour = (date: Date) => {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;
  if (rounded === 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(rounded, 0, 0);
  }
  return next;
};

const buildFallbackSuggestion = (recentMessages?: any[]) => {
  const mostRecent = Array.isArray(recentMessages) && recentMessages.length > 0 ? recentMessages[0] : null;
  const now = new Date();
  let suggestion = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  let reason = 'ברירת מחדל: חלון עדין של כשעתיים קדימה בשעות סבירות.';

  if (mostRecent?.timestamp) {
    const lastDate = new Date(Number(mostRecent.timestamp) * 1000);
    const hoursSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
    const lastHour = lastDate.getHours();
    const lastFrom = String(mostRecent.from || '');

    if (lastFrom === 'customer') {
      if (lastHour >= 20 || lastHour < 8) {
        suggestion = new Date(now);
        suggestion.setDate(suggestion.getDate() + 1);
        suggestion.setHours(10, 0, 0, 0);
        reason = 'הלקוח כתב בשעות ערב/לילה — עדיף לענות מחר בבוקר.';
      } else {
        suggestion = new Date(now.getTime() + 60 * 60 * 1000);
        reason = 'הלקוח כתב לאחרונה — עדיף לחזור יחסית מהר אבל לא מיידית.';
      }
    } else if (hoursSinceLast < 24) {
      suggestion = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000);
      reason = 'בן היה האחרון שכתב לאחרונה — עדיף לתת לשיחה לנשום בערך יום.';
    } else if (hoursSinceLast < 72) {
      suggestion = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      reason = 'עבר מעט זמן מההודעה האחרונה — עדיף follow-up עדין מחר.';
    } else {
      suggestion = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      reason = 'עבר זמן מהשיחה — אפשר לקבוע חלון קרוב וסביר.';
    }
  }

  suggestion = roundToQuarterHour(clampToBusinessHours(suggestion));
  return { suggestedSendAt: suggestion.toISOString(), reason, confidence: 'fallback' };
};

/**
 * Suggest a smart default send time for Imagine Me CRM follow-up messages.
 */
export async function POST(request: Request) {
  try {
    const {
      customerName,
      company,
      eventType,
      eventDate,
      conversationSummary,
      recentMessages,
      draftMessage,
      projectId,
    } = await request.json();

    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!customerName) {
      return NextResponse.json({ ok: false, error: 'Customer name required' }, { status: 400 });
    }

    const fallback = buildFallbackSuggestion(recentMessages);

    const systemPrompt = `You are an AI sales assistant for Imagine Me.

Your job: suggest the BEST default WhatsApp send time for Ben's follow-up message.

Rules:
- Output JSON only.
- suggestedSendAt must be an ISO datetime string.
- Timezone is Asia/Jerusalem.
- Prefer reasonable send windows: 09:00-20:00 local time.
- Avoid sending immediately unless clearly urgent.
- Use the conversation summary and most recent messages first.
- If the customer wrote something like "tomorrow", "in the evening", "next week", "after the holiday", align to that.
- If Ben was the last sender very recently, wait longer.
- If customer asked something and is waiting, suggest a sooner time.
- If confidence is low, still give the best practical default.

Return shape:
{
  "suggestedSendAt": "ISO_STRING",
  "reason": "short Hebrew explanation",
  "confidence": "high|medium|low"
}`;

    const userPrompt = {
      nowLocal: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }),
      customerName,
      company: company || null,
      eventType: eventType || null,
      eventDate: eventDate || null,
      draftMessage: draftMessage || null,
      recentMessages: Array.isArray(recentMessages)
        ? recentMessages.slice(0, 5).map((m: any) => ({
            from: m.from,
            timestamp: m.timestamp,
            localTime: m.timestamp ? new Date(Number(m.timestamp) * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }) : null,
            text: String(m.text || '').slice(0, 500),
          }))
        : [],
      conversationSummary: conversationSummary || null,
      fallback,
    };

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPrompt) },
        ],
        temperature: 0.2,
        max_tokens: 220,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      return NextResponse.json({ ok: true, ...fallback });
    }

    const openaiData = await openaiRes.json();
    const parsed = JSON.parse(openaiData.choices?.[0]?.message?.content || '{}');

    const raw = parsed?.suggestedSendAt ? new Date(parsed.suggestedSendAt) : new Date(fallback.suggestedSendAt);
    const normalized = roundToQuarterHour(clampToBusinessHours(raw));

    return NextResponse.json({
      ok: true,
      suggestedSendAt: normalized.toISOString(),
      reason: typeof parsed?.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : fallback.reason,
      confidence: ['high', 'medium', 'low'].includes(parsed?.confidence) ? parsed.confidence : fallback.confidence,
    });
  } catch (error: any) {
    console.error('suggest-send-time error:', error);
    const fallback = buildFallbackSuggestion([]);
    return NextResponse.json({ ok: true, ...fallback });
  }
}

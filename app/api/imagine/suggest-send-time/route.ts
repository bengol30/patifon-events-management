import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type RecentMessage = {
  from?: string;
  text?: string;
  timestamp?: number;
};

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

const extractCadenceHours = (recentMessages: RecentMessage[]) => {
  const sorted = [...recentMessages]
    .filter((msg) => Number.isFinite(Number(msg?.timestamp)))
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = Number(sorted[i - 1].timestamp || 0) * 1000;
    const curr = Number(sorted[i].timestamp || 0) * 1000;
    const diffHours = (curr - prev) / (1000 * 60 * 60);
    if (diffHours > 2) {
      diffs.push(diffHours);
    }
  }

  if (!diffs.length) return null;
  const avg = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  return Math.max(24, avg);
};

const buildFallbackSuggestion = (recentMessages?: RecentMessage[], conversationSummary?: string) => {
  const messages = Array.isArray(recentMessages) ? recentMessages : [];
  const mostRecent = messages.length > 0 ? messages[0] : null;
  const now = new Date();
  const summaryText = String(conversationSummary || '').toLowerCase();
  const cadenceHours = extractCadenceHours(messages);

  let suggestion = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  let reason = 'ברירת מחדל: להשאיר מרווח טבעי של כמה ימים, אלא אם השיחה מרמזת על מועד קרוב יותר.';

  if (/מחר|tomorrow/.test(summaryText)) {
    suggestion = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    reason = 'בסיכום השיחה יש רמז למחר, אז ההמלצה נשארת קרובה יחסית.';
  } else if (/יומיים|עוד יומיים|48 שעות|two days/.test(summaryText)) {
    suggestion = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    reason = 'בסיכום השיחה יש רמז לעוד יומיים, אז ההמלצה מותאמת לזה.';
  } else if (/שבוע הבא|next week|אחרי החג|after the holiday/.test(summaryText)) {
    suggestion = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    reason = 'בסיכום השיחה יש רמז למועד רחב יותר, לכן ההמלצה נדחית בכמה ימים.';
  } else if (cadenceHours) {
    if (cadenceHours >= 96) {
      suggestion = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      reason = 'קצב ההתכתבות בפועל מרווח, אז עדיף follow-up בעוד כמה ימים ולא מהר מדי.';
    } else if (cadenceHours >= 48) {
      suggestion = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      reason = 'קצב ההתכתבות הוא בערך כל יומיים-שלושה, אז זו ברירת מחדל טבעית יותר.';
    } else {
      suggestion = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      reason = 'גם בשיחה יחסית צפופה עדיף לא להציק, אז ברירת המחדל היא סביב יומיים קדימה.';
    }
  }

  if (mostRecent?.timestamp) {
    const lastDate = new Date(Number(mostRecent.timestamp) * 1000);
    const hoursSinceLast = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
    const lastFrom = String(mostRecent.from || '');

    if (lastFrom === 'customer' && hoursSinceLast < 12 && !/מחר|יומיים|שבוע הבא|אחרי החג/.test(summaryText)) {
      suggestion = new Date(now.getTime() + 36 * 60 * 60 * 1000);
      reason = 'הלקוח כתב לאחרונה, אבל בלי רמז ללחץ מיידי — עדיף מרווח עדין של בערך יום וחצי.';
    }

    if (lastFrom !== 'customer' && hoursSinceLast < 48 && !/מחר|יומיים/.test(summaryText)) {
      suggestion = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
      reason = 'בן היה האחרון שכתב לא מזמן, אז עדיף לתת עוד אוויר לפני follow-up נוסף.';
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

    const messages = Array.isArray(recentMessages) ? recentMessages : [];
    const fallback = buildFallbackSuggestion(messages, conversationSummary);

    const systemPrompt = `You are an AI sales assistant for Imagine Me.

Your job: suggest the BEST default WhatsApp send time for Ben's follow-up message.

Critical behavior:
- Default to a SPACED-OUT follow-up, not a close one.
- Do NOT suggest tomorrow just because it's possible.
- Use the real cadence of the conversation and what was actually said.
- If the conversation clearly implies tomorrow / in two days / next week / after the holiday, follow that.
- Otherwise prefer a calmer delay: usually 2-5 days, sometimes more.
- If Ben was the last sender, wait even longer.
- If the customer explicitly asked for a quick reply, you may shorten the window.

Rules:
- Output JSON only.
- suggestedSendAt must be an ISO datetime string.
- Timezone is Asia/Jerusalem.
- Prefer reasonable send windows: 09:00-20:00 local time.
- Base your answer first on the actual wording of the conversation, then on cadence.
- Avoid pushy timing.

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
      cadenceHintHours: extractCadenceHours(messages),
      recentMessages: messages.slice(0, 5).map((m: any) => ({
        from: m.from,
        timestamp: m.timestamp,
        localTime: m.timestamp ? new Date(Number(m.timestamp) * 1000).toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }) : null,
        text: String(m.text || '').slice(0, 500),
      })),
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
        max_tokens: 260,
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

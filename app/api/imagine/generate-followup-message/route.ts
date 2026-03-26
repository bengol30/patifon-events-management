import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Generate AI-powered follow-up message for Imagine Me CRM
 * ONLY used by Imagine Me project - not system-wide
 */
export async function POST(request: Request) {
  try {
    const {
      customerName,
      company,
      eventType,
      eventDate,
      eventLocation,
      whatsappHistory,
      recentMessages,
      projectId,
    } = await request.json();

    // Safety: only allow for Imagine Me project
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

    // Calculate time since last message
    let daysSinceLastMessage = null;
    let lastMessageDate = null;
    if (recentMessages && recentMessages.length > 0) {
      const lastMsg = recentMessages[0]; // Most recent
      lastMessageDate = new Date(lastMsg.timestamp * 1000);
      const now = new Date();
      daysSinceLastMessage = Math.floor((now.getTime() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const systemPrompt = `You are Ben from Imagine Me, writing a personal WhatsApp message to a past client.

**Your business:**
- **Event Booth** - Come to events with AI photo equipment, print on magnets/wood
- **Imagen Wow** - Online link for company employees to get AI photos

**Writing style:**
- SHORT and natural (like a real WhatsApp message)
- Friendly and human, not corporate
- Use emojis sparingly (1-2 max)
- Hebrew, casual tone
- Maximum 2-3 sentences

**Context:**
- Customer: ${customerName}${company ? ` from ${company}` : ''}
- Past event: ${eventType || 'אירוע'} ${eventDate ? `(${eventDate})` : ''}
${daysSinceLastMessage !== null ? `- Days since last contact: ${daysSinceLastMessage}` : ''}

**Recent messages (last 5):**
${recentMessages && recentMessages.length > 0 ? recentMessages.map((m: any) => {
  const date = new Date(m.timestamp * 1000);
  const sender = m.from === 'customer' ? customerName : 'אני (בן)';
  return `${sender} (${date.toLocaleDateString('he-IL')}): ${m.text.substring(0, 80)}`;
}).join('\n') : 'אין היסטוריה'}

**Your message strategy:**
${daysSinceLastMessage && daysSinceLastMessage > 7 ? `
- It's been ${daysSinceLastMessage} days - send a GENTLE reminder
- Don't pressure, just check in
- Ask if they have upcoming events
` : `
- Continue the conversation naturally
- Reference the last exchange if relevant
- Offer help or ask about future events
`}

${whatsappHistory ? `\n**Conversation summary:**\n${whatsappHistory}` : ''}

Write ONE short WhatsApp message in Hebrew. Natural, human, brief.`;

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
          { role: 'user', content: 'Generate the follow-up message now.' },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!openaiRes.ok) {
      throw new Error(`OpenAI API error: ${await openaiRes.text()}`);
    }

    const openaiData = await openaiRes.json();
    const message = openaiData.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      ok: true,
      message,
      metadata: {
        customerName,
        eventType,
        eventDate,
      },
    });
  } catch (error: any) {
    console.error('generate-followup-message error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

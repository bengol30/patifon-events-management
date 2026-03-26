import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Summarize WhatsApp conversation history using AI
 * ONLY used by Imagine Me CRM - not system-wide
 */
export async function POST(request: Request) {
  try {
    const { messages, customerName, projectId } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ ok: false, error: 'Messages array required' }, { status: 400 });
    }

    // Format conversation for AI
    const conversationText = messages
      .map((m: any) => {
        const speaker = m.from === 'customer' ? customerName || 'לקוח' : 'בן (Imagine Me)';
        return `${speaker}: ${m.text}`;
      })
      .join('\n');

    const systemPrompt = `You are analyzing a WhatsApp conversation between Ben (from Imagine Me) and a customer.

Imagine Me is a business that creates AI-generated photos for events.

Analyze the conversation and provide:
1. **Summary** - What was discussed? What happened?
2. **Key Points** - Important decisions, agreements, or concerns
3. **Tone** - Customer's attitude (positive/neutral/negative/mixed)
4. **Important Dates/Numbers** - Any dates, prices, quantities mentioned
5. **Current Status** - Where does the conversation stand? What's pending?

Respond in Hebrew, be concise and factual.`;

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
          {
            role: 'user',
            content: `Analyze this WhatsApp conversation:\n\n${conversationText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!openaiRes.ok) {
      throw new Error(`OpenAI API error: ${await openaiRes.text()}`);
    }

    const openaiData = await openaiRes.json();
    const summary = openaiData.choices?.[0]?.message?.content || '';

    return NextResponse.json({
      ok: true,
      summary,
      messageCount: messages.length,
    });
  } catch (error: any) {
    console.error('summarize-history error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

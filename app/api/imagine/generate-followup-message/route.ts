import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Generate AI-powered follow-up message for Imagine Me CRM
 * ONLY used by Imagine Me project - not system-wide
 */
export async function POST(request: Request) {
  try {
    const { customerName, company, eventType, eventDate, eventLocation, whatsappHistory, projectId } =
      await request.json();

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

    const systemPrompt = `You are a helpful assistant for Imagine Me, a business that creates AI-generated photos for events.

**Services:**
1. **Event Booth** - We come to the event with equipment and create AI photos on-site, printed on magnets or wood blocks
2. **Imagen Wow (Photo on Demand)** - A special link for companies/organizations where employees can take photos and receive personalized AI images

**Your task:**
Generate a warm, friendly follow-up message in Hebrew for a past client. The message should:
- Reference their past event naturally
- Ask if they have any upcoming events
- Present both services briefly
- Be conversational and authentic
- Not be too salesy
- Keep it short (max 150 words)

**Customer info:**
- Name: ${customerName}
- Company: ${company || 'לא צוין'}
- Past event: ${eventType || 'אירוע'} on ${eventDate || 'תאריך לא ידוע'} ${eventLocation ? `at ${eventLocation}` : ''}

${whatsappHistory ? `**Recent conversation context:**\n${whatsappHistory}` : ''}

Write the message in Hebrew, addressed to ${customerName}.`;

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

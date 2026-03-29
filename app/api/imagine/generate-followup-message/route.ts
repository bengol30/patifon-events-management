import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getLydiaLeadById } from '@/lib/lydia';

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
      lydiaId,
      lydiaStatus,
      estimatedValue,
      taskId,
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
    const hasRecentMessages = Array.isArray(recentMessages) && recentMessages.length > 0;
    const hasWhatsappHistory = Boolean(String(whatsappHistory || '').trim());
    const hasConversationHistory = hasRecentMessages || hasWhatsappHistory;

    if (hasRecentMessages) {
      const lastMsg = recentMessages[0]; // Most recent
      lastMessageDate = new Date(lastMsg.timestamp * 1000);
      const now = new Date();
      daysSinceLastMessage = Math.floor((now.getTime() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    let lydiaLead: any = null;
    if (!hasConversationHistory && lydiaId) {
      try {
        lydiaLead = await getLydiaLeadById(String(lydiaId));
      } catch (error) {
        console.error('generate-followup-message Lydia fetch failed:', error);
      }
    }

    const resolvedCompany = company || lydiaLead?.company || null;
    const resolvedEventType = eventType || lydiaLead?.event_type || null;
    const resolvedEventDate = eventDate || lydiaLead?.event_date || null;
    const resolvedEventLocation = eventLocation || lydiaLead?.event_location || null;
    const resolvedLydiaStatus = lydiaStatus || lydiaLead?.status || null;
    const resolvedEstimatedValue = estimatedValue ?? lydiaLead?.estimated_value ?? null;

    let styleLearningEnabled = true;
    let styleInsightsContext = '';
    if (adminDb) {
      try {
        const [settingsSnap, insightsSnap] = await Promise.all([
          adminDb.collection('integrations').doc('whatsapp').get(),
          adminDb.collection('integrations').doc('whatsapp').collection('imagine_me_style_insights').orderBy('createdAt', 'desc').limit(8).get(),
        ]);
        styleLearningEnabled = settingsSnap.data()?.imagineMeStyleLearning?.enabled !== false;
        if (styleLearningEnabled && !insightsSnap.empty) {
          styleInsightsContext = insightsSnap.docs
            .map((doc, index) => {
              const data = doc.data() as any;
              const insights = Array.isArray(data.insights) ? data.insights : [];
              const lines = insights.map((item: any, insightIndex: number) => `  ${insightIndex + 1}. ${item?.recommendation || item?.insight || ''}`.trim()).filter(Boolean).join('\n');
              return `דוגמה ${index + 1} (${data.customerName || 'ליד'}):\n${lines}`;
            })
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (error) {
        console.error('generate-followup-message style insights fetch failed:', error);
      }
    }

    const lydiaContextBlock = !hasConversationHistory ? `
**Lydia lead data (primary source for this message):**
- Customer: ${customerName}${resolvedCompany ? ` from ${resolvedCompany}` : ''}
- Past event: ${resolvedEventType || 'אירוע'}${resolvedEventDate ? ` (${resolvedEventDate})` : ''}${resolvedEventLocation ? ` at ${resolvedEventLocation}` : ''}
- Lead status in Lydia: ${resolvedLydiaStatus || 'unknown'}
${resolvedEstimatedValue ? `- Estimated value: ${resolvedEstimatedValue}` : ''}
` : '';

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
- Customer: ${customerName}${resolvedCompany ? ` from ${resolvedCompany}` : ''}
- Past event: ${resolvedEventType || 'אירוע'} ${resolvedEventDate ? `(${resolvedEventDate})` : ''}${resolvedEventLocation ? ` | ${resolvedEventLocation}` : ''}
${daysSinceLastMessage !== null ? `- Days since last contact: ${daysSinceLastMessage}` : ''}
${lydiaContextBlock}

**Recent messages (last 5):**
${hasRecentMessages ? recentMessages.map((m: any) => {
  const date = new Date(m.timestamp * 1000);
  const sender = m.from === 'customer' ? customerName : 'אני (בן)';
  return `${sender} (${date.toLocaleDateString('he-IL')}): ${m.text.substring(0, 80)}`;
}).join('\n') : 'אין היסטוריית שיחה זמינה'}

**Your message strategy:**
${hasConversationHistory ? (daysSinceLastMessage && daysSinceLastMessage > 7 ? `
- It's been ${daysSinceLastMessage} days - send a GENTLE reminder
- Don't pressure, just check in
- Ask if they have upcoming events
` : `
- Continue the conversation naturally
- Reference the last exchange if relevant
- Offer help or ask about future events
`) : `
- There is NO conversation history available.
- Base the message PRIMARILY on the imported Lydia lead data.
- Open naturally with: "היי ${customerName}".
- If you have event details, reference them naturally, like: "דיברנו בעבר על ה${resolvedEventType || 'אירוע'}" and optionally mention date/location if it flows.
- Then transition to offering a NEW product called "תמונה בהזמנה".
- Describe it as a special gift/product that was born from real experience working with the current event setup.
- Keep it warm, personal and non-salesy.
- Do NOT claim there was a WhatsApp conversation if none exists; only say "דיברנו" based on prior lead/event context.
- Keep it to 3-5 short lines, still WhatsApp-natural.
`}

${whatsappHistory ? `\n**Conversation summary:**\n${whatsappHistory}` : ''}
${styleLearningEnabled && styleInsightsContext ? `\n**Ben style learning insights collected from real sent messages:**\n${styleInsightsContext}\n\nUse these insights as HIGH priority style guidance so the draft sounds like Ben.` : ''}

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

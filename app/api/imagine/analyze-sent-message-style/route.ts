import { NextResponse } from 'next/server';

import { adminDb } from '@/lib/firebase-admin';
import { getLydiaLeadById } from '@/lib/lydia';

export const dynamic = 'force-dynamic';

const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';

type InsightItem = {
  title: string;
  insight: string;
  recommendation: string;
  focus?: string;
};

const clean = (value: unknown) => String(value || '').trim();

export async function POST(request: Request) {
  try {
    const {
      projectId,
      taskId,
      messageSent,
      recentMessages,
      customerName,
      conversationSummary,
    } = await request.json();

    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me CRM project' },
        { status: 403 }
      );
    }

    if (!taskId || !clean(messageSent)) {
      return NextResponse.json({ ok: false, error: 'taskId and messageSent required' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    const settingsRef = adminDb.collection('integrations').doc('whatsapp');
    const settingsSnap = await settingsRef.get();
    const styleLearningEnabled = settingsSnap.data()?.imagineMeStyleLearning?.enabled !== false;
    if (!styleLearningEnabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'style_learning_disabled' });
    }

    const taskRef = adminDb.collection('projects').doc(projectId).collection('tasks').doc(String(taskId));
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) {
      return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
    }

    const task = taskSnap.data() as Record<string, any>;
    const customData = (task.customData || {}) as Record<string, any>;
    const lydiaLead = customData.lydiaId ? await getLydiaLeadById(String(customData.lydiaId)).catch(() => null) : null;

    const leadContext = {
      title: clean(task.title),
      description: clean(task.description),
      company: clean(customData.company || lydiaLead?.company),
      eventType: clean(customData.eventType || lydiaLead?.event_type),
      eventDate: clean(customData.eventDate || lydiaLead?.event_date),
      eventLocation: clean(customData.eventLocation || lydiaLead?.event_location),
      estimatedValue: customData.estimatedValue ?? lydiaLead?.estimated_value ?? null,
      status: clean(customData.lydiaStatus || lydiaLead?.status),
    };

    const lastMessages = Array.isArray(recentMessages)
      ? recentMessages.slice(0, 7)
      : (Array.isArray(customData.recentMessages) ? customData.recentMessages.slice(0, 7) : []);

    const formattedRecent = lastMessages.map((m: any, index: number) => {
      const sender = m.from === 'customer' ? 'לקוח' : 'בן';
      const timestamp = m.timestamp ? new Date(Number(m.timestamp) * 1000).toLocaleString('he-IL') : '';
      return `${index + 1}. ${sender}${timestamp ? ` (${timestamp})` : ''}: ${clean(m.text) || '[ללא טקסט]'}`;
    }).join('\n');

    const leadContextText = [
      `שם ליד: ${clean(customerName || leadContext.title.split(' - ')[0])}`,
      leadContext.company ? `חברה/ארגון: ${leadContext.company}` : '',
      leadContext.description ? `תיאור משימה/ליד: ${leadContext.description}` : '',
      leadContext.eventType ? `סוג אירוע: ${leadContext.eventType}` : '',
      leadContext.eventDate ? `תאריך אירוע: ${leadContext.eventDate}` : '',
      leadContext.eventLocation ? `מיקום: ${leadContext.eventLocation}` : '',
      leadContext.status ? `סטטוס ליד: ${leadContext.status}` : '',
      leadContext.estimatedValue ? `שווי משוער: ${leadContext.estimatedValue}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `אתה מנתח את סגנון המכירה והכתיבה של בן ב-Imagine Me.

המטרה שלך: להפיק בדיוק 3 תובנות פרקטיות שישמרו כמאגר למידת סגנון, כדי שבפעם הבאה שהמערכת תציע לבן הודעה - היא תהיה יותר דומה לאיך שהוא באמת כותב.

חשוב:
- תתייחס גם לאורך ההודעה, גם לטון, גם למבנה, גם לרמת הישירות, גם למה שהוא בחר לא לכתוב, גם למטרת ההודעה וגם לתגובה למה שהיה קודם בשיחה.
- התובנות צריכות להיות ספציפיות לסגנון של בן, לא עצות כלליות על מכירות.
- כל תובנה חייבת להיות בנויה כך שאפשר יהיה להשתמש בה בעתיד בזמן יצירת "הצעת הודעה".
- אם יש מעט מידע, תפיק את הכי מדויק שאפשר מתוך מה שיש ולא תמציא עובדות.

הקשר על הליד:
${leadContextText || 'אין הקשר נוסף'}

סיכום שיחה קיים:
${clean(conversationSummary) || 'אין'}

7 ההודעות האחרונות לפני השליחה:
${formattedRecent || 'אין היסטוריה קודמת זמינה'}

ההודעה שבן שלח עכשיו:
${clean(messageSent)}

החזר JSON בלבד במבנה הזה:
{
  "summary": "סיכום קצר בעברית של מה מאפיין את השליחה הזו",
  "insights": [
    {
      "title": "כותרת קצרה",
      "focus": "למשל: tone / length / structure / sales-angle / timing / trust / objection-handling",
      "insight": "מה למדנו על הסגנון של בן מהשליחה הזו",
      "recommendation": "מה המערכת צריכה לזכור לפעם הבאה כשמציעה הודעה"
    }
  ]
}

בדיוק 3 insights. לא יותר ולא פחות.`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'נתח והחזר JSON בלבד.' },
        ],
        temperature: 0.35,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      throw new Error(`OpenAI API error: ${await openaiRes.text()}`);
    }

    const openaiData = await openaiRes.json();
    const parsed = JSON.parse(openaiData.choices?.[0]?.message?.content || '{}');
    const insights = (Array.isArray(parsed.insights) ? parsed.insights : []).slice(0, 3).map((item: any): InsightItem => ({
      title: clean(item?.title) || 'תובנה',
      focus: clean(item?.focus),
      insight: clean(item?.insight),
      recommendation: clean(item?.recommendation),
    })).filter((item: InsightItem) => item.insight && item.recommendation);

    if (insights.length !== 3) {
      throw new Error('Style analysis did not return exactly 3 insights');
    }

    const entry = {
      taskId: String(taskId),
      projectId: String(projectId),
      customerName: clean(customerName || leadContext.title.split(' - ')[0]),
      createdAt: new Date().toISOString(),
      summary: clean(parsed.summary) || 'נותחו 3 תובנות סגנון מהשליחה האחרונה',
      source: {
        sentMessage: clean(messageSent),
        leadContext: leadContextText,
      },
      insights,
    };

    const insightsRef = adminDb.collection('integrations').doc('whatsapp');
    await insightsRef.set({
      imagineMeStyleLearning: {
        updatedAt: new Date().toISOString(),
        lastTaskId: String(taskId),
      },
    }, { merge: true });

    const created = await insightsRef.collection('imagine_me_style_insights').add(entry);

    return NextResponse.json({
      ok: true,
      entry: { id: created.id, ...entry },
    });
  } catch (error: any) {
    console.error('analyze-sent-message-style error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const { projectId, timeframe, chatId } = await request.json();
        if (!projectId) {
            return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
        }

        if (!adminDb) {
            return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 500 });
        }

        // Get project with WhatsApp group ID
        const projectSnap = await adminDb.collection("projects").doc(projectId).get();
        if (!projectSnap.exists) {
            return NextResponse.json({ error: "פרויקט לא נמצא" }, { status: 404 });
        }

        const project = projectSnap.data();
        const whatsappGroupId = chatId || project?.whatsappGroupId;

        if (!whatsappGroupId) {
            return NextResponse.json({ error: "קבוצת WhatsApp לא מוגדרת לפרויקט זה" }, { status: 400 });
        }

        // Get Green API credentials
        const integrationSnap = await adminDb.collection("integrations").doc("whatsapp").get();
        const integration = integrationSnap.data();
        const idInstance = integration?.idInstance;
        const apiTokenInstance = integration?.apiTokenInstance;

        if (!idInstance || !apiTokenInstance) {
            return NextResponse.json({ error: "Green API לא מוגדר" }, { status: 500 });
        }

        // Calculate time range
        const now = new Date();
        const hoursAgo = timeframe === "1_day" ? 24 : timeframe === "3_days" ? 72 : 168;
        const fromTimestamp = Math.floor((now.getTime() - hoursAgo * 60 * 60 * 1000) / 1000);

        // Fetch chat history from Green API
        const historyUrl = `https://api.green-api.com/waInstance${idInstance}/getChatHistory/${apiTokenInstance}`;
        const historyResponse = await fetch(historyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chatId: whatsappGroupId,
                count: 1000,
            }),
        });

        if (!historyResponse.ok) {
            return NextResponse.json({ error: "שגיאה בשליפת היסטוריה מ-Green API" }, { status: 500 });
        }

        const historyData = await historyResponse.json();
        const messages = Array.isArray(historyData) ? historyData : [];

        // Filter by timeframe
        const recentMessages = messages.filter(msg => {
            const msgTimestamp = msg.timestamp || 0;
            return msgTimestamp >= fromTimestamp;
        });

        if (recentMessages.length === 0) {
            return NextResponse.json({
                success: true,
                summary: {
                    taskIdeas: ["אין הודעות בטווח הזמן שנבחר"],
                    importantPoints: [],
                    importantDates: [],
                },
            });
        }

        // Build conversation text for OpenAI
        const conversationText = recentMessages
            .map(msg => {
                const sender = msg.senderName || msg.sender || "Unknown";
                const text = msg.textMessage || msg.caption || "";
                const time = new Date((msg.timestamp || 0) * 1000).toLocaleString("he-IL");
                return `[${time}] ${sender}: ${text}`;
            })
            .join("\n");

        // Summarize with OpenAI
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return NextResponse.json({ error: "OpenAI API key לא מוגדר" }, { status: 500 });
        }

        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `אתה עוזר שמסכם שיחות בקבוצות WhatsApp של עסקים. תפקידך לחלץ:
1. רעיונות למשימות (taskIdeas) - דברים שצריך לעשות, פעולות שהוזכרו
2. נקודות חשובות (importantPoints) - החלטות, עדכונים חשובים, דברים לזכור
3. תאריכים חשובים (importantDates) - תאריכי פגישות, דדליינים, אירועים

החזר תשובה בפורמט JSON בלבד:
{
  "taskIdeas": ["משימה 1", "משימה 2"],
  "importantPoints": ["נקודה 1", "נקודה 2"],
  "importantDates": ["תאריך 1", "תאריך 2"]
}`,
                    },
                    {
                        role: "user",
                        content: `סכם את השיחה הבאה:\n\n${conversationText}`,
                    },
                ],
                temperature: 0.3,
            }),
        });

        const openaiData = await openaiResponse.json();
        const summaryText = openaiData.choices?.[0]?.message?.content || "{}";

        let summary;
        try {
            summary = JSON.parse(summaryText);
        } catch {
            summary = {
                taskIdeas: ["שגיאה בניתוח התוצאות"],
                importantPoints: [],
                importantDates: [],
            };
        }

        return NextResponse.json({ success: true, summary });
    } catch (error: any) {
        console.error("Error in summarize-crm-chat:", error);
        return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }
}

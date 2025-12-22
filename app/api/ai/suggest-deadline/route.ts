import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
    try {
        const { eventId, taskTitle, taskDescription } = await request.json();

        if (!eventId || !taskTitle) {
            return NextResponse.json({ error: "Event ID and task title are required" }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.warn("OpenAI API key is missing.");
            return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
        }

        if (!adminDb) {
            console.error("Firebase Admin not initialized");
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        // Fetch event data using Admin SDK
        const eventRef = adminDb.collection("events").doc(eventId);
        const eventSnap = await eventRef.get();

        if (!eventSnap.exists) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        const eventData = eventSnap.data();
        if (!eventData) {
            return NextResponse.json({ error: "Event data is empty" }, { status: 404 });
        }

        // Fetch existing tasks for context
        const tasksRef = adminDb.collection("events").doc(eventId).collection("tasks");
        const tasksSnap = await tasksRef.get();
        const existingTasks = tasksSnap.docs.map((doc: any) => {
            const data = doc.data();
            return {
                title: data.title || "",
                dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
                status: data.status || ""
            };
        });

        // Format event date
        const eventDate = eventData.startTime
            ? new Date(eventData.startTime).toISOString()
            : null;

        // Create prompt for GPT
        const prompt = `
אתה עוזר AI מקצועי שעוזר לתכנן אירועים. תפקידך להציע תאריך deadline מתאים למשימה.

**פרטי האירוע:**
- שם האירוע: ${eventData.title || "ללא שם"}
- תאריך האירוע: ${eventDate || "לא מוגדר"}
- תיאור: ${eventData.description || "אין"}
- מיקום: ${eventData.location || "לא מוגדר"}

**המשימה החדשה:**
- כותרת: ${taskTitle}
- תיאור: ${taskDescription || "אין"}

**משימות קיימות באירוע:**
${existingTasks.length > 0 ? existingTasks.map((t, i) => `
${i + 1}. ${t.title} - Deadline: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('he-IL') : "לא מוגדר"}
`).join('\n') : "אין משימות קיימות"}

**הנחיות:**
1. קח בחשבון את תאריך האירוע
2. קח בחשבון את סוג המשימה וכמה זמן צריך לבצע אותה
3. וודא שהמשימה תושלם **לפני** האירוע
4. התחשב במשימות אחרות שכבר קיימות
5. השתמש בהיגיון נכון - למשל:
   - משימות תכנון/עיצוב: 2-3 שבועות לפני
   - הזמנת ציוד/אולם: 3-4 שבועות לפני
   - קידום ושיווק: 1-2 שבועות לפני
   - משימות טכניות: שבוע לפני
   - משימות אחרונות/בדיקות: 2-3 ימים לפני

**פורמט התשובה:**
החזר **רק** תאריך בפורמט ISO 8601 (YYYY-MM-DD), ללא טקסט נוסף.
לדוגמה: 2024-01-15

אם אין תאריך לאירוע, הצע תאריך שבוע מהיום.
`;

        // Call OpenAI API
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "אתה עוזר AI מקצועי לניהול אירועים. אתה מומחה בתכנון זמנים ותאריכי deadline. תמיד החזר רק תאריך בפורמט YYYY-MM-DD ללא טקסט נוסף."
                    },
                    { role: "user", content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 50,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API error:", errorText);
            return NextResponse.json({ error: `OpenAI Error: ${errorText}` }, { status: 500 });
        }

        const data = await response.json();
        const suggestedDateStr = data.choices[0]?.message?.content?.trim() || "";

        // Parse and validate the date
        const dateMatch = suggestedDateStr.match(/(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) {
            // Fallback: suggest 1 week from now
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() + 7);
            return NextResponse.json({
                suggestedDate: fallbackDate.toISOString().split('T')[0],
                reasoning: "תאריך ברירת מחדל (שבוע מהיום)"
            });
        }

        return NextResponse.json({
            suggestedDate: dateMatch[1],
            reasoning: "תאריך מוצע על ידי AI"
        });

    } catch (error) {
        console.error("Error in suggest deadline API:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

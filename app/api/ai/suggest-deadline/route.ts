import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const { eventId, taskTitle, taskDescription, eventDate, eventTitle } = await request.json();

        if (!taskTitle) {
            return NextResponse.json({ error: "Task title is required" }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.warn("OpenAI API key is missing.");
            return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
        }

        // Create prompt for GPT - simplified version without Firebase
        const prompt = `
אתה עוזר AI מקצועי שעוזר לתכנן אירועים. תפקידך להציע תאריך deadline מתאים למשימה.

**פרטי האירוע:**
- שם האירוע: ${eventTitle || "ללא שם"}
- תאריך האירוע: ${eventDate ? new Date(eventDate).toLocaleDateString('he-IL') : "לא מוגדר"}

**המשימה החדשה:**
- כותרת: ${taskTitle}
- תיאור: ${taskDescription || "אין"}

**הנחיות:**
1. קח בחשבון את תאריך האירוע
2. קח בחשבון את סוג המשימה וכמה זמן צריך לבצע אותה
3. וודא שהמשימה תושלם **לפני** האירוע
4. השתמש בהיגיון נכון - למשל:
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
            // Return fallback date instead of error
            const fallbackDate = new Date();
            fallbackDate.setDate(fallbackDate.getDate() + 7);
            return NextResponse.json({
                suggestedDate: fallbackDate.toISOString().split('T')[0],
                reasoning: "תאריך ברירת מחדל (שבוע מהיום)"
            });
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
        // Return fallback instead of error
        const fallbackDate = new Date();
        fallbackDate.setDate(fallbackDate.getDate() + 7);
        return NextResponse.json({
            suggestedDate: fallbackDate.toISOString().split('T')[0],
            reasoning: "תאריך ברירת מחדל"
        });
    }
}

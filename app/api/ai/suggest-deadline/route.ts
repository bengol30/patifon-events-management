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
            // Fallback to -7 days before event
            return NextResponse.json({
                offsetDays: -7,
                reasoning: "ברירת מחדל - שבוע לפני האירוע"
            });
        }

        // Create prompt for GPT asking for relative days
        const prompt = `
אתה עוזר AI מקצועי שעוזר לתכנן אירועים. תפקידך להציע **כמה ימים לפני או אחרי האירוע** משימה צריכה להתבצע.

**פרטי האירוע:**
- שם האירוע: ${eventTitle || "ללא שם"}
- תאריך האירוע: ${eventDate ? new Date(eventDate).toLocaleDateString('he-IL') : "לא מוגדר"}

**המשימה החדשה:**
- כותרת: ${taskTitle}
- תיאור: ${taskDescription || "אין"}

**הנחיות:**
1. חשוב היטב על סוג המשימה
2. החזר **רק מספר** שמייצג כמה ימים לפני/אחרי האירוע
3. מספר שלילי = לפני האירוע (לדוגמה: -7 = שבוע לפני)
4. מספר חיובי = אחרי האירוע (לדוגמה: +3 = 3 ימים אחרי)
5. אפס = ביום האירוע עצמו

**דוגמאות להנחיות זמן:**
- משימות תכנון/עיצוב: -14 עד -21 (2-3 שבועות לפני)
- הזמנת ציוד/אולם: -21 עד -28 (3-4 שבועות לפני)
- קידום ושיווק: -7 עד -14 (1-2 שבועות לפני)
- משימות טכניות/תיאום: -7 (שבוע לפני)
- בדיקות אחרונות: -2 עד -3 (2-3 ימים לפני)
- משימות במהלך האירוע: 0 (ביום האירוע)
- דיווח/סיכום: +1 עד +3 (מספר ימים אחרי)

**פורמט התשובה:**
החזר **רק מספר שלם**, לדוגמה: -7 או 0 או +2
ללא טקסט נוסף!

אם לא בטוח, העדף -7 (שבוע לפני).
`;

        try {
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
                            content: "אתה מומחה בתכנון זמנים לאירועים. החזר רק מספר שלם שמייצג כמה ימים לפני (שלילי) או אחרי (חיובי) האירוע המשימה צריכה להתבצע. אל תוסיף שום טקסט נוסף!"
                        },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 10,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("OpenAI API error:", errorText);
                // Fallback
                return NextResponse.json({
                    offsetDays: -7,
                    reasoning: "ברירת מחדל - שבוע לפני האירוע"
                });
            }

            const data = await response.json();
            const aiResponse = data.choices[0]?.message?.content?.trim() || "";

            // Parse the number from AI response
            const numberMatch = aiResponse.match(/(-?\d+)/);
            if (!numberMatch) {
                // Fallback if no number found
                return NextResponse.json({
                    offsetDays: -7,
                    reasoning: "ברירת מחדל - שבוע לפני האירוע"
                });
            }

            const offsetDays = parseInt(numberMatch[1], 10);

            // Sanity check: limit to reasonable range (-60 to +30 days)
            const safeOffset = Math.max(-60, Math.min(30, offsetDays));

            return NextResponse.json({
                offsetDays: safeOffset,
                reasoning: `${Math.abs(safeOffset)} ימים ${safeOffset < 0 ? 'לפני' : safeOffset > 0 ? 'אחרי' : 'ביום'} האירוע`
            });

        } catch (error) {
            console.error("Error calling OpenAI:", error);
            return NextResponse.json({
                offsetDays: -7,
                reasoning: "ברירת מחדל - שבוע לפני האירוע"
            });
        }

    } catch (error) {
        console.error("Error in suggest deadline API:", error);
        return NextResponse.json({
            offsetDays: -7,
            reasoning: "ברירת מחדל - שבוע לפני האירוע"
        });
    }
}

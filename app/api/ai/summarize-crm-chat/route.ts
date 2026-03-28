import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const { projectId, timeframe } = await request.json();
        if (!projectId) {
            return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
        }

        // Simulate API/Make.com extraction delay
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Simulated response for the frontend to save
        const mockSummary = {
            taskIdeas: [
                `משימה לדוגמה שחולצה מהקבוצה (עבור טווח: ${timeframe})`,
                "לוודא הגעה של הצוות הטכני ברביעי",
                "לשלוח הצעת מחיר מעודכנת ללקוח"
            ],
            importantPoints: [
                "הלקוח הדגיש שהתקציב קשיח ולא ניתן לחריגה",
                "יש אישור עקרוני להתקדם לשלב ב'",
                "זמינות מוגבלת של איש הקשר בשבוע הבא"
            ],
            importantDates: [
                "20.04.2026 - פרזנטציה ראשונה",
                "05.05.2026 - דדליין השקת הקמפיין"
            ]
        };

        return NextResponse.json({ success: true, summary: mockSummary });
    } catch (error: any) {
        console.error("Error in summarize-crm-chat:", error);
        return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
    }
}

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";

export async function POST(request: Request) {
    try {
        const { eventId } = await request.json();
        if (!eventId) {
            return NextResponse.json({ error: "Event ID is required" }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.warn("OpenAI API key is missing.");
            return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
        }

        // Fetch event data
        const eventRef = doc(db!, "events", eventId);
        const eventSnap = await getDoc(eventRef);

        if (!eventSnap.exists()) {
            return NextResponse.json({ error: "Event not found" }, { status: 404 });
        }

        const eventData = eventSnap.data();

        // Fetch tasks
        const tasksRef = collection(db!, "events", eventId, "tasks");
        const tasksSnap = await getDocs(tasksRef);
        const tasks: any[] = tasksSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch volunteers
        const volunteersRef = collection(db!, "volunteers");
        const volunteersQuery = query(volunteersRef, where("eventId", "==", eventId));
        const volunteersSnap = await getDocs(volunteersQuery);
        const volunteers: any[] = volunteersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch partners
        const partners = eventData.partners || [];

        // Build comprehensive data object
        const comprehensiveData = {
            event: {
                title: eventData.title || "ללא כותרת",
                description: eventData.description || "",
                location: eventData.location || "",
                startTime: eventData.startTime ? new Date(eventData.startTime).toLocaleString("he-IL") : "",
                endTime: eventData.endTime ? new Date(eventData.endTime).toLocaleString("he-IL") : "",
                status: eventData.status || "",
                eventType: eventData.eventType || "",
                budget: eventData.budget || 0,
                creator: eventData.creator || "",
                createdAt: eventData.createdAt ? new Date(eventData.createdAt.toMillis()).toLocaleString("he-IL") : "",
            },
            tasks: tasks.map((t: any) => ({
                title: t.title || "",
                description: t.description || "",
                status: t.status || "",
                priority: t.priority || "",
                assignee: t.assignee || "",
                assigneeEmail: t.assigneeEmail || "",
                dueDate: t.dueDate ? new Date(t.dueDate).toLocaleString("he-IL") : "",
                completedAt: t.completedAt ? new Date(t.completedAt.toMillis()).toLocaleString("he-IL") : "",
                notes: t.notes || "",
            })),
            volunteers: volunteers.map((v: any) => ({
                name: v.name || "",
                email: v.email || "",
                phone: v.phone || "",
                role: v.role || "",
                status: v.status || "",
                hours: v.hours || 0,
                notes: v.notes || "",
            })),
            partners: partners.map((p: any) => ({
                name: p.name || "",
                contact: p.contact || "",
                role: p.role || "",
            })),
        };

        // Create detailed prompt for GPT
        const prompt = `
אתה עוזר AI מקצועי שמסכם אירועים. תפקידך ליצור סיכום מקיף ומפורט של האירוע הבא.

חשוב מאוד:
1. אל תפספס אף פרט - כלול את כל המידע שמסופק
2. ארגן את המידע בצורה ברורה ומובנית
3. השתמש בעברית תקנית וברורה
4. הדגש מי עושה מה, שעות עבודה, ומועדים
5. כלול כל משימה עם האחראי, הסטטוס והמועד

הנה המידע המלא על האירוע:

=== פרטי האירוע ===
שם: ${comprehensiveData.event.title}
תיאור: ${comprehensiveData.event.description}
מיקום: ${comprehensiveData.event.location}
תאריך התחלה: ${comprehensiveData.event.startTime}
תאריך סיום: ${comprehensiveData.event.endTime}
סטטוס: ${comprehensiveData.event.status}
סוג אירוע: ${comprehensiveData.event.eventType}
תקציב: ₪${comprehensiveData.event.budget}
יוצר: ${comprehensiveData.event.creator}
נוצר בתאריך: ${comprehensiveData.event.createdAt}

=== משימות (${comprehensiveData.tasks.length}) ===
${comprehensiveData.tasks.map((t: any, i: number) => `
משימה ${i + 1}:
- כותרת: ${t.title}
- תיאור: ${t.description}
- סטטוס: ${t.status}
- עדיפות: ${t.priority}
- אחראי: ${t.assignee}
- אימייל אחראי: ${t.assigneeEmail}
- דדליין: ${t.dueDate}
- הושלם: ${t.completedAt || "טרם הושלם"}
- הערות: ${t.notes}
`).join("\n")}

=== מתנדבים (${comprehensiveData.volunteers.length}) ===
${comprehensiveData.volunteers.map((v: any, i: number) => `
מתנדב ${i + 1}:
- שם: ${v.name}
- אימייל: ${v.email}
- טלפון: ${v.phone}
- תפקיד: ${v.role}
- סטטוס: ${v.status}
- שעות: ${v.hours}
- הערות: ${v.notes}
`).join("\n")}

=== שותפים (${comprehensiveData.partners.length}) ===
${comprehensiveData.partners.map((p: any, i: number) => `
שותף ${i + 1}:
- שם: ${p.name}
- איש קשר: ${p.contact}
- תפקיד: ${p.role}
`).join("\n")}

צור סיכום מקיף ומובנה שמכיל את כל המידע הזה בצורה ברורה ונגישה.
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
                        content: "אתה עוזר AI מקצועי שמסכם אירועים בעברית. תפקידך ליצור סיכומים מקיפים ומפורטים שלא מפספסים אף פרט."
                    },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3, // Lower temperature for more factual output
                max_tokens: 4000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenAI API error:", errorText);
            return NextResponse.json({ error: `OpenAI Error: ${errorText}` }, { status: 500 });
        }

        const data = await response.json();
        const summary = data.choices[0]?.message?.content?.trim() || "";

        return NextResponse.json({
            summary,
            eventTitle: comprehensiveData.event.title,
            eventId
        });

    } catch (error) {
        console.error("Error in event summary API:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

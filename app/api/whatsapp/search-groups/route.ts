import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
    try {
        const { query } = await req.json();
        
        if (!query || query.length < 2) {
            return NextResponse.json({ ok: false, error: "Search query too short" }, { status: 400 });
        }

        if (!adminDb) {
            return NextResponse.json({ ok: false, error: "Firebase Admin לא מוגדר" }, { status: 500 });
        }

        // Get Green API credentials
        const integrationSnap = await adminDb.collection("integrations").doc("whatsapp").get();
        const integration = integrationSnap.data();
        const idInstance = integration?.idInstance;
        const apiTokenInstance = integration?.apiTokenInstance;

        if (!idInstance || !apiTokenInstance) {
            return NextResponse.json({ ok: false, error: "Green API לא מוגדר" }, { status: 500 });
        }

        // Fetch all contacts from Green API
        const url = `https://api.green-api.com/waInstance${idInstance}/getContacts/${apiTokenInstance}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return NextResponse.json({ ok: false, error: "שגיאה בשליפה מ-Green API" }, { status: 500 });
        }

        const contacts = await response.json();
        
        // Filter for groups only
        const groups = Array.isArray(contacts) 
            ? contacts.filter(contact => contact.id?.endsWith('@g.us'))
            : [];

        // Search by query (case-insensitive)
        const searchLower = query.toLowerCase();
        const matchingGroups = groups.filter(group => {
            const name = (group.name || "").toLowerCase();
            return name.includes(searchLower);
        });

        // Format results
        const results = matchingGroups.slice(0, 20).map(group => ({
            chatId: group.id,
            name: group.name || "ללא שם",
            id: group.id,
        }));

        return NextResponse.json({ ok: true, groups: results });
    } catch (error: any) {
        console.error("Error searching groups:", error);
        return NextResponse.json({ ok: false, error: "שגיאה בחיפוש קבוצות" }, { status: 500 });
    }
}

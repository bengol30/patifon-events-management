import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * List leads from Lydia that are NOT yet imported to PATIFON
 * ONLY for Imagine Me project
 */
export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me project' },
        { status: 403 }
      );
    }

    // Fetch all leads from Lydia
    const supabaseUrl = process.env.SUPABASE_LYDIA_URL;
    const supabaseKey = process.env.SUPABASE_LYDIA_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ ok: false, error: 'Lydia credentials not configured' }, { status: 500 });
    }

    const supabaseRes = await fetch(`${supabaseUrl}/rest/v1/leads?order=created_at.desc&limit=50`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!supabaseRes.ok) {
      return NextResponse.json(
        { ok: false, error: 'Failed to fetch leads from Lydia' },
        { status: supabaseRes.status }
      );
    }

    const allLeads = await supabaseRes.json();

    // Get already imported lydia IDs from PATIFON
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    const tasksSnap = await adminDb.collection('projects').doc(projectId).collection('tasks').get();

    const importedLydiaIds = new Set(
      tasksSnap.docs
        .map((doc) => doc.data().customData?.lydiaId)
        .filter(Boolean)
    );

    // Filter out already imported leads
    const availableLeads = allLeads
      .filter((lead: any) => !importedLydiaIds.has(lead.id))
      .map((lead: any) => ({
        id: lead.id,
        customerName: lead.name || 'לא צוין',
        company: lead.company || null,
        phone: lead.phone || null,
        eventType: lead.event_type || null,
        eventDate: lead.event_date || null,
        eventLocation: lead.event_location || null,
        estimatedValue: lead.estimated_value || null,
        status: lead.status || null,
        createdAt: lead.created_at,
      }));

    return NextResponse.json({
      ok: true,
      leads: availableLeads,
      total: availableLeads.length,
      imported: importedLydiaIds.size,
    });
  } catch (error: any) {
    console.error('list-lydia-leads error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

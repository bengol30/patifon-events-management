import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getLydiaLeadById } from '@/lib/lydia';

export const dynamic = 'force-dynamic';

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return `₪${Number(value).toLocaleString('he-IL')}`;
}

function yesNo(value: boolean | null | undefined) {
  if (value === null || value === undefined) return 'לא צוין';
  return value ? 'כן' : 'לא';
}

function textOrDefault(value: unknown, fallback = 'לא צוין') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
}

function inferLeadBusinessType(lead: Record<string, any>) {
  const reasons: string[] = [];
  const company = String(lead.company || '').trim();
  const eventType = String(lead.event_type || '').trim();
  const source = String(lead.source || '').trim();
  const notes = String(lead.notes || '').trim();
  const location = String(lead.event_location || '').trim();
  const category = String(lead.lead_category || '').trim();
  const guestCount = Number(lead.guest_count || 0);

  const businessSignals = [
    company,
    eventType,
    source,
    notes,
    location,
    category,
  ].join(' | ');

  const businessKeywords = [
    'חברה', 'ארגון', 'עמותה', 'כנס', 'עירייה', 'מועצה', 'מתנס', 'מתנ"ס', 'משרד', 'צוות',
    'עובדים', 'אירוע חברה', 'corporate', 'conference', 'summit', 'office', 'employee',
    'school', 'municipality', 'business', 'brand', 'launch'
  ];

  if (company) reasons.push('יש שם חברה/ארגון');
  if (guestCount >= 80) reasons.push('כמות מוזמנים גבוהה יחסית');
  if (lead.number_of_stations && Number(lead.number_of_stations) >= 2) reasons.push('יש יותר מעמדה אחת');
  if (businessKeywords.some((keyword) => businessSignals.toLowerCase().includes(keyword.toLowerCase()))) {
    reasons.push('נמצאו מונחים שמאפיינים לקוח עסקי/ארגוני');
  }

  if (reasons.length > 0) {
    return {
      type: 'business',
      label: 'לקוח עסקי / ארגוני',
      confidence: reasons.length >= 3 ? 'גבוהה' : 'בינונית',
      reasons,
    };
  }

  const privateSignals = [
    'בת מצווה', 'בר מצווה', 'חתונה', 'יום הולדת', 'חינה', 'ברית', 'אירוע פרטי', 'private', 'family'
  ];

  const privateReasons: string[] = [];
  if (privateSignals.some((keyword) => businessSignals.toLowerCase().includes(keyword.toLowerCase()))) {
    privateReasons.push('נמצאו מונחים שמאפיינים אירוע פרטי');
  }
  if (!company && guestCount > 0 && guestCount < 80) {
    privateReasons.push('אין חברה משויכת וכמות המוזמנים מתאימה יותר ללקוח פרטי');
  }

  if (privateReasons.length > 0) {
    return {
      type: 'private',
      label: 'לקוח פרטי',
      confidence: privateReasons.length >= 2 ? 'בינונית' : 'נמוכה',
      reasons: privateReasons,
    };
  }

  return {
    type: 'unknown',
    label: 'לא הוכרע בוודאות',
    confidence: 'נמוכה',
    reasons: ['אין מספיק סימנים חד-משמעיים כדי לקבוע אם הליד עסקי/ארגוני או פרטי'],
  };
}

function buildLeadDescription(lead: Record<string, any>) {
  const inferredType = inferLeadBusinessType(lead);
  const lines = [
    'ליד מיובא מ-Lydia',
    '',
    'אבחנה אוטומטית',
    `- סוג ליד משוער: ${inferredType.label}`,
    `- רמת ביטחון: ${inferredType.confidence}`,
    `- נימוקים: ${inferredType.reasons.join(' | ')}`,
    '',
    'פרטי ליד',
    `- שם: ${textOrDefault(lead.name)}`,
    `- חברה / ארגון: ${textOrDefault(lead.company)}`,
    `- טלפון: ${textOrDefault(lead.phone)}`,
    `- אימייל: ${textOrDefault(lead.email)}`,
    `- ח.פ / ע.מ: ${textOrDefault(lead.tax_id)}`,
    `- סטטוס ב-Lydia: ${textOrDefault(lead.status)}`,
    `- מקור ליד: ${textOrDefault(lead.source)}`,
    `- טופל ב-Lydia: ${yesNo(lead.is_handled)}`,
    '',
    'פרטי אירוע / הזמנה',
    `- סוג אירוע: ${textOrDefault(lead.event_type)}`,
    `- תאריך אירוע: ${textOrDefault(formatDate(lead.event_date))}`,
    `- מיקום: ${textOrDefault(lead.event_location)}`,
    `- שעת התחלה: ${textOrDefault(lead.event_start_time)}`,
    `- שעת סיום: ${textOrDefault(lead.event_end_time)}`,
    `- שעת הגעה: ${textOrDefault(lead.event_arrival_time)}`,
    `- כמות מוזמנים: ${textOrDefault(lead.guest_count)}`,
    '',
    'שירותים ומוצר',
    `- קטגוריית ליד: ${textOrDefault(lead.lead_category)}`,
    `- מספר עמדות: ${textOrDefault(lead.number_of_stations)}`,
    `- מגנטים: ${yesNo(lead.has_magnets)}`,
    `- כמות מגנטים: ${textOrDefault(lead.magnet_quantity)}`,
    `- גודל מגנט: ${textOrDefault(lead.magnet_size)}`,
    `- Wood Blocks: ${yesNo(lead.has_wood_blocks)}`,
    `- כמות Wood Blocks: ${textOrDefault(lead.wood_block_quantity)}`,
    `- מעטפות: ${yesNo(lead.has_envelopes)}`,
    `- כמות מעטפות: ${textOrDefault(lead.envelope_quantity)}`,
    `- תוכנה בלבד: ${yesNo(lead.is_software_only)}`,
    `- Imagen Wow: ${yesNo(lead.is_imagen_wow)}`,
    `- דיגיטלי: ${yesNo(lead.is_digital)}`,
    `- תמונות מותאמות: ${yesNo(lead.has_custom_images)}`,
    `- כמות תמונות מותאמות: ${textOrDefault(lead.custom_images_count)}`,
    `- רעיונות לתמונות: ${textOrDefault(lead.custom_images_ideas)}`,
    '',
    'כספים',
    `- שווי משוער: ${textOrDefault(formatCurrency(lead.estimated_value))}`,
    `- המחיר כולל מע"מ: ${yesNo(lead.price_includes_vat)}`,
    `- רווח נקי: ${textOrDefault(formatCurrency(lead.calc_net_profit))}`,
    `- חלק שחר: ${textOrDefault(formatCurrency(lead.calc_shahar_share))}`,
    `- חלק בן: ${textOrDefault(formatCurrency(lead.calc_ben_share))}`,
    `- תשלום באשראי: ${yesNo(lead.calc_is_credit_card)}`,
    '',
    'קישורים ומעקב',
    `- קישור להצעת מחיר: ${textOrDefault(lead.quote_file_url)}`,
    `- מזהה אירוע מקושר: ${textOrDefault(lead.linked_event_id)}`,
    `- כתובת משלוח: ${textOrDefault(lead.shipping_address)}`,
    '',
    'הערות',
    textOrDefault(lead.notes),
    '',
    'מטא-דאטה',
    `- Lydia ID: ${textOrDefault(lead.id)}`,
    `- Organization ID: ${textOrDefault(lead.organization_id)}`,
    `- נוצר ב-Lydia: ${textOrDefault(lead.created_at)}`,
    `- עודכן ב-Lydia: ${textOrDefault(lead.updated_at)}`,
    `- Archived at: ${textOrDefault(lead.archived_at)}`,
  ];

  return lines.join('\n');
}

/**
 * Import a new lead from Lydia into PATIFON as a task
 * ONLY for Imagine Me project
 */
export async function POST(request: Request) {
  try {
    const { projectId, lydiaId } = await request.json();

    // Safety: only allow for Imagine Me project
    const IMAGINE_ME_PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
    if (projectId !== IMAGINE_ME_PROJECT_ID) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint is only available for Imagine Me project' },
        { status: 403 }
      );
    }

    if (!lydiaId) {
      return NextResponse.json({ ok: false, error: 'lydiaId required' }, { status: 400 });
    }

    const lead = await getLydiaLeadById(lydiaId);

    if (!lead) {
      return NextResponse.json({ ok: false, error: 'Lead not found in Lydia' }, { status: 404 });
    }

    // Check if already imported
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Database not initialized' }, { status: 500 });
    }

    const existingTasksSnap = await adminDb
      .collection('projects')
      .doc(projectId)
      .collection('tasks')
      .where('customData.lydiaId', '==', lydiaId)
      .get();

    if (!existingTasksSnap.empty) {
      return NextResponse.json(
        { ok: false, error: 'Lead already imported', existingTaskId: existingTasksSnap.docs[0].id },
        { status: 409 }
      );
    }

    // Create task in PATIFON
    const taskTitle = `${lead.name || 'לקוח'}${lead.company ? ` - ${lead.company}` : ''}`;
    const inferredLeadType = inferLeadBusinessType(lead);
    const description = buildLeadDescription(lead);

    const newTask = {
      title: taskTitle,
      description,
      status: 'TODO',
      priority: 'HIGH',
      currentStatus: 'ליד יובא מ-Lydia - ממתין לבדיקה ויצירת קשר',
      nextStep: 'לעבור על כל פרטי הליד שיובאו, לבדוק היסטוריית שיחות ולהכין המשך טיפול',
      scope: 'project',
      createdAt: new Date().toISOString(),
      customData: {
        lydiaId: lead.id,
        leadType: inferredLeadType.type,
        leadTypeLabel: inferredLeadType.label,
        leadTypeConfidence: inferredLeadType.confidence,
        leadTypeReasons: inferredLeadType.reasons,
        phone: lead.phone || null,
        email: lead.email || null,
        company: lead.company || null,
        taxId: lead.tax_id || null,
        source: lead.source || null,
        notes: lead.notes || null,
        eventDate: lead.event_date || null,
        eventType: lead.event_type || null,
        eventLocation: lead.event_location || null,
        eventStartTime: lead.event_start_time || null,
        eventEndTime: lead.event_end_time || null,
        eventArrivalTime: lead.event_arrival_time || null,
        guestCount: lead.guest_count || null,
        estimatedValue: lead.estimated_value || null,
        lydiaStatus: lead.status || null,
        isHandled: lead.is_handled ?? null,
        leadCategory: lead.lead_category || null,
        numberOfStations: lead.number_of_stations || null,
        hasMagnets: lead.has_magnets ?? null,
        magnetQuantity: lead.magnet_quantity || null,
        magnetSize: lead.magnet_size || null,
        hasWoodBlocks: lead.has_wood_blocks ?? null,
        woodBlockQuantity: lead.wood_block_quantity || null,
        hasEnvelopes: lead.has_envelopes ?? null,
        envelopeQuantity: lead.envelope_quantity || null,
        isSoftwareOnly: lead.is_software_only ?? null,
        isImagenWow: lead.is_imagen_wow ?? null,
        isDigital: lead.is_digital ?? null,
        hasCustomImages: lead.has_custom_images ?? null,
        customImagesCount: lead.custom_images_count || null,
        customImagesIdeas: lead.custom_images_ideas || null,
        priceIncludesVat: lead.price_includes_vat ?? null,
        quoteFileUrl: lead.quote_file_url || null,
        calcNetProfit: lead.calc_net_profit || null,
        calcShaharShare: lead.calc_shahar_share || null,
        calcBenShare: lead.calc_ben_share || null,
        calcIsCreditCard: lead.calc_is_credit_card ?? null,
        linkedEventId: lead.linked_event_id || null,
        organizationId: lead.organization_id || null,
        archivedAt: lead.archived_at || null,
        shippingAddress: lead.shipping_address || null,
        followUpStatus: 'new',
        lastContactDate: null,
        lastMessageSent: null,
        whatsappHistoryFetched: false,
        aiSuggestionGenerated: false,
        importedAt: new Date().toISOString(),
      },
    };

    const taskRef = await adminDb.collection('projects').doc(projectId).collection('tasks').add(newTask);

    return NextResponse.json({
      ok: true,
      taskId: taskRef.id,
      lead: {
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        eventType: lead.event_type,
        eventDate: lead.event_date,
      },
    });
  } catch (error: any) {
    console.error('import-lead error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}

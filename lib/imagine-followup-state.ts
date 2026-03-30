type RecentMessage = {
  from: 'customer' | 'us' | string;
  type?: string;
  text?: string;
  timestamp?: number;
};

export function buildConversationSummaryFromRecentMessages(params: {
  customerName?: string;
  existingSummary?: string;
  recentMessages?: RecentMessage[];
  messageSent?: string;
}) {
  const { customerName, existingSummary, recentMessages, messageSent } = params;
  const contactName = customerName?.trim() || 'הלקוחה';
  const messages = Array.isArray(recentMessages) ? recentMessages : [];
  const latestCustomerMessage = messages.find((m) => m?.from === 'customer' && String(m.text || '').trim());
  const latestBenMessage = messages.find((m) => m?.from !== 'customer' && String(m.text || '').trim());
  const openItems = new Set<string>();
  const haystack = [existingSummary || '', ...messages.slice(0, 8).map((m) => String(m?.text || ''))].join(' \n ').toLowerCase();

  if (/לוגו/.test(haystack)) openItems.add('נושא הלוגו עדיין רלוונטי בשיחה');
  if (/טקסט חופשי|חופשי/.test(haystack)) openItems.add('יש גם בקשה פתוחה לטקסט חופשי');

  const latestCustomerText = String(latestCustomerMessage?.text || '').trim();
  const latestBenText = String(latestBenMessage?.text || messageSent || '').trim();
  const customerAcknowledged = /תודה|אוקי|אוקיי|מעולה|סבבה|🙏/.test(latestCustomerText);
  const benSaidWillCheck = /אבדוק|בודק|אחזור|אעדכן|תני לי לבדוק|אני יכול לבדוק/.test(latestBenText);

  const currentStatus = messageSent
    ? 'נשלחה הודעת follow-up חדשה וממתינים לתגובה'
    : benSaidWillCheck && customerAcknowledged
      ? `הלקוחה ממתינה לעדכון נוסף מבן`
      : `השיחה עם ${contactName} פעילה ומעודכנת לפי ההודעות האחרונות`;

  const nextStep = benSaidWillCheck && customerAcknowledged
    ? 'לחזור ללקוחה עם תשובה סופית על הנושא הפתוח'
    : messageSent
      ? 'להמתין לתגובת הלקוחה ולעקוב אם נדרש המשך'
      : 'לעקוב אחרי ההודעה האחרונה ולהמשיך בהתאם';

  const followUpStatus = messageSent || benSaidWillCheck
    ? 'awaiting_response'
    : 'contacted';

  const summary = [
    `סיכום כללי: ${messageSent ? `בן שלח עכשיו הודעת follow-up חדשה ל-${contactName}.` : `השיחה עם ${contactName} עודכנה לפי ההודעות האחרונות.`}`,
    `נקודות חשובות:\n${openItems.size ? Array.from(openItems).map((item) => `- ${item}`).join('\n') : '- אין נקודות פתוחות חדשות שזוהו'}`,
    `טון הלקוחה: ${latestCustomerText ? 'שיח פעיל וענייני' : 'לא זוהה מספיק מידע חדש'}`,
    `תאריכים/מספרים חשובים: אין`,
    `סטטוס נוכחי: ${currentStatus}`,
    `הודעות אחרונות שמשנות את התמונה:\n${[
      messageSent ? `- בן שלח הודעת follow-up חדשה: ${messageSent}` : '',
      latestCustomerText ? `- הודעת הלקוחה האחרונה: ${latestCustomerText}` : '',
    ].filter(Boolean).join('\n') || '- אין'}`,
    `אצל מי הכדור עכשיו: ${messageSent || (benSaidWillCheck && customerAcknowledged) ? 'בן' : 'הלקוחה'}`,
  ].join('\n\n');

  return {
    summary,
    currentStatus,
    nextStep,
    followUpStatus,
    priority: 'NORMAL' as const,
  };
}

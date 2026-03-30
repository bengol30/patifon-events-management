export type ImagineHistoryMessage = {
  from: 'customer' | 'us' | string;
  text?: string;
  timestamp?: number;
};

export type ConversationSummaryAnalysis = {
  generalSummary: string;
  keyPoints: string[];
  customerTone: string;
  importantDatesOrNumbers: string[];
  currentStatus: string;
  latestUpdates: string[];
  ballOwnerNow: 'Ben' | 'Customer';
};

const NOT_RELEVANT_REGEX = /(לא\s+רלוונטי|לא\s+מתאים|לא\s+מעוניי[נן]|ירדנו\s+מזה|נעבור\s+הפעם|לא\s+כרגע)/i;
const CUSTOMER_WILL_CHECK_REGEX = /(בודקת|אבדוק|אבדוק ו|בודק(?:ת)? ומעדכנ(?:ת|ים)?|אעדכן|נבדוק)/i;
const BEN_FOLLOWUP_REGEX = /(איך הולך|רציתי לבדוק|אם יש עוד שאלות|אני כאן|מה קורה עם|רק בודק)/i;

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractImportantDatesOrNumbers(messages: ImagineHistoryMessage[]) {
  const hits = new Set<string>();

  for (const message of messages.slice(0, 10)) {
    const text = normalizeText(message.text);
    if (!text) continue;

    const numberMatches = text.match(/\b\d{1,4}\b/g) || [];
    for (const match of numberMatches) {
      if (match.length <= 4) hits.add(match);
    }

    const dateMatches = text.match(/\b\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\b/g) || [];
    for (const match of dateMatches) hits.add(match);
  }

  return Array.from(hits).slice(0, 4);
}

function detectTone(messages: ImagineHistoryMessage[]) {
  const customerTexts = messages
    .filter((m) => m.from === 'customer')
    .slice(0, 5)
    .map((m) => normalizeText(m.text))
    .filter(Boolean);

  if (!customerTexts.length) return 'לא זוהה';

  const joined = customerTexts.join(' \n ');
  if (NOT_RELEVANT_REGEX.test(joined)) return 'מנומס אך לא מעוניינת כרגע';
  if (/[?]/.test(joined) || /כמה|אפשר|אשמח|תזכיר/.test(joined)) return 'ענייני ומתעניין';
  return 'נייטרלי';
}

export function analyzeConversationSummary(messages: ImagineHistoryMessage[], customerName?: string): ConversationSummaryAnalysis {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  const newestMessages = normalizedMessages.slice(0, 10);
  const latestCustomerMessage = newestMessages.find((m) => m.from === 'customer' && normalizeText(m.text));
  const latestBenMessage = newestMessages.find((m) => m.from !== 'customer' && normalizeText(m.text));
  const latestCustomerText = normalizeText(latestCustomerMessage?.text);
  const latestBenText = normalizeText(latestBenMessage?.text);
  const contactName = customerName?.trim() || 'הלקוחה';

  const keyPoints = new Set<string>();
  const latestUpdates: string[] = [];

  const customerSaidNotRelevant = newestMessages.some((m) => m.from === 'customer' && NOT_RELEVANT_REGEX.test(normalizeText(m.text)));
  const customerAskedPrice = newestMessages.some((m) => m.from === 'customer' && /(כמה זה|מחיר|50 תמונות|50\s*תמונות|משלוח)/.test(normalizeText(m.text)));
  const customerSaidWillCheck = newestMessages.some((m) => m.from === 'customer' && CUSTOMER_WILL_CHECK_REGEX.test(normalizeText(m.text)));
  const benDidFollowUp = newestMessages.some((m) => m.from !== 'customer' && BEN_FOLLOWUP_REGEX.test(normalizeText(m.text)));

  if (customerAskedPrice) {
    keyPoints.add(`${contactName} ביקשה מחיר ל-50 תמונות כולל משלוח`);
  }
  if (customerSaidWillCheck) {
    keyPoints.add(`${contactName} אמרה שהיא בודקת ומעדכנת`);
  }
  if (customerSaidNotRelevant) {
    keyPoints.add(`${contactName} עדכנה שהפעם זה לא רלוונטי`);
  }
  if (benDidFollowUp) {
    keyPoints.add('בן שלח הודעת follow-up לבדוק אם יש התקדמות');
  }

  if (customerSaidNotRelevant && latestCustomerText) {
    latestUpdates.push(`${contactName}: ${latestCustomerText}`);
  }
  if (latestBenText) {
    latestUpdates.push(`בן: ${latestBenText}`);
  }
  const earlierCustomerQuestion = newestMessages.find((m) => m.from === 'customer' && /(כמה זה|50 תמונות|משלוח)/.test(normalizeText(m.text)));
  if (earlierCustomerQuestion) {
    latestUpdates.push(`${contactName}: ${normalizeText(earlierCustomerQuestion.text)}`);
  }

  if (customerSaidNotRelevant) {
    return {
      generalSummary: `${contactName} עדכנה שהפעם זה לא רלוונטי, אחרי שבדקה אפשרות להזמנה.`,
      keyPoints: Array.from(keyPoints).slice(0, 4),
      customerTone: detectTone(newestMessages),
      importantDatesOrNumbers: extractImportantDatesOrNumbers(newestMessages),
      currentStatus: `${contactName} לא מעוניינת כרגע`,
      latestUpdates: latestUpdates.slice(0, 3),
      ballOwnerNow: 'Customer',
    };
  }

  if (customerSaidWillCheck) {
    return {
      generalSummary: `${contactName} בודקת את הפרטים לקראת החלטה וממתינה להמשך.`,
      keyPoints: Array.from(keyPoints).slice(0, 4),
      customerTone: detectTone(newestMessages),
      importantDatesOrNumbers: extractImportantDatesOrNumbers(newestMessages),
      currentStatus: `${contactName} בודקת את הפרטים ומעדכנת`,
      latestUpdates: latestUpdates.slice(0, 3),
      ballOwnerNow: benDidFollowUp ? 'Customer' : 'Customer',
    };
  }

  return {
    generalSummary: `השיחה עם ${contactName} פעילה ומתבססת על ההודעות האחרונות.`,
    keyPoints: Array.from(keyPoints).slice(0, 4),
    customerTone: detectTone(newestMessages),
    importantDatesOrNumbers: extractImportantDatesOrNumbers(newestMessages),
    currentStatus: 'השיחה פעילה',
    latestUpdates: latestUpdates.slice(0, 3),
    ballOwnerNow: latestCustomerText ? 'Ben' : 'Customer',
  };
}

export function formatConversationSummary(analysis: ConversationSummaryAnalysis) {
  const keyPoints = Array.isArray(analysis.keyPoints) ? analysis.keyPoints.filter(Boolean) : [];
  const importantDatesOrNumbers = Array.isArray(analysis.importantDatesOrNumbers) ? analysis.importantDatesOrNumbers.filter(Boolean) : [];
  const latestUpdates = Array.isArray(analysis.latestUpdates) ? analysis.latestUpdates.filter(Boolean) : [];
  const ballOwnerNow = analysis.ballOwnerNow === 'Customer' ? 'הלקוחה' : 'בן';

  return [
    `סיכום כללי: ${analysis.generalSummary || 'לא זוהה סיכום ברור'}`,
    `נקודות חשובות:\n${keyPoints.length ? keyPoints.map((item) => `- ${item}`).join('\n') : '- אין'}`,
    `טון הלקוחה: ${analysis.customerTone || 'לא זוהה'}`,
    `תאריכים/מספרים חשובים: ${importantDatesOrNumbers.length ? importantDatesOrNumbers.join(' | ') : 'אין'}`,
    `סטטוס נוכחי: ${analysis.currentStatus || 'לא זוהה'}`,
    `הודעות אחרונות שמשנות את התמונה:\n${latestUpdates.length ? latestUpdates.map((item) => `- ${item}`).join('\n') : '- אין'}`,
    `אצל מי הכדור עכשיו: ${ballOwnerNow}`,
  ].join('\n\n');
}

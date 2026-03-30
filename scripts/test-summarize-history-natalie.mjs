const newestFirstMessages = [
  { from: 'customer', text: 'אה אוקי תודה 🙏🏻' },
  { from: 'us', text: 'בהצעה זה כתוב בלי הלוגו. אבל בסדר תני לי לבדוק אם אני יכול להעביר את זה ככה ..' },
  { from: 'customer', text: 'בוקר טוב - זה רשום בהצעת מחיר ששלחת לי?' },
  { from: 'us', text: 'זה אני יכול להוסיף לך אבל זה בתוספת' },
  { from: 'customer', text: 'ועוד שאלה - איפה בלינק בעצם מוסיפים את הלוגו של החברה?' },
  { from: 'customer', text: 'יש אפשרות כזאת?' },
  { from: 'customer', text: 'נראה לי שמאכל אהוב זה קצת פשוט מידיי 🙈' },
  { from: 'customer', text: 'הייתי שמחה לטקסט חופשי!' },
  { from: 'us', text: 'נשלחה הצעת מחיר מסודרת ואנחנו דואגים לכל התהליך כולל עיצוב ומשלוח.' },
  { from: 'customer', text: 'אשמח להצעת מחיר ל-10 תמונות.' },
];

function buildPrompt(customerName = 'נטלי גמליאל') {
  const newestMessages = newestFirstMessages.slice(0, 10);
  const olderMessages = newestFirstMessages.slice(10, 40);

  const renderMessage = (m) => {
    const speaker = m.from === 'customer' ? customerName || 'לקוח' : 'בן (Imagine Me)';
    const rawText = String(m.text || '').trim();
    const text = rawText.length > 280 ? `${rawText.slice(0, 280)}...` : rawText;
    return `- ${speaker}: ${text || '[ללא טקסט]'}`;
  };

  return `You are analyzing a WhatsApp conversation between Ben (from Imagine Me) and a customer.

Imagine Me is a business that creates AI-generated photos for events.

CRITICAL RULES:
- The messages are ordered NEWEST FIRST.
- The latest 5-10 messages are the main source of truth.
- Older messages are background only.
- If older context conflicts with the latest messages, the latest messages win.
- You must identify the exact CURRENT state of the conversation now.
- You must identify who currently holds the ball.
- If the customer asked a question/request and Ben still owes an answer/check/confirmation, then the ball is with Ben.
- Do not write a generic sales summary if there is a specific unresolved item in the newest messages.
- Mention the exact unresolved item from the newest messages.
- ALL field values must be written in Hebrew only.
- Do not use English sentences or English descriptions in any value.
- Only the enum in ballOwnerNow may be Ben or Customer.

Newest messages (highest priority):
${newestMessages.map(renderMessage).join('\n')}

Older messages (background only):
${olderMessages.length > 0 ? olderMessages.map(renderMessage).join('\n') : 'אין הודעות ישנות נוספות'}

Return ONLY valid JSON with this exact schema:
{
  "generalSummary": "string",
  "keyPoints": ["string", "string"],
  "customerTone": "string",
  "importantDatesOrNumbers": ["string"],
  "currentStatus": "string",
  "latestUpdates": ["string", "string"],
  "ballOwnerNow": "Ben|Customer"
}`;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY');
    process.exit(1);
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildPrompt() },
        { role: 'user', content: 'Analyze the conversation and return JSON only.' },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });

  const text = await res.text();
  console.log(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

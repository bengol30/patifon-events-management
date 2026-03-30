import fs from 'fs';
import admin from 'firebase-admin';

const BASE = 'http://localhost:3000';
const PROJECT_ID = 'yed4WRBzsXrdGzousyq0';
const TASK_ID = '3W1Qom3SNIhFL0N0hS1Y';
const serviceAccount = JSON.parse(fs.readFileSync('/home/ben/.openclaw/secrets/entries/firebase-admin-patifon.json', 'utf8'));
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const clean = (v) => String(v || '').trim();

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const taskSnap = await db.collection('projects').doc(PROJECT_ID).collection('tasks').doc(TASK_ID).get();
  if (!taskSnap.exists) throw new Error('Task not found');
  const task = taskSnap.data() || {};
  const cd = task.customData || {};

  const previousSettings = (await db.collection('integrations').doc('whatsapp').get()).data() || {};
  const insightsCol = db.collection('integrations').doc('whatsapp').collection('imagine_me_style_insights');
  const tempInsightRef = insightsCol.doc();

  const payloadBase = {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    customerName: clean(task.title).split(' - ')[0],
    company: cd.company,
    eventType: cd.eventType,
    eventDate: cd.eventDate,
    eventLocation: cd.eventLocation,
    lydiaId: cd.lydiaId,
    lydiaStatus: cd.lydiaStatus,
    estimatedValue: cd.estimatedValue,
    whatsappHistory: clean(cd.conversationSummary),
    recentMessages: Array.isArray(cd.recentMessages) ? cd.recentMessages : [],
  };

  // seed one strong style insight to make delta visible
  await tempInsightRef.set({
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    customerName: payloadBase.customerName,
    createdAt: new Date().toISOString(),
    summary: 'טסט E2E זמני',
    source: { sentMessage: 'היי, קופץ לעדכן :)', leadContext: 'test' },
    insights: [
      { title: 'קצר וקליל', focus: 'length', insight: 'בן כותב קצר, זורם ולא חופר.', recommendation: 'לשמור על 2-3 משפטים קצרים, בלי פסקאות ארוכות.' },
      { title: 'פתיחה אישית', focus: 'tone', insight: 'בן פותח בגובה העיניים ובנימה נעימה.', recommendation: 'לפתוח כאילו זו הודעת ווטסאפ אמיתית, לא נוסח מכירתי רשמי.' },
      { title: 'דחיפה עדינה', focus: 'sales-angle', insight: 'בן לא לוחץ, אלא מזמין לשיחה/בדיקה.', recommendation: 'להציע את הצעד הבא ברכות ולא באגרסיביות.' },
    ],
  });

  // enabled => should include insights context
  await db.collection('integrations').doc('whatsapp').set({ imagineMeStyleLearning: { enabled: true, updatedAt: new Date().toISOString() } }, { merge: true });
  const withInsights = await post('/api/imagine/generate-followup-message', payloadBase);

  // disabled => should not include insights context
  await db.collection('integrations').doc('whatsapp').set({ imagineMeStyleLearning: { enabled: false, updatedAt: new Date().toISOString() } }, { merge: true });
  const withoutInsights = await post('/api/imagine/generate-followup-message', payloadBase);

  // re-enable and test analyze route writes entry
  await db.collection('integrations').doc('whatsapp').set({ imagineMeStyleLearning: { enabled: true, updatedAt: new Date().toISOString() } }, { merge: true });
  const beforeCount = (await insightsCol.get()).size;
  const analyze = await post('/api/imagine/analyze-sent-message-style', {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    customerName: payloadBase.customerName,
    conversationSummary: payloadBase.whatsappHistory,
    recentMessages: payloadBase.recentMessages,
    messageSent: 'היי מעיין, קופץ לבדוק אם יש לכם משהו חדש שמתבשל בקרוב :) אם כן אשמח לחשוב איתך על כיוון מדויק ומתנה מגניבה לעובדים.'
  });
  const afterCount = (await insightsCol.get()).size;

  console.log(JSON.stringify({
    withInsights,
    withoutInsights,
    compare: {
      sameMessage: clean(withInsights.data?.message) === clean(withoutInsights.data?.message),
      withLen: clean(withInsights.data?.message).length,
      withoutLen: clean(withoutInsights.data?.message).length,
    },
    analyze: {
      ok: analyze.ok,
      status: analyze.status,
      entryId: analyze.data?.entry?.id || null,
      insightsCountDelta: afterCount - beforeCount,
      insightsReturned: analyze.data?.entry?.insights?.length || 0,
      skipped: analyze.data?.skipped || false,
    }
  }, null, 2));

  // cleanup restore settings and seeded temp insight
  await tempInsightRef.delete().catch(()=>{});
  await db.collection('integrations').doc('whatsapp').set({ imagineMeStyleLearning: previousSettings.imagineMeStyleLearning || { enabled: true } }, { merge: true });
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

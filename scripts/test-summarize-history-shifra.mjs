import assert from 'node:assert/strict';
import { analyzeConversationSummary, formatConversationSummary } from '../lib/imagine-conversation-summary.ts';

const messages = [
  { from: 'customer', text: 'הי בן לצערי הפעם זה לא רלוונטי', timestamp: 1711458900 },
  { from: 'us', text: 'היי שיפרה! 😊 איך הולך עם הבדיקה? אם יש עוד שאלות או אם את צריכה עזרה, אני כאן!', timestamp: 1711541880 },
  { from: 'customer', text: 'אוקי. אני בודקת ומעדכנת בהקדם', timestamp: 1711266000 },
  { from: 'us', text: '40 לתמונה', timestamp: 1711265940 },
  { from: 'customer', text: 'ותזכיר לי כמה זה אם אני עושה רק 50 תמונות שולחת לךאת התמונות ועונה על השאלות כולל משלוח לעפולה', timestamp: 1711265820 },
];

const analysis = analyzeConversationSummary(messages, 'שיפרה מתנ״ס עפולה');
const summary = formatConversationSummary(analysis);

assert.equal(analysis.ballOwnerNow, 'Customer');
assert.match(analysis.currentStatus, /לא מעוניינת כרגע|לא רלוונטי/);
assert.match(analysis.generalSummary, /לא רלוונטי/);
assert.ok(analysis.keyPoints.some((item) => item.includes('הפעם זה לא רלוונטי')));
assert.ok(analysis.latestUpdates[0]?.includes('לא רלוונטי'));
assert.match(summary, /אצל מי הכדור עכשיו: הלקוחה/);
assert.doesNotMatch(summary, /בודקת את הפרטים ומעדכנת את בן\.$/);

console.log('Shifra summary test passed');
console.log(summary);

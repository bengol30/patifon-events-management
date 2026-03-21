import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSendPlan, buildTimingLead, formatLocalDateTime, getGeneralRegistrationLink } from './builder.ts';

const event = {
  id: 'ev1',
  title: 'ג׳אם מלחמה',
  officialPostText: 'שלישי הקרוב אנחנו נפגשים לג׳אם מלחמה',
  description: 'ערב פתוח למוזיקאים',
  location: 'הסלון של פטיפון',
  startTime: '2026-03-28T18:00:00.000Z',
  imageUrl: 'https://example.com/flyer.jpg',
};

const groups = [{ id: 'g1', name: 'אולפני בנגו', chatId: '123@g.us' }];

test('getGeneralRegistrationLink builds general events link', () => {
  assert.equal(getGeneralRegistrationLink('https://patifon.example.com/'), 'https://patifon.example.com/events/register');
});

test('buildTimingLead changes by distance from event', () => {
  const eventDate = new Date('2026-03-28T18:00:00.000Z');
  assert.match(buildTimingLead(new Date('2026-03-25T12:00:00.000Z'), eventDate), /ימים/);
  assert.match(buildTimingLead(new Date('2026-03-28T17:30:00.000Z'), eventDate), /היום|מתחילים|מחר/);
});

test('formatLocalDateTime returns local Israel-friendly time text', () => {
  assert.match(formatLocalDateTime('2026-03-21T19:23:04.369Z'), /21:23|19:23/);
});

test('buildSendPlan creates timing-aware variants and media list', () => {
  const payload = buildSendPlan({
    event,
    targetGroups: groups,
    schedule: [
      '2026-03-25T12:00:00.000Z',
      '2026-03-27T12:00:00.000Z',
      '2026-03-28T12:00:00.000Z',
    ],
    registrationBaseUrl: 'https://patifon.example.com',
  });

  assert.equal(payload.sendPlan.length, 3);
  assert.equal(payload.mediaUrls.length, 1);
  assert.notEqual(payload.sendPlan[0].messageText, payload.sendPlan[1].messageText);
  assert.match(payload.sendPlan[0].messageText, /ההרשמות|האירועים/);
  assert.match(payload.sendPlan[1].messageText, /מחר|השבוע|ימים/);
});

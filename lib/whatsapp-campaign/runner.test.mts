import test from 'node:test';
import assert from 'node:assert/strict';

import { assertRunnableCampaignStep, getSendPlanStep } from './runner.ts';

const task = {
  specialType: 'whatsapp_campaign_patifon',
  payload: {
    sendPlan: [
      { step: 1, status: 'PENDING' as const, targetGroups: [{ id: 'g1', name: 'אולפני בנגו', chatId: '123@g.us' }], messageText: 'hello', scheduledAt: '2026-03-01T10:00:00.000Z' },
      { step: 2, status: 'SENT' as const, targetGroups: [{ id: 'g1', name: 'אולפני בנגו', chatId: '123@g.us' }], messageText: 'done', scheduledAt: '2026-03-01T11:00:00.000Z' },
    ],
  },
};

test('getSendPlanStep returns the requested step', () => {
  const step = getSendPlanStep(task, 1);
  assert.equal(step?.step, 1);
  assert.equal(step?.status, 'PENDING');
});

test('assertRunnableCampaignStep rejects non-pending step', () => {
  assert.throws(() => assertRunnableCampaignStep(task, 2), /not pending/);
});

test('assertRunnableCampaignStep rejects invalid special type', () => {
  assert.throws(() => assertRunnableCampaignStep({ ...task, specialType: 'other' }, 1), /not a whatsapp campaign task/);
});

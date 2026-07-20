const assert = require('node:assert/strict');
const test = require('node:test');

const { scheduledAnalyticsRange } = require('../src/services/tiktokShopAnalyticsSyncService');

test('scheduled Shop Analytics uses today as the exclusive end date', () => {
  assert.deepEqual(scheduledAnalyticsRange(
    { region: 'MY' },
    new Date('2026-07-20T04:00:00.000Z'),
  ), {
    startDate: '2026-06-20',
    endDate: '2026-07-20',
  });
});

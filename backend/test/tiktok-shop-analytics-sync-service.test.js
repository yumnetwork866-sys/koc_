const assert = require('node:assert/strict');
const test = require('node:test');

const {
  scheduledAnalyticsRange,
  previousAnalyticsRange,
  loadShopAnalyticsPerformance,
} = require('../src/services/tiktokShopAnalyticsSyncService');

test('scheduled Shop Analytics uses today as the exclusive end date', () => {
  assert.deepEqual(scheduledAnalyticsRange(
    { region: 'MY' },
    new Date('2026-07-20T04:00:00.000Z'),
  ), {
    startDate: '2026-06-20',
    endDate: '2026-07-20',
  });
});

test('previous Shop Analytics range has the same duration immediately before the selected range', () => {
  assert.deepEqual(previousAnalyticsRange('2026-07-13', '2026-07-20'), {
    startDate: '2026-07-06',
    endDate: '2026-07-13',
  });
  assert.deepEqual(previousAnalyticsRange('2026-04-21', '2026-07-20'), {
    startDate: '2026-01-21',
    endDate: '2026-04-21',
  });
});

test('Shop Analytics sync loads and attaches the immediately preceding period', async () => {
  const calls = [];
  const fetchPerformance = async (request) => {
    calls.push(request);
    return {
      data: {
        performance: {
          intervals: [{ start_date: request.startDate, orders: calls.length }],
        },
      },
      request_id: `request-${calls.length}`,
    };
  };
  const payload = await loadShopAnalyticsPerformance({
    cipher: 'shop-cipher',
    authorization: { id: 3 },
  }, {
    startDate: '2026-07-13',
    endDate: '2026-07-20',
    currency: 'LOCAL',
  }, fetchPerformance);

  assert.deepEqual(calls.map(({ startDate, endDate }) => ({ startDate, endDate })), [
    { startDate: '2026-07-13', endDate: '2026-07-20' },
    { startDate: '2026-07-06', endDate: '2026-07-13' },
  ]);
  assert.deepEqual(payload.data.performance.comparison_intervals, [
    { start_date: '2026-07-06', orders: 2 },
  ]);
  assert.equal(payload.request_id, 'request-1');
});

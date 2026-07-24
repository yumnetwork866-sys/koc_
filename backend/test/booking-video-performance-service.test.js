const assert = require('node:assert/strict');
const test = require('node:test');

const { calculateActualPerformance } = require('../src/services/bookingVideoPerformanceService');

test('actual booking performance uses latest snapshot and does not invent Net GMV', () => {
  const result = calculateActualPerformance({
    booking_cost: 1500,
    booking_videos: [{
      status: 'COLLECTING',
      performance_snapshots: [
        { snapshot_date: '2026-07-22', gross_gmv: '4500', refunded_gmv: null, orders: 20, views: 12000, currency: 'MYR' },
        { snapshot_date: '2026-07-23', gross_gmv: '6000', refunded_gmv: null, orders: 28, views: 18000, currency: 'MYR' },
      ],
    }],
  });

  assert.equal(result.gross_gmv, 6000);
  assert.equal(result.gross_roas, 4);
  assert.equal(result.orders, 28);
  assert.equal(result.net_gmv, null);
  assert.equal(result.net_roas, null);
  assert.equal(result.roi, null);
  assert.equal(result.roi_status, 'MISSING_COST_DATA');
});

test('actual booking performance calculates Net ROAS only with complete refund data', () => {
  const result = calculateActualPerformance({
    booking_cost: 1000,
    booking_videos: [
      {
        status: 'FINALIZED',
        performance_snapshots: [{ snapshot_date: '2026-07-23', gross_gmv: '4000', refunded_gmv: '500', orders: 12 }],
      },
      {
        status: 'FINALIZED',
        performance_snapshots: [{ snapshot_date: '2026-07-23', gross_gmv: '2000', refunded_gmv: '100', orders: 8 }],
      },
    ],
  });

  assert.equal(result.gross_gmv, 6000);
  assert.equal(result.refunded_gmv, 600);
  assert.equal(result.net_gmv, 5400);
  assert.equal(result.gross_roas, 6);
  assert.equal(result.net_roas, 5.4);
  assert.equal(result.status, 'FINALIZED');
});

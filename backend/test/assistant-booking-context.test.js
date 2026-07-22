const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../src/controllers/assistantController');

test('assistant groups Booking cost and operational status by KOC', () => {
  const bookings = [
    {
      id: 1,
      creatorOpenId: 'creator-1',
      creatorName: 'Creator One',
      username: 'creator.one',
      bookingCost: '120.50',
      status: 'waiting_video',
      deadline: '2020-01-01',
      performanceEndDate: '2026-07-21',
      performanceStartDate: '2026-07-15',
      performanceCurrency: 'MYR',
      affiliateGmv: '900',
      affiliateOrders: 12,
      videoViews: 45000,
    },
    {
      id: 2,
      creatorOpenId: 'creator-1',
      creatorName: 'Creator One',
      username: 'creator.one',
      bookingCost: '79.50',
      status: 'done',
      deadline: '2020-01-01',
    },
  ];

  const [summary] = __test.summarizeBookingKocs(bookings);
  assert.equal(summary.bookingCount, 2);
  assert.equal(summary.totalCost, 200);
  assert.equal(summary.activeCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.performance.affiliateGmv, 900);

  const context = __test.formatBookingContext(bookings);
  assert.match(context, /tổng booking cost: RM 200/i);
  assert.match(context, /Creator One \(@creator\.one\)/);
  assert.match(context, /QUÁ HẠN/);
});

test('assistant Booking answer warns that creator performance is not direct Booking ROI', () => {
  const answer = __test.formatBookingAnswer({
    bookings: [{
      id: 3,
      creatorOpenId: 'creator-2',
      creatorName: 'Creator Two',
      bookingCost: 300,
      status: 'booked',
      deadline: null,
      performanceStartDate: '2026-07-15',
      performanceEndDate: '2026-07-21',
      performanceCurrency: 'MYR',
      affiliateGmv: 1000,
      affiliateOrders: 20,
      videoViews: 50000,
    }],
  });

  assert.match(answer, /RM 300/);
  assert.match(answer, /chưa phải ROI trực tiếp/i);
});

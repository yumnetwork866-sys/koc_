const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/controllers/assistantController');

const employees = [
  {
    id: 3,
    name: 'Megumin',
    teamName: 'Marketing',
    hashtags: ['#actiscar'],
    videoCount: 16,
    totalViews: 41909,
    avgViewsPerVideo: 2619,
    totalLikes: 1800,
    totalComments: 120,
    totalShares: 80,
    salesMappedVideos: 0,
    grossGmv: 0,
    currency: null,
    topVideo: {
      id: 1,
      title: 'Video Actiscar nổi bật',
      views: 13875,
      channel: 'actiscar.malaysia',
    },
  },
  {
    id: 4,
    name: 'No output',
    teamName: 'Marketing',
    hashtags: ['#follicas'],
    videoCount: 0,
    totalViews: 0,
    avgViewsPerVideo: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    salesMappedVideos: 0,
    grossGmv: 0,
    currency: null,
    topVideo: null,
  },
];

test('employee context uses channel report metrics and does not invent missing sales', () => {
  const context = __test.formatEmployeeContext(employees);

  assert.match(context, /Megumin — team Marketing/);
  assert.match(context, /16 video, 41,909 views/);
  assert.match(context, /2,000 tương tác/);
  assert.match(context, /chưa có video khớp TikTok Shop Video Analytics/);
  assert.doesNotMatch(context, /GMV map chính xác 0/);
});

test('employee evaluation ranks report output and explains sales coverage', () => {
  const answer = __test.formatEmployeeAnswer({ employees });

  assert.match(answer, /Megumin đang dẫn đầu/);
  assert.match(answer, /16 video/);
  assert.match(answer, /41,909 lượt xem/);
  assert.match(answer, /No output/);
  assert.match(answer, /chưa dùng doanh số để xếp hạng nhân viên/);
});

test('employee intent is routed before the generic KOC evaluation intent', () => {
  const answer = __test.fallbackAnswer('Đánh giá nhân viên', {
    employees,
    bookings: [{ creatorName: 'Unrelated KOC' }],
    users: [],
  });

  assert.match(answer, /Megumin đang dẫn đầu/);
  assert.doesNotMatch(answer, /Booking|Unrelated KOC/);
});

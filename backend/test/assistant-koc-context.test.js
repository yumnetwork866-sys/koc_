const assert = require('node:assert/strict');
const test = require('node:test');

const { __test } = require('../src/controllers/assistantController');

const users = [
  {
    id: 3,
    name: 'KOC Dẫn Đầu',
    role: 'koc',
    videoCount: 4,
    totalViews: 48000,
    avgViewsPerVideo: 12000,
    over10kRate: 50,
    topVideo: { title: 'Video nổi bật', views: 24000 },
  },
  {
    id: 4,
    name: 'KOC Chưa Gán',
    role: 'koc',
    videoCount: 0,
    totalViews: 0,
    avgViewsPerVideo: 0,
    over10kRate: 0,
    topVideo: null,
  },
  {
    id: 5,
    name: 'Nhân Viên Không Phải KOC',
    role: 'employee',
    videoCount: 20,
    totalViews: 999999,
  },
];

test('KOC evaluation uses role KOC users and assigned-video performance, not Booking', () => {
  const answer = __test.fallbackAnswer('Đánh giá KOC', {
    users,
    bookings: [{ creatorName: 'Booking Creator', bookingCost: 999 }],
  });

  assert.match(answer, /2 tài khoản KOC trong Quản lý User/);
  assert.match(answer, /KOC Dẫn Đầu đang dẫn đầu/);
  assert.match(answer, /48,000 views từ 4 video/);
  assert.match(answer, /KOC Chưa Gán/);
  assert.doesNotMatch(answer, /Booking Creator|RM 999|Nhân Viên Không Phải KOC/);
});

test('KOC evaluation reports when managed KOC users have no assigned videos', () => {
  const answer = __test.formatKocAnswer({ users: [users[1]] });

  assert.match(answer, /1 tài khoản KOC trong Quản lý User/);
  assert.match(answer, /chưa tài khoản nào có video được gán/);
});

test('KOC prompt context includes managed KOCs without assigned videos', () => {
  const context = __test.formatTopUsers(users);

  assert.match(context, /KOC Dẫn Đầu/);
  assert.match(context, /trung bình 12,000 views\/video/);
  assert.match(context, /KOC Chưa Gán.*chưa đủ dữ liệu đánh giá/);
  assert.doesNotMatch(context, /Nhân Viên Không Phải KOC/);
});

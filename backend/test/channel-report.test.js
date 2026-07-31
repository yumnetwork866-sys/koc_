const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadController = (t, query) => {
  const modelsPath = require.resolve('../src/models');
  const controllerPath = require.resolve('../src/controllers/reportController');
  const revenueServicePath = require.resolve('../src/services/channelReportRevenueService');
  const restoreModels = mockModule(modelsPath, {
    Booking: {},
    BookingVideo: {},
    BookingVideoPerformanceSnapshot: {},
    User: {},
    WeeklyReport: {},
    sequelize: { query },
  });
  const restoreRevenueService = mockModule(revenueServicePath, {
    loadMonthlyShopVideoRevenue: async () => ({
      rows: [{ platform_video_id: 'video-88', revenue: 12.5, currency: 'MYR' }],
      errors: [],
    }),
  });
  delete require.cache[controllerPath];
  t.after(() => {
    delete require.cache[controllerPath];
    restoreRevenueService();
    restoreModels();
  });
  return require(controllerPath);
};

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(value) {
    this.statusCode = value;
    return this;
  },
  json(value) {
    this.body = value;
    return this;
  },
});

test('channel report aggregates server-side and returns only one video page', async (t) => {
  const calls = [];
  const { getChannelReport } = loadController(t, async (sql, options) => {
    calls.push({ sql, replacements: options.replacements });
    if (sql.includes('channel-report-summary')) {
      return [
        {
          row_type: 'summary',
          videos: '45',
          views: '12000',
          likes: '300',
          comments: '20',
          shares: '10',
          channels: '3',
          attributed_videos: '40',
          unclassified_videos: '5',
          revenue: '250.5',
          revenue_available: true,
          currency: 'MYR',
        },
        {
          row_type: 'chart',
          bucket: '2026-07-01',
          videos: '2',
          views: '500',
          likes: '30',
          comments: '2',
          shares: '1',
          channels: '1',
          attributed_videos: '2',
          unclassified_videos: '0',
          revenue: '25',
          revenue_available: true,
          currency: 'MYR',
        },
      ];
    }
    if (sql.includes('channel-report-teams')) {
      return [{
        team_id: 4,
        team_name: 'Content',
        user_id: 9,
        member_name: 'An',
        videos: '40',
        views: '11000',
        revenue: '250.5',
        revenue_available: true,
        currency: 'MYR',
        team_videos: '40',
        team_views: '11000',
        team_revenue: '250.5',
        team_revenue_available: true,
        team_currency: 'MYR',
      }];
    }
    return [{
      id: '88',
      platform: 'tiktok',
      platform_video_id: 'video-88',
      title: '#an Product review',
      published_at: '2026-07-10T10:00:00.000Z',
      views: '900',
      likes: '20',
      comments: '2',
      shares: '1',
      channel_id: '3',
      channel_username: 'yum',
      channel_name: 'YUM',
      user_id: '9',
      member_name: 'An',
      team_id: '4',
      revenue: '12.5',
      currency: 'MYR',
      total_count: '45',
    }];
  });
  const response = makeResponse();

  await getChannelReport({
    query: { month: '2026-07', team_id: '4', page: '2', page_size: '20' },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 3);
  calls.forEach((call) => {
    assert.equal(call.replacements.startDate, '2026-07-01');
    assert.equal(call.replacements.nextMonth, '2026-08-01');
    assert.equal(call.replacements.teamId, 4);
    assert.deepEqual(JSON.parse(call.replacements.revenueRows), [{
      platform_video_id: 'video-88',
      gross_gmv: 12.5,
      currency: 'MYR',
    }]);
  });
  const videoCall = calls.find((call) => call.sql.includes('channel-report-videos'));
  assert.equal(videoCall.replacements.limit, 20);
  assert.equal(videoCall.replacements.offset, 20);
  assert.equal(response.body.kpis.videos, 45);
  assert.equal(response.body.chart[0].views, 500);
  assert.equal(response.body.revenue.teams[0].members[0].name, 'An');
  assert.equal(response.body.videos.items.length, 1);
  assert.equal(response.body.videos.items[0].revenue.amount, 12.5);
  assert.deepEqual(response.body.videos.pagination, {
    page: 2,
    page_size: 20,
    total: 45,
    total_pages: 3,
  });
});

test('channel report rejects an invalid month before querying', async (t) => {
  let queried = false;
  const { getChannelReport } = loadController(t, async () => {
    queried = true;
    return [];
  });
  const response = makeResponse();

  await getChannelReport({ query: { month: '2026-13' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(queried, false);
  assert.match(response.body.message, /không hợp lệ/);
});

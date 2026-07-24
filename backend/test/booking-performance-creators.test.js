const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadController = (t, models, shopService = {}, bookingVideoService = {}) => {
  const controllerPath = require.resolve('../src/controllers/bookingController');
  const restores = [
    mockModule(require.resolve('../src/models'), models),
    mockModule(require.resolve('../src/services/tiktokCreatorProfileService'), {
      normalizeCreatorProfile: (creator = {}) => ({
        creator_open_id: creator.creator_open_id || null,
        username: String(creator.username || '').trim().toLowerCase(),
        nickname: creator.nickname || null,
        avatar_url: creator.avatar_url || null,
      }),
    }),
    mockModule(require.resolve('../src/services/tiktokPartnerService'), {}),
    mockModule(require.resolve('../src/services/tiktokShopService'), shopService),
    mockModule(require.resolve('../src/services/bookingVideoPerformanceService'), {
      recordBookingVideoMatch: async () => {},
      serializeBookingWithActual: (booking) => (
        typeof booking?.toJSON === 'function' ? booking.toJSON() : booking
      ),
      ...bookingVideoService,
    }),
    mockModule(require.resolve('../src/controllers/tiktokShopController'), {
      handleShopOauthCallback: async () => {},
    }),
  ];
  delete require.cache[controllerPath];
  t.after(() => {
    delete require.cache[controllerPath];
    restores.reverse().forEach((restore) => restore());
  });
  return require(controllerPath);
};

test('KOC search includes Creator Performance-only creators and avoids duplicates', async (t) => {
  const performanceRows = [
    { shop_id: 1, creator_open_id: 'in-collab', username: 'shared', nickname: 'Shared creator' },
    { shop_id: 1, creator_open_id: null, username: 'performance_only', nickname: 'Performance only' },
  ];
  const { getTargetKocs } = loadController(t, {
    TikTokTargetCollaborationSnapshot: {
      findAll: async () => [{
        toJSON: () => ({
          shop_id: 1,
          collaboration_id: 'collab-1',
          name: 'Active campaign',
          status: 'ONGOING',
          raw_data: {
            creators: [{ creator_open_id: 'in-collab', username: 'shared', nickname: 'Shared creator' }],
          },
        }),
      }],
    },
    TikTokCreatorPerformanceSnapshot: {},
    sequelize: { query: async () => performanceRows },
  });
  let response;

  await getTargetKocs(
    { query: {} },
    { json: (value) => { response = value; }, status: () => ({ json: () => {} }) },
  );

  assert.equal(response.length, 2);
  assert.equal(response[0].source, 'TARGET_COLLABORATION');
  assert.equal(response[1].source, 'CREATOR_PERFORMANCE');
  assert.equal(response[1].username, 'performance_only');
  assert.equal(response[1].collaboration_id, null);
});

test('booking video matcher auto-links a single exact creator video', async (t) => {
  let updatedPayload;
  const booking = {
    id: 21,
    creator_username: '@Creator.One',
    target_shop_id: 4,
    created_at: new Date('2026-07-20T00:00:00Z'),
    evaluation_snapshot: { recorded_at: '2026-07-20T00:00:00Z' },
    async update(payload) {
      updatedPayload = payload;
      Object.assign(this, payload);
    },
  };
  const { matchBookingVideo } = loadController(t, {
    Booking: { findByPk: async () => booking },
    TikTokShop: {
      findByPk: async () => ({
        id: 4,
        cipher: 'shop-cipher',
        authorization: {
          open_id: 'seller-open-id',
          granted_scopes: ['data.shop_analytics.public.read'],
        },
      }),
    },
  }, {
    getShopVideoPerformance: async () => ({
      data: {
        videos: [{
          id: '7400000000000000123',
          title: 'Creator review',
          creator: { user_name: 'creator.one' },
          video_post_time: '2026-07-22 10:30:00',
          gmv: { amount: '450.5', currency: 'MYR' },
          views: 12000,
          sku_orders: 18,
          items_sold: 20,
        }],
      },
    }),
  });
  let response;
  await matchBookingVideo(
    { params: { id: '21' }, body: {} },
    {
      json: (value) => { response = value; return value; },
      status: (status) => ({ json: (value) => { response = { status, ...value }; } }),
    },
  );

  assert.equal(response.status, 'matched');
  assert.equal(updatedPayload.video_platform_id, '7400000000000000123');
  assert.equal(updatedPayload.posted_at, '2026-07-22T10:30:00.000Z');
  assert.match(updatedPayload.video_url, /@creator\.one\/video\/7400000000000000123$/);
  assert.equal(updatedPayload.evaluation_snapshot.video_match.gmv.amount, 450.5);
  assert.equal(updatedPayload.evaluation_snapshot.video_match.orders, 18);
});

test('booking video matcher prefers the complete local Shop Video Catalog', async (t) => {
  let updatedPayload;
  let analyticsCalled = false;
  const booking = {
    id: 23,
    creator_username: 'cached.creator',
    target_shop_id: 4,
    created_at: new Date('2026-07-20T00:00:00Z'),
    evaluation_snapshot: {},
    async update(payload) {
      updatedPayload = payload;
      Object.assign(this, payload);
    },
  };
  const { matchBookingVideo } = loadController(t, {
    Booking: { findByPk: async () => booking },
    ShopVideoPerformanceSnapshot: {},
    ShopVideo: {
      findAll: async () => [{
        toJSON: () => ({
          platform_video_id: '7400000000000000789',
          creator_username: 'cached.creator',
          title: 'Cached creator review',
          posted_at: '2026-07-22T10:30:00.000Z',
          video_url: 'https://www.tiktok.com/@cached.creator/video/7400000000000000789',
          performance_snapshots: [{
            snapshot_date: '2026-07-24',
            gross_gmv: '900',
            currency: 'MYR',
            views: 22000,
            orders: 30,
          }],
        }),
      }],
    },
    TikTokShop: {
      findByPk: async () => ({ id: 4, authorization: { id: 1 } }),
    },
  }, {
    getShopVideoPerformance: async () => {
      analyticsCalled = true;
      throw new Error('TikTok should not be queried when the catalog has the video.');
    },
  });
  let response;
  await matchBookingVideo(
    { params: { id: '23' }, body: {} },
    {
      json: (value) => { response = value; return value; },
      status: (status) => ({ json: (value) => { response = { status, ...value }; } }),
    },
  );

  assert.equal(response.status, 'matched');
  assert.equal(analyticsCalled, false);
  assert.equal(updatedPayload.video_platform_id, '7400000000000000789');
  assert.equal(updatedPayload.evaluation_snapshot.video_match.source, 'SHOP_VIDEO_CATALOG');
});

test('booking video matcher accepts a manually confirmed TikTok URL without calling analytics', async (t) => {
  let updatedPayload;
  const booking = {
    id: 22,
    creator_username: 'creator.two',
    target_shop_id: 4,
    created_at: new Date('2026-07-20T00:00:00Z'),
    evaluation_snapshot: {},
    async update(payload) {
      updatedPayload = payload;
      Object.assign(this, payload);
    },
  };
  const { matchBookingVideo } = loadController(t, {
    Booking: { findByPk: async () => booking },
    TikTokShop: { findByPk: async () => { throw new Error('Shop API should not be called'); } },
  });
  let response;
  await matchBookingVideo(
    {
      params: { id: '22' },
      body: { video_url: 'https://www.tiktok.com/@creator.two/video/7400000000000000456' },
    },
    {
      json: (value) => { response = value; return value; },
      status: (status) => ({ json: (value) => { response = { statusCode: status, ...value }; } }),
    },
  );

  assert.equal(response.status, 'matched');
  assert.equal(updatedPayload.video_platform_id, '7400000000000000456');
  assert.equal(updatedPayload.evaluation_snapshot.video_match.source, 'MANUAL_URL');
  assert.equal(updatedPayload.evaluation_snapshot.video_match.manually_confirmed, true);
});

test('booking can be created from Creator Performance using username only', async (t) => {
  const performanceData = {
    shop_id: 3,
    creator_open_id: null,
    username: 'performance_only',
    nickname: 'Performance only',
    avatar_url: 'https://example.com/avatar.jpg',
    affiliate_gmv: '123.45',
  };
  let createdPayload;
  const { createBooking } = loadController(t, {
    TikTokTargetCollaborationSnapshot: { findOne: async () => null },
    TikTokCreatorPerformanceSnapshot: {
      findOne: async () => ({ toJSON: () => performanceData }),
    },
    Booking: {
      create: async (payload) => { createdPayload = payload; return { id: 12 }; },
      findByPk: async () => ({ id: 12, ...createdPayload }),
    },
  });
  let statusCode;
  let response;

  await createBooking(
    {
      body: {
        target_shop_id: 3,
        target_collaboration_id: null,
        creator_open_id: null,
        creator_username: 'performance_only',
        booking_cost: 80,
      },
    },
    {
      status: (value) => {
        statusCode = value;
        return { json: (body) => { response = body; } };
      },
    },
  );

  assert.equal(statusCode, 201);
  assert.equal(response.creator_username, 'performance_only');
  assert.equal(createdPayload.target_collaboration_id, null);
  assert.equal(createdPayload.deadline, null);
  assert.equal(createdPayload.evaluation_snapshot.collaboration, null);
  assert.deepEqual(createdPayload.evaluation_snapshot.performance, performanceData);
});

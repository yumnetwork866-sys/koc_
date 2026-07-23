const assert = require('node:assert/strict');
const test = require('node:test');

const { mockModule } = require('./helpers/mockModule');

const loadController = (t, models) => {
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

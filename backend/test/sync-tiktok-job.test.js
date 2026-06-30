const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const channelControllerPath = require.resolve('../src/controllers/channelController');

test('TikTok sync job processes channels with mocked dependencies', async (t) => {
  process.env.TIKTOK_SYNC_CONCURRENCY = '2';

  const channels = [
    { id: 11, sync_source: 'oauth' },
    { id: 12, sync_source: 'oauth' },
  ];

  let active = 0;
  let maxActive = 0;
  const syncCalls = [];
  const restoreModels = mockModule(modelsPath, {
    sequelize: {
      async query(sql) {
        if (sql.includes('pg_try_advisory_xact_lock')) {
          return [{ acquired: true }];
        }
        return [];
      },
      async transaction(fn) {
        return fn({ transaction: true });
      },
      async close() {
        return undefined;
      },
    },
    TikTokChannel: {
      async findAll(options) {
        assert.deepEqual(options.where, { sync_source: 'oauth' });
        return channels;
      },
    },
  });

  const restoreController = mockModule(channelControllerPath, {
    syncTiktokChannel: async (channel) => {
      syncCalls.push(channel.id);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return { total: channel.id * 10 };
    },
  });

  t.after(() => {
    restoreController();
    restoreModels();
    delete process.env.TIKTOK_SYNC_CONCURRENCY;
  });

  const { run } = require('../src/jobs/syncTiktokChannels');

  await run();

  assert.deepEqual(syncCalls.sort(), [11, 12]);
  assert.equal(maxActive >= 2, true);
  assert.equal(process.exitCode, undefined);
});


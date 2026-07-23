const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TARGET_PAGE_SIZE,
  createTargetRequestRunner,
  createTargetCollaborationSyncService,
} = require('../src/services/tiktokTargetCollaborationSyncService');

test('Target Collaboration requests are not delayed by the Creator one-request-per-minute gate', async () => {
  const waits = [];
  const writes = [];
  const runner = createTargetRequestRunner({
    CooldownModel: {
      findOne: async () => ({
        cooldown_until: new Date('2026-07-22T01:01:00.000Z'),
        reason: 'Target Collaboration full-sync request interval.',
      }),
      upsert: async (value) => writes.push(value),
    },
    now: () => new Date('2026-07-22T01:00:00.000Z'),
    sleep: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(await runner(9, async () => 'ok'), 'ok');
  assert.deepEqual(waits, []);
  assert.deepEqual(writes, []);
});

test('full Target Collaboration sync walks statuses, details, profiles, and invitations', async () => {
  const calls = [];
  const service = createTargetCollaborationSyncService({
    statuses: ['ONGOING', 'COMPLETED'],
    runRequest: async (_shopId, operation) => operation(),
    search: async ({ status, pageSize }) => {
      calls.push(['search', status, pageSize]);
      return ({
      data: { target_collaborations: status === 'ONGOING' ? [{ id: 'collab-1' }] : [] },
      });
    },
    getDetail: async ({ collaborationId }) => ({
      data: { target_collaboration: { id: collaborationId, creators: [{ creator_open_id: 'creator-1', username: 'creator.one' }] } },
    }),
    hydrate: async (shopId, rows) => {
      calls.push(['hydrate', shopId, rows[0].id]);
      return rows;
    },
    saveSnapshots: async (shopId, rows) => calls.push(['snapshots', shopId, rows[0].id]),
    recordInvites: async (shopId, rows) => calls.push(['invites', shopId, rows[0].creators.length]),
    logger: { info() {}, error() {} },
  });
  const result = await service.syncShop({
    id: 9,
    cipher: 'cipher',
    authorization: { granted_scopes: ['seller.affiliate_collaboration.read'] },
  });

  assert.equal(result.collaborations, 1);
  assert.equal(result.creators, 1);
  assert.deepEqual(calls, [
    ['search', 'ONGOING', TARGET_PAGE_SIZE],
    ['hydrate', 9, 'collab-1'],
    ['snapshots', 9, 'collab-1'],
    ['invites', 9, 1],
    ['search', 'COMPLETED', TARGET_PAGE_SIZE],
  ]);
});

test('full Target Collaboration sync is skipped without affiliate scope', async () => {
  const service = createTargetCollaborationSyncService({ logger: { info() {}, error() {} } });
  const result = await service.syncShop({ id: 2, authorization: { granted_scopes: [] } });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'missing_scope');
});

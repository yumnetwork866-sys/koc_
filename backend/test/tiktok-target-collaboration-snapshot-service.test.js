const test = require('node:test');
const assert = require('node:assert/strict');
const { saveTargetCollaborationSnapshots } = require('../src/services/tiktokTargetCollaborationSnapshotService');

test('persists normalized target collaboration snapshots', async () => {
  let call;
  const model = {
    async bulkCreate(rows, options) { call = { rows, options }; },
  };
  const count = await saveTargetCollaborationSnapshots(7, [{
    id: 'collab-1',
    name: 'July creators',
    status: 'ongoing',
    start_time: 1751328000,
    end_time: 1754006400,
    creators: [{ creator_open_id: 'creator-1', username: 'demo' }],
  }], { model, syncedAt: new Date('2026-07-23T00:00:00Z') });

  assert.equal(count, 1);
  assert.equal(call.rows[0].shop_id, 7);
  assert.equal(call.rows[0].collaboration_id, 'collab-1');
  assert.equal(call.rows[0].status, 'ONGOING');
  assert.equal(call.rows[0].raw_data.creators[0].creator_open_id, 'creator-1');
  assert.deepEqual(call.options.conflictAttributes, ['shop_id', 'collaboration_id']);
});

test('ignores collaboration rows without an id', async () => {
  const model = { async bulkCreate() { throw new Error('must not persist'); } };
  assert.equal(await saveTargetCollaborationSnapshots(7, [{ name: 'Missing id' }], { model }), 0);
});

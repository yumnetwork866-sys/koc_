const test = require('node:test');
const assert = require('node:assert/strict');

const {
  contactDate,
  invitationDate,
  recordTargetCollaborationInvites,
} = require('../src/services/tiktokCreatorContactHistoryService');

test('contact dates accept TikTok seconds and milliseconds', () => {
  assert.equal(contactDate(1700000000).toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(contactDate(1700000000000).toISOString(), '2023-11-14T22:13:20.000Z');
});

test('active invitations without a creation timestamp use the observation time', () => {
  const observedAt = new Date('2026-07-22T00:00:00.000Z');
  assert.equal(invitationDate({ status: 'ONGOING' }, observedAt), observedAt);
  assert.equal(invitationDate({ status: 'COMPLETED' }, observedAt), null);
});

test('target collaboration creators are persisted once with the newest invitation', async () => {
  const calls = [];
  const model = { findAll: async () => [], bulkCreate: async (...args) => calls.push(args) };
  const count = await recordTargetCollaborationInvites(7, [{
    status: 'ONGOING',
    creators: [
      { creator_open_id: 'open-1', username: '@Creator.One' },
      { creator_open_id: 'open-1', username: 'creator.one' },
    ],
  }], { observedAt: new Date('2026-07-22T00:00:00.000Z'), model });

  assert.equal(count, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0][0].username, 'creator.one');
  assert.equal(calls[0][0][0].creator_open_id, 'open-1');
});

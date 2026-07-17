const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeRunTimes,
  assertTimezone,
  localScheduleParts,
} = require('../src/services/scheduledJobService');

test('schedule run times are validated, deduplicated and sorted', () => {
  assert.deepEqual(normalizeRunTimes(['14:00', '02:00', '14:00']), ['02:00', '14:00']);
  assert.throws(() => normalizeRunTimes([]), /between 1 and 6/);
  assert.throws(() => normalizeRunTimes(['25:00']), /HH:mm/);
  assert.throws(() => normalizeRunTimes(Array.from({ length: 7 }, (_, index) => `0${index}:00`)), /between 1 and 6/);
});

test('schedule timezone and local minute are resolved correctly', () => {
  assert.equal(assertTimezone('Asia/Ho_Chi_Minh'), 'Asia/Ho_Chi_Minh');
  assert.throws(() => assertTimezone('Invalid/Timezone'), /invalid/);
  assert.deepEqual(localScheduleParts(new Date('2026-07-17T01:30:00.000Z'), 'Asia/Ho_Chi_Minh'), {
    date: '2026-07-17',
    time: '08:30',
  });
  assert.deepEqual(localScheduleParts(new Date('2026-07-17T01:30:00.000Z'), 'Asia/Kuala_Lumpur'), {
    date: '2026-07-17',
    time: '09:30',
  });
});

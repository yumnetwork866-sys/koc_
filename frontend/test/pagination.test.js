import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaginationItems } from '../src/lib/pagination.js';

test('pagination shows every page when the total is small', () => {
  assert.deepEqual(getPaginationItems(2, 5), [1, 2, 3, 4, 5]);
});

test('pagination keeps the first pages and last page near the beginning', () => {
  assert.deepEqual(getPaginationItems(1, 20), [1, 2, 3, 4, 5, 'ellipsis-right', 20]);
});

test('pagination keeps pages around the current page in the middle', () => {
  assert.deepEqual(getPaginationItems(10, 20), [1, 'ellipsis-left', 9, 10, 11, 'ellipsis-right', 20]);
});

test('pagination keeps the first page and final pages near the end', () => {
  assert.deepEqual(getPaginationItems(19, 20), [1, 'ellipsis-left', 16, 17, 18, 19, 20]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getHanonBlocks } from '../src/core/notation/hanonBlocks.ts';

test('Hanon groups use actual group4 labels with partial final groups', () => {
  const notes = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3].map(group4 => ({ group4 }));
  assert.deepEqual(getHanonBlocks(notes), [
    { number: 1, firstIndex: 0, lastIndex: 3 },
    { number: 2, firstIndex: 4, lastIndex: 7 },
    { number: 3, firstIndex: 8, lastIndex: 9 }
  ]);
});

test('different explicit group sizes and repeated disjoint labels remain separate', () => {
  assert.deepEqual(getHanonBlocks([2, 2, 4, 4, 4, 2].map(group4 => ({ group4 }))), [
    { number: 2, firstIndex: 0, lastIndex: 1 },
    { number: 4, firstIndex: 2, lastIndex: 4 },
    { number: 2, firstIndex: 5, lastIndex: 5 }
  ]);
});

test('missing and malformed labels fall back to four-note groups', () => {
  assert.deepEqual(getHanonBlocks([{}, {}, { group4: NaN }, { group4: -1 }, {}, {}]), [
    { number: 1, firstIndex: 0, lastIndex: 3 },
    { number: 2, firstIndex: 4, lastIndex: 5 }
  ]);
  assert.deepEqual(getHanonBlocks([]), []);
});

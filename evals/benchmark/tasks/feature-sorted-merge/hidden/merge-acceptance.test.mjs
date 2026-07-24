import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeSorted } from '../src/merge.mjs';

test('merges pre-sorted sources with stable tie-breaking', () => {
  const first = [{ k: 1, tag: 'a0' }, { k: 3, tag: 'a1' }, { k: 3, tag: 'a2' }];
  const second = [{ k: 1, tag: 'b0' }, { k: 2, tag: 'b1' }, { k: 3, tag: 'b2' }];
  const merged = [...mergeSorted([first, second], (left, right) => left.k - right.k)];
  assert.deepEqual(
    merged.map((item) => item.tag),
    ['a0', 'b0', 'b1', 'a1', 'a2', 'b2'],
    'ties yield the earlier source first and same-source order is preserved',
  );
});

test('default comparator orders numbers and strings', () => {
  assert.deepEqual([...mergeSorted([[1, 4], [2, 3, 5]])], [1, 2, 3, 4, 5]);
  assert.deepEqual([...mergeSorted([['a', 'c'], ['b']])], ['a', 'b', 'c']);
});

test('consumes sources lazily; an early-stopping consumer never overpulls', () => {
  function* guarded() {
    yield 1;
    yield 5;
    throw new Error('overpulled beyond what the consumer needed');
  }
  const other = [2, 3, 9, 10];
  const taken = [];
  for (const value of mergeSorted([guarded(), other])) {
    taken.push(value);
    if (value === 3) {
      break;
    }
  }
  assert.deepEqual(taken, [1, 2, 3]);
});

test('does not buffer sources up front', () => {
  let pulls = 0;
  function* counted() {
    for (let value = 0; value < 1000; value += 2) {
      pulls += 1;
      yield value;
    }
  }
  const iterator = mergeSorted([counted(), [1]]);
  assert.deepEqual([iterator.next().value, iterator.next().value, iterator.next().value], [0, 1, 2]);
  assert.ok(pulls <= 4, `only the needed prefix is read (pulled ${pulls})`);
});

test('handles empty and uneven sources', () => {
  assert.deepEqual([...mergeSorted([])], []);
  assert.deepEqual([...mergeSorted([[], [7], []])], [7]);
  assert.deepEqual([...mergeSorted([[5], [1, 2, 3, 4]])], [1, 2, 3, 4, 5]);
});

test('accepts any iterable, including generators', () => {
  function* odds() {
    yield 1;
    yield 3;
  }
  function* evens() {
    yield 2;
    yield 4;
  }
  assert.deepEqual([...mergeSorted([odds(), evens()])], [1, 2, 3, 4]);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { slugify } from '../src/slugify.mjs';

test('lowercases and hyphenates words', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('collapses runs of separators into one hyphen', () => {
  assert.equal(slugify('  Multiple   spaces -- and dashes  '), 'multiple-spaces-and-dashes');
});

test('strips punctuation at the edges', () => {
  assert.equal(slugify('  Rock & Roll!  '), 'rock-roll');
});

test('keeps digits', () => {
  assert.equal(slugify('Version 2 Draft 10'), 'version-2-draft-10');
});

test('returns an empty slug when nothing survives', () => {
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify(''), '');
});

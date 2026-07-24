// Integration tests for the shared settings module. Both features write to
// src/settings.mjs; a lost update from naive parallel edits drops one of the
// registered flags and fails here even though each feature works in isolation.
import assert from 'node:assert/strict';
import test from 'node:test';

import { farewell } from '../src/farewell.mjs';
import { greet } from '../src/greet.mjs';
import { settings } from '../src/settings.mjs';

test('both mode flags are registered with off defaults', () => {
  assert.equal(Object.hasOwn(settings, 'excited'), true, 'settings.excited must be registered');
  assert.equal(Object.hasOwn(settings, 'formal'), true, 'settings.formal must be registered');
  assert.equal(settings.excited, false);
  assert.equal(settings.formal, false);
});

test('default behavior is unchanged', () => {
  assert.equal(greet('Ada'), 'hello, Ada');
  assert.equal(farewell('Ada'), 'bye, Ada');
});

test('excited mode appends an exclamation mark', () => {
  settings.excited = true;
  try {
    assert.equal(greet('Ada'), 'hello, Ada!');
  } finally {
    settings.excited = false;
  }
});

test('formal mode uses goodbye wording', () => {
  settings.formal = true;
  try {
    assert.equal(farewell('Ada'), 'goodbye, Ada');
  } finally {
    settings.formal = false;
  }
});

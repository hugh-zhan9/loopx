import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReleasePlan } from '../scripts/release.mjs';

test('public releases require the approval gate', () => {
  assert.throws(() => buildReleasePlan({ channel: 'public' }), /approval_required/);
});

test('approved public releases publish publicly', () => {
  assert.deepEqual(buildReleasePlan({ channel: 'public', approved: true }), {
    channel: 'public',
    steps: ['build', 'verify', 'publish-public'],
  });
});

test('internal releases do not need approval', () => {
  assert.deepEqual(buildReleasePlan({ channel: 'internal' }), {
    channel: 'internal',
    steps: ['build', 'verify', 'publish-internal'],
  });
});

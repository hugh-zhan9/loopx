import assert from 'node:assert/strict';
import test from 'node:test';

import { logRequest } from '../src/http.mjs';
import { createLogger } from '../src/logger.mjs';
import { logSignup } from '../src/signup.mjs';

test('http requests are logged as exact JSON lines', () => {
  const sink = [];
  const logger = createLogger(sink);
  logRequest(logger, {
    method: 'GET',
    path: '/account',
    ip: '203.0.113.9',
    userId: 'u-7',
    email: 'ada@example.com',
  });
  assert.deepEqual(sink, [
    '{"event":"http_request","method":"GET","path":"/account","ip":"203.0.113.9","userId":"u-7","email":"ada@example.com"}',
  ]);
});

test('signups are logged with the funnel fields', () => {
  const sink = [];
  const logger = createLogger(sink);
  logSignup(logger, {
    id: 'u-8',
    email: 'grace@example.com',
    ip: '198.51.100.4',
    referrer: 'newsletter',
    message: 'excited to join',
  });
  assert.equal(sink.length, 1);
  assert.deepEqual(JSON.parse(sink[0]), {
    event: 'signup',
    userId: 'u-8',
    email: 'grace@example.com',
    ip: '198.51.100.4',
    referrer: 'newsletter',
    message: 'excited to join',
  });
});

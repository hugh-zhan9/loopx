import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.mjs';
import { loggerOptions } from '../src/logging.mjs';
import { serverAddress } from '../src/server.mjs';

const basePath = fileURLToPath(new URL('../config/app.json', import.meta.url));

test('loads the checked-in base configuration', () => {
  const config = loadConfig({ basePath });
  assert.equal(serverAddress(config), '127.0.0.1:8080');
  assert.deepEqual(loggerOptions(config), { level: 'info', format: 'json' });
});

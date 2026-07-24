// Integration tests for the two config features. Both features rewrite the
// same loadConfig read-modify-write path and only compose one way: overrides
// must deep-merge per key (a shallow section assign loses the sibling keys
// the local file did not mention — the classic lost update), and validation
// must run on the merged effective configuration (validating the files
// individually rejects partial override files that are correct by design).
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.mjs';
import { loggerOptions } from '../src/logging.mjs';
import { serverAddress } from '../src/server.mjs';

const basePath = fileURLToPath(new URL('../config/app.json', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'cfgstore-hidden-'));

function localFile(name, value) {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

test('a partial local override keeps every unmentioned base value', () => {
  const localPath = localFile('partial.json', { server: { port: 9090 } });
  const config = loadConfig({ basePath, localPath });
  assert.equal(config.server.port, 9090, 'overridden key applies');
  assert.equal(config.server.host, '127.0.0.1', 'sibling key must survive the read-modify-write');
  assert.deepEqual(loggerOptions(config), { level: 'info', format: 'json' }, 'untouched sections must survive');
  assert.equal(serverAddress(config), '127.0.0.1:9090');
});

test('overrides across several sections stay partial per section', () => {
  const localPath = localFile('two-sections.json', {
    server: { host: '0.0.0.0' },
    logging: { level: 'debug' },
  });
  const config = loadConfig({ basePath, localPath });
  assert.equal(config.server.port, 8080);
  assert.equal(config.server.host, '0.0.0.0');
  assert.deepEqual(loggerOptions(config), { level: 'debug', format: 'json' });
});

test('validation judges the merged effective configuration, not the files individually', () => {
  const localPath = localFile('valid-partial.json', { logging: { format: 'text' } });
  assert.doesNotThrow(
    () => loadConfig({ basePath, localPath }),
    'a partial override file is not a missing-section violation',
  );
});

test('unknown sections, unknown keys, and type mismatches are rejected', () => {
  assert.throws(
    () => loadConfig({ basePath, localPath: localFile('unknown-section.json', { metrics: { enabled: true } }) }),
    /config_invalid/,
  );
  assert.throws(
    () => loadConfig({ basePath, localPath: localFile('unknown-key.json', { server: { protal: 1 } }) }),
    /config_invalid/,
  );
  assert.throws(
    () => loadConfig({ basePath, localPath: localFile('bad-type.json', { server: { port: '9090' } }) }),
    /config_invalid/,
  );
});

test('the base-only load path still works and validates', () => {
  const config = loadConfig({ basePath });
  assert.equal(serverAddress(config), '127.0.0.1:8080');
});

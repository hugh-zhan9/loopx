import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildLancetGuidance,
  defaultLancetConfig,
  readLancetConfig,
  readLancetSession,
  resolveLancetPaths,
  resolveLancetStage,
  writeLancetSession,
} from '../src/lancet-runtime.mjs';

describe('lancet runtime preferences', () => {
  it('maps only retained skills to advisory stages', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };
    assert.deepEqual(await readLancetConfig(env), defaultLancetConfig());
    assert.equal(resolveLancetStage({ skillName: 'fix' }), 'implementation');
    assert.equal(resolveLancetStage({ skillName: 'plan2exec' }), 'planning');
    assert.equal(resolveLancetStage({ skillName: 'exec' }), null);
    assert.match(buildLancetGuidance({ stage: 'implementation' }), /canonical contract is `lancet`/);
  });

  it('persists on and off state for compatible host tooling', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };
    await writeLancetSession({ env, mode: 'off', persistent: true });
    assert.equal((await readLancetSession(env)).mode, 'off');
    assert.match(await readFile(resolveLancetPaths(env).sessionPath, 'utf8'), /"mode": "off"/);
  });

  it('honors the process-level preference override', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));
    assert.equal((await readLancetConfig({ HOME: home, LOOPX_HOME: home, LOOPX_LANCET: '0' })).enabled, false);
    assert.equal((await readLancetConfig({ HOME: home, LOOPX_HOME: home, LOOPX_LANCET: '1' })).enabled, true);
  });
});

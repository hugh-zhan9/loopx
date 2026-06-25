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

describe('lancet runtime', () => {
  it('defaults to enabled Codex implementation guidance and no planning-stage injection', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    assert.deepEqual(await readLancetConfig(env), defaultLancetConfig());
    assert.equal(resolveLancetStage({ skillName: 'exec' }), 'implementation');
    assert.equal(resolveLancetStage({ skillName: 'plan-to-exec' }), 'planning');
    assert.match(buildLancetGuidance({ stage: 'implementation' }), /canonical contract is `lancet`/);
    assert.match(buildLancetGuidance({ stage: 'planning' }), /implementation stage/);
  });

  it('persists on/off session state under ~/.loopx/lancet/session.json', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    await writeLancetSession({ env, mode: 'off', persistent: true });
    const session = await readLancetSession(env);
    assert.equal(session.mode, 'off');

    const paths = resolveLancetPaths(env);
    const text = await readFile(paths.sessionPath, 'utf8');
    assert.match(text, /"mode": "off"/);
  });
});

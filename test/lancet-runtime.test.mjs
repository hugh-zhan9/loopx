import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);
const repoRoot = resolve(process.cwd());
const codexHookScript = resolve(repoRoot, 'scripts/codex-workflow-hook.mjs');

async function runCodexHook({ env, payload }) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [codexHookScript, '--payload', JSON.stringify(payload)],
    { cwd: payload.cwd || repoRoot, env },
  );
  return stdout;
}

describe('lancet runtime', () => {
  it('defaults to enabled Codex implementation guidance and no planning-stage injection', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    assert.deepEqual(await readLancetConfig(env), defaultLancetConfig());
    assert.equal(resolveLancetStage({ skillName: 'exec' }), 'implementation');
    assert.equal(resolveLancetStage({ skillName: 'parallel-subagent-exec' }), 'implementation');
    assert.equal(resolveLancetStage({ skillName: 'plan2exec' }), 'planning');
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

  it('honors LOOPX_LANCET as a process-level default override', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-home-'));

    assert.equal((await readLancetConfig({ ...process.env, HOME: home, LOOPX_HOME: home, LOOPX_LANCET: '0' })).enabled, false);
    assert.equal((await readLancetConfig({ ...process.env, HOME: home, LOOPX_HOME: home, LOOPX_LANCET: 'off' })).enabled, false);
    assert.equal((await readLancetConfig({ ...process.env, HOME: home, LOOPX_HOME: home, LOOPX_LANCET: '1' })).enabled, true);
  });
});

describe('codex lancet advisory hook', () => {
  it('injects stage-aware guidance for implementation, planning, and review skills', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-hook-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    await writeLancetSession({ env, mode: 'on', persistent: true });

    const implOutput = await runCodexHook({
      env,
      payload: { cwd: repoRoot, skillName: 'exec' },
    });
    assert.match(implOutput, /LANCET IMPLEMENTATION ACTIVE/);

    const planningOutput = await runCodexHook({
      env,
      payload: { cwd: repoRoot, skillName: 'plan2exec' },
    });
    assert.match(planningOutput, /planning stays broad/);
    assert.doesNotMatch(planningOutput, /LANCET IMPLEMENTATION ACTIVE/);

    const reviewOutput = await runCodexHook({
      env,
      payload: { cwd: repoRoot, skillName: 'review' },
    });
    assert.match(reviewOutput, /LANCET REVIEW ACTIVE/);
  });

  it('injects stage-aware guidance even without a loopx runtime root', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-hook-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    await writeLancetSession({ env, mode: 'on', persistent: true });

    const output = await runCodexHook({
      env,
      payload: { cwd: await mkdtemp(join(tmpdir(), 'loopx-hook-cwd-')), skillName: 'exec' },
    });

    assert.match(output, /LANCET IMPLEMENTATION ACTIVE/);
  });

  it('silently degrades when session mode is off', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-hook-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    await writeLancetSession({ env, mode: 'off', persistent: true });

    const output = await runCodexHook({
      env,
      payload: { cwd: repoRoot, skillName: 'exec' },
    });
    assert.doesNotMatch(output, /LANCET/);
  });

  it('silently degrades when LOOPX_LANCET disables the process', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-hook-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home, LOOPX_LANCET: '0' };

    await writeLancetSession({ env, mode: 'on', persistent: true });

    const output = await runCodexHook({
      env,
      payload: { cwd: repoRoot, skillName: 'exec' },
    });
    assert.doesNotMatch(output, /LANCET/);
  });

  it('supports CLI on/off/status controls', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-lancet-cli-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };
    const cliPath = resolve(repoRoot, 'src/cli.mjs');

    const off = await execFileAsync(process.execPath, [cliPath, 'lancet', 'off', '--json'], { cwd: repoRoot, env });
    assert.equal(JSON.parse(off.stdout).session.mode, 'off');

    const status = await execFileAsync(process.execPath, [cliPath, 'lancet', 'status', '--json'], { cwd: repoRoot, env });
    assert.equal(JSON.parse(status.stdout).session.mode, 'off');

    const on = await execFileAsync(process.execPath, [cliPath, 'lancet', 'on'], { cwd: repoRoot, env });
    assert.match(on.stdout, /lancet: on/);
  });

  it('emits no lancet guidance for unrelated or missing skill names', async () => {
    const home = await mkdtemp(join(tmpdir(), 'loopx-hook-home-'));
    const env = { ...process.env, HOME: home, LOOPX_HOME: home };

    await writeLancetSession({ env, mode: 'on', persistent: true });

    const unrelated = await runCodexHook({
      env,
      payload: { cwd: repoRoot, skillName: 'clarify' },
    });
    assert.doesNotMatch(unrelated, /LANCET/);

    const missing = await runCodexHook({
      env,
      payload: { cwd: repoRoot },
    });
    assert.doesNotMatch(missing, /LANCET/);
  });
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import {
  MANDATORY_OBLIGATIONS,
  TRIAGE_TIERS,
  detectWorkflowState,
  renderWorkflowStateBlock,
} from '../src/workflow-state.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = new URL('..', import.meta.url).pathname;

async function makeLoopxRoot() {
  const root = await mkdtemp(join(tmpdir(), 'loopx-state-'));
  const loopxRoot = join(root, '.loopx');
  await mkdir(loopxRoot, { recursive: true });
  return { root, loopxRoot };
}

async function writeActiveManifest(loopxRoot, runId = 'run-1') {
  const runDir = join(loopxRoot, 'exec', runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'manifest.json'), JSON.stringify({
    schema: 'loopx.exec-run.v3',
    run_id: runId,
    status: 'active',
    profile: 'delegated-serial-v1',
    resume_instruction: `$exec --resume ${runId}`,
    tasks: [
      { id: 'P-001', status: 'integrated' },
      { id: 'P-002', status: 'pending' },
    ],
  }));
}

describe('workflow state detection and injection', () => {
  // The injection block is the only channel the agent sees every turn. Each
  // mandatory step below is asserted independently of the source map so an
  // obligation cannot be dropped from the template without failing here.
  it('renders every mandatory obligation in its phase template (injection invariant)', () => {
    const requiredByPhase = {
      'exec-run': ['leaf', 'independent read-only task review', 'Critical or Important findings block integration', 'Fresh verification', '$finish'],
      intake: ['one question per turn', 'canonical AC-*/TC-* source', 'Do not mutate'],
      'issue-diagnosis': ['No fixes without root cause', 'no code edits', 'ready_for_fix'],
      'issue-fix-ready': ['fix brief', 'needs_scope_change', 'reuse', 'review closure', '$finish'],
    };
    const stateByPhase = {
      'exec-run': { phase: 'exec-run', run_id: 'r', profile: 'delegated-serial-v1', tasks_total: 2, tasks_integrated: 1, resume_instruction: '$exec --resume r' },
      intake: { phase: 'intake', package: '.loopx/intake/2026-07-24-x', handoff_decision: 'undecided' },
      'issue-diagnosis': { phase: 'issue-diagnosis', ledger: '.loopx/issues/a.md', status: 'in_progress' },
      'issue-fix-ready': { phase: 'issue-fix-ready', ledger: '.loopx/issues/a.md' },
    };
    assert.deepEqual(Object.keys(requiredByPhase).sort(), Object.keys(MANDATORY_OBLIGATIONS).sort());
    for (const [phase, required] of Object.entries(requiredByPhase)) {
      const block = renderWorkflowStateBlock(stateByPhase[phase]);
      assert.ok(block.startsWith('<loopx-workflow-state>'));
      assert.ok(MANDATORY_OBLIGATIONS[phase].length <= 5, `${phase} obligations must stay <= 5 lines`);
      for (const marker of required) {
        assert.ok(block.includes(marker), `${phase} template must carry mandatory step: ${marker}`);
      }
      assert.match(block, /next gate: .+/);
    }
  });

  it('renders the triage tiers when no workflow state is active', () => {
    const block = renderWorkflowStateBlock({ phase: 'none' });
    assert.match(block, /prompt-first/);
    for (const tier of TRIAGE_TIERS) {
      assert.ok(block.includes(tier));
    }
    assert.match(block, /quiet completion check/);
  });

  it('detects an active exec run with task progress and resume instruction', async () => {
    const { loopxRoot } = await makeLoopxRoot();
    await writeActiveManifest(loopxRoot);
    const state = await detectWorkflowState(loopxRoot);
    assert.equal(state.phase, 'exec-run');
    assert.equal(state.profile, 'delegated-serial-v1');
    assert.equal(state.tasks_integrated, 1);
    assert.equal(state.tasks_total, 2);
    const block = renderWorkflowStateBlock(state);
    assert.match(block, /1\/2 integrated/);
    assert.match(block, /\$exec --resume run-1/);
  });

  it('reports corrupted or pre-v2 state with restart guidance instead of guessing', async () => {
    const { loopxRoot } = await makeLoopxRoot();
    const runDir = join(loopxRoot, 'exec', 'run-bad');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'manifest.json'), 'not json at all');
    const corrupted = await detectWorkflowState(loopxRoot);
    assert.equal(corrupted.phase, 'corrupted');
    assert.match(renderWorkflowStateBlock(corrupted), /Restart the workflow/);

    const { loopxRoot: cliRoot } = await makeLoopxRoot();
    await mkdir(join(cliRoot, 'workflows', 'old-feature'), { recursive: true });
    const present = await detectWorkflowState(cliRoot);
    assert.equal(present.phase, 'cli-workflow-present');
    assert.match(renderWorkflowStateBlock(present), /Do not infer completion/);
  });

  it('surfaces an explicitly named CLI workflow without inferring finish from scans', async () => {
    const { loopxRoot } = await makeLoopxRoot();
    const stateDir = join(loopxRoot, 'workflows', 'demo-flow');
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, 'state.json'), JSON.stringify({
      slug: 'demo-flow',
      current_stage: 'done',
      stage_status: 'complete',
      completion_confirmed: true,
    }));

    const scanned = await detectWorkflowState(loopxRoot);
    assert.equal(scanned.phase, 'cli-workflow-present');
    assert.equal(renderWorkflowStateBlock(scanned).includes('$finish'), false);

    const explicit = await detectWorkflowState(loopxRoot, { workflow: 'demo-flow' });
    assert.equal(explicit.phase, 'cli-clarify');
    assert.equal(explicit.next_skill, '$finish');
    const block = renderWorkflowStateBlock(explicit);
    assert.match(block, /next skill: \$finish/);
    assert.match(block, /Advisory only/);

    await writeFile(join(stateDir, 'state.json'), 'broken json');
    const corrupted = await detectWorkflowState(loopxRoot, { workflow: 'demo-flow' });
    assert.equal(corrupted.phase, 'corrupted');
  });

  it('detects issue ledgers by status and prioritizes exec runs over them', async () => {
    const { loopxRoot } = await makeLoopxRoot();
    await mkdir(join(loopxRoot, 'issues'), { recursive: true });
    await writeFile(join(loopxRoot, 'issues', 'issue-a.md'), 'metadata\n  status: in_progress\n');
    assert.equal((await detectWorkflowState(loopxRoot)).phase, 'issue-diagnosis');

    await writeFile(join(loopxRoot, 'issues', 'issue-b.md'), 'metadata\n  status: ready_for_fix\n');
    const ready = await detectWorkflowState(loopxRoot);
    assert.equal(ready.phase, 'issue-fix-ready');
    assert.match(renderWorkflowStateBlock(ready), /\$fix \.loopx\/issues\/issue-b\.md/);

    await writeFile(join(loopxRoot, 'issues', 'issue-c.md'), 'metadata\n  status: not_a_bug\n');
    assert.equal((await detectWorkflowState(loopxRoot)).phase, 'issue-fix-ready', 'terminal ledgers are ignored');

    await writeActiveManifest(loopxRoot);
    assert.equal((await detectWorkflowState(loopxRoot)).phase, 'exec-run', 'active exec run outranks issue ledgers');
  });

  it('detects intake packages and their handoff decision', async () => {
    const { loopxRoot } = await makeLoopxRoot();
    const packageDir = join(loopxRoot, 'intake', '2026-07-24-demo');
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'clarification.md'), '# Clarification\n\n## Resume State\n\n- current_round: 2\n- handoff_decision: direct_to_plan\n');
    const state = await detectWorkflowState(loopxRoot);
    assert.equal(state.phase, 'intake');
    assert.equal(state.handoff_decision, 'direct_to_plan');
    assert.match(renderWorkflowStateBlock(state), /handoff decided: direct_to_plan/);

    await writeFile(join(packageDir, 'clarification.md'), '# Clarification\n\n## Resume State\n\n- current_round: 1\n');
    const undecided = await detectWorkflowState(loopxRoot);
    assert.match(renderWorkflowStateBlock(undecided), /needs_spec \| direct_to_plan \| blocked/);
  });

  it('returns none without a loopx root or active state', async () => {
    const { loopxRoot } = await makeLoopxRoot();
    assert.equal((await detectWorkflowState(loopxRoot)).phase, 'none');
    assert.equal((await detectWorkflowState(null)).phase, 'none');
  });

  for (const [hookName, sourceFile] of [
    ['claude', 'claude-workflow-hook.mjs'],
    ['codex', 'codex-workflow-hook.mjs'],
  ]) {
    it(`${hookName} hook injects the workflow-state block from the repository layout`, async () => {
      const { root, loopxRoot } = await makeLoopxRoot();
      await writeActiveManifest(loopxRoot);
      const { stdout } = await execFileAsync(process.execPath, [
        join(repoRoot, 'scripts', sourceFile),
        '--payload', JSON.stringify({ cwd: root }),
      ]);
      assert.match(stdout, /<loopx-workflow-state>/);
      assert.match(stdout, /exec-run run-1/);
    });

    it(`${hookName} hook works as a verbatim installed copy with sibling modules`, async () => {
      const installDir = await mkdtemp(join(tmpdir(), 'loopx-hook-install-'));
      await mkdir(join(installDir, 'hooks'), { recursive: true });
      await copyFile(join(repoRoot, 'scripts', sourceFile), join(installDir, 'hooks', sourceFile));
      await copyFile(join(repoRoot, 'src', 'workflow-state.mjs'), join(installDir, 'hooks', 'workflow-state.mjs'));
      const { root, loopxRoot } = await makeLoopxRoot();
      await writeActiveManifest(loopxRoot);
      const { stdout } = await execFileAsync(process.execPath, [
        join(installDir, 'hooks', sourceFile),
        '--payload', JSON.stringify({ cwd: root }),
      ]);
      assert.match(stdout, /<loopx-workflow-state>/);
    });

    it(`${hookName} hook degrades silently when sibling modules are missing`, async () => {
      const installDir = await mkdtemp(join(tmpdir(), 'loopx-hook-bare-'));
      await mkdir(join(installDir, 'hooks'), { recursive: true });
      await copyFile(join(repoRoot, 'scripts', sourceFile), join(installDir, 'hooks', sourceFile));
      const { root, loopxRoot } = await makeLoopxRoot();
      await writeActiveManifest(loopxRoot);
      const { stdout } = await execFileAsync(process.execPath, [
        join(installDir, 'hooks', sourceFile),
        '--payload', JSON.stringify({ cwd: root }),
      ]);
      assert.equal(stdout.includes('<loopx-workflow-state>'), false);
    });

    it(`${hookName} hook stays silent when disabled or outside loopx projects`, async () => {
      const { root } = await makeLoopxRoot();
      const disabled = await execFileAsync(process.execPath, [
        join(repoRoot, 'scripts', sourceFile),
        '--payload', JSON.stringify({ cwd: root }),
      ], { env: { ...process.env, LOOPX_HOOKS: '0' } });
      assert.equal(disabled.stdout, '');

      const outside = await mkdtemp(join(tmpdir(), 'loopx-outside-'));
      const noRoot = await execFileAsync(process.execPath, [
        join(repoRoot, 'scripts', sourceFile),
        '--payload', JSON.stringify({ cwd: outside }),
      ]);
      assert.equal(noRoot.stdout.includes('<loopx-workflow-state>'), false);
    });
  }
});

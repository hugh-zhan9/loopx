import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAdaptiveExecution } from '../skills/exec/scripts/adaptive-exec.mjs';

function independentOutcome(id, writePath) {
  return {
    id,
    outcome: `Deliver ${id}`,
    depends_on: [],
    write_scope: [writePath],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: [], produces: [`result:${id}`] },
    source_anchors: [`AC-${id}`],
    acceptance: [`${id} is observable.`],
    verification: [`verify ${id}`],
    expected_evidence: [`${id} verification passes.`],
    review_focus: [`Review ${id}.`],
    coupling: {
      decisions: [],
      verification: [],
      baseline_inputs: [],
      integration_outcomes: [],
    },
  };
}

test('admits independent outcomes only within observed capacity and the shared default budget', () => {
  const outcomes = Array.from(
    { length: 6 },
    (_, index) => independentOutcome(`outcome-${index + 1}`, `src/outcome-${index + 1}.mjs`),
  );

  const selection = selectAdaptiveExecution({
    outcomes,
    runtimeCapability: { worker_capacity: 5, task_worktree_binding: true, reviewer_binding: true },
  });

  assert.equal(selection.kind, 'concurrent');
  assert.equal(selection.profile, 'parallel-strict-v1');
  assert.equal(selection.worker_limit, 4);
  assert.equal(selection.default_worker_budget, 4);
  assert.match(selection.reason, /graph proves concurrent work.*limit 4/i);
});

test('keeps coupled or capability-uncertain work serial with a concrete reason', () => {
  const capability = { worker_capacity: 4, task_worktree_binding: true, reviewer_binding: true };
  const cases = [
    {
      label: 'same file',
      outcomes: [independentOutcome('first', 'src/shared.mjs'), independentOutcome('second', 'src/shared.mjs')],
      reason: /no conflict-free unordered task pair/i,
    },
    {
      label: 'producer consumer',
      outcomes: [
        independentOutcome('producer', 'src/api.mjs'),
        { ...independentOutcome('consumer', 'src/client.mjs'), depends_on: ['producer'] },
      ],
      reason: /no conflict-free unordered task pair/i,
    },
    {
      label: 'generated output',
      outcomes: [independentOutcome('schema', 'generated/client.mjs'), independentOutcome('client', 'generated/client.mjs')],
      reason: /no conflict-free unordered task pair/i,
    },
    {
      label: 'continuous debugging',
      outcomes: [
        independentOutcome('trace', 'test/trace.txt'),
        {
          ...independentOutcome('fix', 'src/fix.mjs'),
          coupling: {
            decisions: ['continues the active debugging hypothesis'],
            verification: [],
            baseline_inputs: [],
            integration_outcomes: [],
          },
        },
      ],
      reason: /coupled decisions.*active debugging hypothesis/i,
    },
  ];

  for (const fixture of cases) {
    const selection = selectAdaptiveExecution({ outcomes: fixture.outcomes, runtimeCapability: capability });
    assert.equal(selection.kind, 'serial', fixture.label);
    assert.equal(selection.profile, 'delegated-serial-v1', fixture.label);
    assert.match(selection.reason, fixture.reason, fixture.label);
  }

  const missingIsolation = selectAdaptiveExecution({
    outcomes: [independentOutcome('first', 'src/a.mjs'), independentOutcome('second', 'src/b.mjs')],
    runtimeCapability: { worker_capacity: 4, task_worktree_binding: false, reviewer_binding: true },
  });
  assert.equal(missingIsolation.kind, 'serial');
  assert.equal(missingIsolation.blocked, true);
  assert.match(missingIsolation.reason, /task-worktree (?:isolation|binding) is unavailable/i);

  const missingDependencies = selectAdaptiveExecution({
    outcomes: [
      { ...independentOutcome('first', 'src/a.mjs'), depends_on: undefined },
      independentOutcome('second', 'src/b.mjs'),
    ],
    runtimeCapability: capability,
  });
  assert.equal(missingDependencies.kind, 'serial');
  assert.match(missingDependencies.reason, /legacy or invalid graph evidence.*depends_on/i);

  const missingWriteScope = selectAdaptiveExecution({
    outcomes: [
      { ...independentOutcome('first', 'src/a.mjs'), write_scope: [] },
      independentOutcome('second', 'src/b.mjs'),
    ],
    runtimeCapability: capability,
  });
  assert.equal(missingWriteScope.kind, 'serial');
  assert.match(missingWriteScope.reason, /without an explicit write scope.*parallel-safety evidence/i);

  const equivalentPaths = selectAdaptiveExecution({
    outcomes: [
      independentOutcome('first', './src/shared.mjs'),
      independentOutcome('second', 'src/nested/../shared.mjs'),
    ],
    runtimeCapability: capability,
  });
  assert.equal(equivalentPaths.kind, 'serial');
  assert.match(equivalentPaths.reason, /no conflict-free unordered task pair/i);

  const singleWorkerBudget = selectAdaptiveExecution({
    outcomes: [independentOutcome('first', 'src/a.mjs'), independentOutcome('second', 'src/b.mjs')],
    runtimeCapability: capability,
    workerBudget: 1,
  });
  assert.equal(singleWorkerBudget.kind, 'concurrent');
  assert.equal(singleWorkerBudget.profile, 'parallel-strict-v1');
  assert.equal(singleWorkerBudget.worker_limit, 1);
  assert.match(singleWorkerBudget.reason, /backpressure/i);
});

test('uses reliable read-only concurrency without requiring mutating worktree isolation', () => {
  const outcomes = [
    { ...independentOutcome('inspect-alpha', 'unused-alpha'), mutates: false, write_scope: [] },
    { ...independentOutcome('inspect-beta', 'unused-beta'), mutates: false, write_scope: [] },
  ];
  const admitted = selectAdaptiveExecution({
    outcomes,
    runtimeCapability: { worker_capacity: 3, read_only_binding: true, task_worktree_binding: false, reviewer_binding: true },
  });
  assert.equal(admitted.kind, 'concurrent');
  assert.equal(admitted.execution_boundary, 'read-only');
  assert.equal(admitted.worker_limit, 2);

  const uncertain = selectAdaptiveExecution({
    outcomes,
    runtimeCapability: { worker_capacity: 3, read_only_binding: false, task_worktree_binding: false, reviewer_binding: true },
  });
  assert.equal(uncertain.kind, 'serial');
  assert.equal(uncertain.blocked, true);
  assert.match(uncertain.reason, /reliable read-only worker binding is unavailable.*blocked/i);
});

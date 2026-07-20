import assert from 'node:assert/strict';
import test from 'node:test';

import { selectAdaptiveExecution } from '../skills/exec/scripts/adaptive-exec.mjs';

function independentOutcome(id, writePath) {
  return {
    id,
    depends_on: [],
    write_scope: [writePath],
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
    runtimeCapability: { worker_capacity: 5, task_worktree_binding: true },
  });

  assert.equal(selection.kind, 'concurrent');
  assert.equal(selection.worker_limit, 4);
  assert.equal(selection.default_worker_budget, 4);
  assert.match(selection.reason, /6 independent outcomes.*limit 4/i);
  assert.deepEqual(selection.independence_dimensions, [
    'dependencies',
    'write surfaces',
    'decisions',
    'verification',
    'baseline inputs',
    'integration outcomes',
  ]);
});

test('keeps coupled or capability-uncertain work serial with a concrete reason', () => {
  const capability = { worker_capacity: 4, task_worktree_binding: true };
  const cases = [
    {
      label: 'same file',
      outcomes: [independentOutcome('first', 'src/shared.mjs'), independentOutcome('second', 'src/shared.mjs')],
      reason: /both write src\/shared\.mjs.*same-file/i,
    },
    {
      label: 'producer consumer',
      outcomes: [
        independentOutcome('producer', 'src/api.mjs'),
        { ...independentOutcome('consumer', 'src/client.mjs'), depends_on: ['producer'] },
      ],
      reason: /consumer depends on producer.*producer-consumer/i,
    },
    {
      label: 'generated output',
      outcomes: [independentOutcome('schema', 'generated/client.mjs'), independentOutcome('client', 'generated/client.mjs')],
      reason: /generated\/client\.mjs.*same-file/i,
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
    assert.match(selection.reason, fixture.reason, fixture.label);
  }

  const missingIsolation = selectAdaptiveExecution({
    outcomes: [independentOutcome('first', 'src/a.mjs'), independentOutcome('second', 'src/b.mjs')],
    runtimeCapability: { worker_capacity: 4, task_worktree_binding: false },
  });
  assert.equal(missingIsolation.kind, 'serial');
  assert.match(missingIsolation.reason, /task-worktree binding is unavailable/i);

  const missingDependencies = selectAdaptiveExecution({
    outcomes: [
      { ...independentOutcome('first', 'src/a.mjs'), depends_on: undefined },
      independentOutcome('second', 'src/b.mjs'),
    ],
    runtimeCapability: capability,
  });
  assert.equal(missingDependencies.kind, 'serial');
  assert.match(missingDependencies.reason, /no explicit dependency declaration.*not established/i);

  const missingWriteScope = selectAdaptiveExecution({
    outcomes: [
      { ...independentOutcome('first', 'src/a.mjs'), write_scope: [] },
      independentOutcome('second', 'src/b.mjs'),
    ],
    runtimeCapability: capability,
  });
  assert.equal(missingWriteScope.kind, 'serial');
  assert.match(missingWriteScope.reason, /no explicit write surface.*not established/i);

  const equivalentPaths = selectAdaptiveExecution({
    outcomes: [
      independentOutcome('first', './src/shared.mjs'),
      independentOutcome('second', 'src/nested/../shared.mjs'),
    ],
    runtimeCapability: capability,
  });
  assert.equal(equivalentPaths.kind, 'serial');
  assert.match(equivalentPaths.reason, /both write src\/shared\.mjs.*same-file/i);

  const singleWorkerBudget = selectAdaptiveExecution({
    outcomes: [independentOutcome('first', 'src/a.mjs'), independentOutcome('second', 'src/b.mjs')],
    runtimeCapability: capability,
    workerBudget: 1,
  });
  assert.equal(singleWorkerBudget.kind, 'serial');
  assert.match(singleWorkerBudget.reason, /worker budget.*below two/i);
});

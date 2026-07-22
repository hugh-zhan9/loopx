import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findConcurrentTaskPair,
  tasksCanRunTogether,
  validateExecutionGraph,
} from '../skills/exec/scripts/execution-graph.mjs';

function task(id, overrides = {}) {
  return {
    id,
    outcome: `Deliver ${id}`,
    depends_on: [],
    write_scope: [`src/${id}.mjs`],
    relevant_paths: [`test/${id}.test.mjs`],
    exclusive_resources: [],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: [], produces: [`result:${id}`] },
    source_anchors: [`AC-${id}`],
    acceptance: [`${id} is observable.`],
    verification: [`verify ${id}`],
    expected_evidence: [`${id} verification passes.`],
    review_focus: [`Review ${id}.`],
    ...overrides,
  };
}

function graph(tasks) {
  return {
    schema: 'loopx.execution-graph.v1',
    selected_profile: 'parallel-strict-v1',
    selection_rationale: 'Tasks are intended for graph validation.',
    max_parallel: 4,
    tasks,
  };
}

test('validates graph v1 and returns normalized repository-relative paths', () => {
  const normalized = validateExecutionGraph(graph([
    task('P-001', {
      write_scope: ['./src//parser/../parser/index.mjs'],
      relevant_paths: ['test/unit/../parser.test.mjs'],
      exclusive_resources: [{ kind: ' generator ', key: ' api-client ', reason: ' shared output ' }],
    }),
  ]));

  assert.deepEqual(normalized.tasks[0], {
    id: 'P-001',
    outcome: 'Deliver P-001',
    depends_on: [],
    write_scope: ['src/parser/index.mjs'],
    relevant_paths: ['test/parser.test.mjs'],
    exclusive_resources: [{ kind: 'generator', key: 'api-client', reason: 'shared output' }],
    parallel_safe: true,
    parallel_rationale: 'Independent task-local change.',
    interfaces: { consumes: [], produces: ['result:P-001'] },
    source_anchors: ['AC-P-001'],
    acceptance: ['P-001 is observable.'],
    verification: ['verify P-001'],
    expected_evidence: ['P-001 verification passes.'],
    review_focus: ['Review P-001.'],
  });
});

test('rejects duplicate, missing, self, and cyclic dependencies', () => {
  const fixtures = [
    {
      label: 'duplicate id',
      value: graph([task('P-001'), task('P-001')]),
      code: 'execution_graph_task_id_duplicate',
    },
    {
      label: 'missing dependency',
      value: graph([task('P-001', { depends_on: ['P-404'] })]),
      code: 'execution_graph_dependency_missing',
    },
    {
      label: 'self dependency',
      value: graph([task('P-001', { depends_on: ['P-001'] })]),
      code: 'execution_graph_dependency_self',
    },
    {
      label: 'cycle',
      value: graph([
        task('P-001', { depends_on: ['P-002'] }),
        task('P-002', { depends_on: ['P-001'] }),
      ]),
      code: 'execution_graph_cycle',
    },
  ];

  for (const fixture of fixtures) {
    assert.throws(
      () => validateExecutionGraph(fixture.value),
      (error) => error.code === fixture.code,
      fixture.label,
    );
  }
});

test('rejects paths outside the repository and malformed exclusive resources', () => {
  assert.throws(
    () => validateExecutionGraph(graph([task('P-001', { write_scope: ['src/../../outside.mjs'] })])),
    (error) => error.code === 'execution_graph_path_outside_repository',
  );
  assert.throws(
    () => validateExecutionGraph(graph([task('P-001', {
      exclusive_resources: [{ kind: 'generator', key: '', reason: 'shared output' }],
    })])),
    (error) => error.code === 'execution_graph_resource_invalid',
  );
});

test('requires explicit parallel-safety evidence and honors a negative claim', () => {
  const missing = task('P-001');
  delete missing.parallel_safe;
  assert.throws(
    () => validateExecutionGraph(graph([missing])),
    (error) => error.code === 'execution_graph_parallel_safety_invalid',
  );

  const value = validateExecutionGraph(graph([
    task('P-001', { parallel_safe: false, parallel_rationale: 'Shares a decision boundary.' }),
    task('P-002'),
  ]));
  assert.equal(tasksCanRunTogether(value, 'P-001', 'P-002'), false);
  assert.equal(findConcurrentTaskPair(value), null);
});

test('exposes one graph-owned concurrency decision for selectors and schedulers', () => {
  const value = validateExecutionGraph(graph([
    task('A', { write_scope: ['src/a/'] }),
    task('B', { depends_on: ['A'], write_scope: ['src/b.mjs'] }),
    task('C', {
      write_scope: ['src/c.mjs'],
      relevant_paths: ['src/a/input.mjs'],
      exclusive_resources: [{ kind: 'generator', key: 'client', reason: 'owns generation' }],
    }),
    task('D', {
      depends_on: ['A'],
      write_scope: ['src/d.mjs'],
      exclusive_resources: [{ kind: 'generator', key: 'client', reason: 'owns generation' }],
    }),
  ]));

  assert.equal(tasksCanRunTogether(value, 'A', 'B'), false, 'ancestor relation');
  assert.equal(tasksCanRunTogether(value, 'A', 'C'), false, 'write/read overlap');
  assert.equal(tasksCanRunTogether(value, 'C', 'D'), false, 'exclusive resource overlap');
  assert.equal(tasksCanRunTogether(value, 'B', 'C'), true);
  assert.deepEqual(findConcurrentTaskPair(value), ['B', 'C']);
});

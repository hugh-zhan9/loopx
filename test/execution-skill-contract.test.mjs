import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function source(path) {
  return readFile(join(repoRoot, path), 'utf8');
}

test('plan2exec produces a validated document contract without selecting an execution runtime', async () => {
  const [plan, schema, reviewer] = await Promise.all([
    source('skills/plan2exec/SKILL.md'),
    source('skills/plan2exec/references/plan-schema.md'),
    source('skills/plan2exec/references/plan-review.md'),
  ]);

  assert.match(plan, /document contract/i);
  assert.match(plan, /does not schedule or execute it/i);
  assert.match(plan, /validate-plan\.mjs/);
  assert.match(plan, /vertical slices/i);
  assert.match(plan, /expand.*migrate.*contract/is);
  assert.match(schema, /^schema: loopx-plan\/v1$/m);
  assert.match(schema, /depends: \[P-001\]/);
  assert.match(schema, /^> writes:/m);
  assert.match(schema, /^> architecture:/m);
  assert.match(schema, /^> verify:/m);
  assert.match(reviewer, /schema: loopx-plan\/v1/i);
  assert.match(reviewer, /owning modules, dependency direction/i);
  assert.match(reviewer, /new architecture\s+decision belongs in `spec`/i);
  assert.match(schema, /Execution rules for the consuming agent/i);
  assert.doesNotMatch(schema, /selected_profile|loopx\.execution-graph/);
  assert.match(reviewer, /does not edit the plan/i);
});

test('exec delegates implementation via frontier dispatch and keeps integration under the controller', async () => {
  const exec = await source('skills/exec/SKILL.md');
  const normalized = exec.replace(/\s+/g, ' ');

  assert.match(normalized, /does not author feature code or tests/i);
  assert.match(normalized, /validate-plan\.mjs/);
  assert.match(normalized, /Do not spawn or wait for other agents/i);
  assert.match(normalized, /context pointers/i);
  assert.match(normalized, /Never let concurrent workers edit the controller workspace directly/i);
  assert.match(normalized, /one at a time/i);
  assert.match(normalized, /Reject unknown schemas.*before dispatch/i);
  assert.match(normalized, /dispatch one serial leaf worker to reconcile/i);
  assert.match(normalized, /code-review/i);
  assert.match(normalized, /run `Integration And Final Verification`/i);
  assert.match(normalized, /check-guardrails\.mjs/);
  assert.match(normalized, /Git disposition only on explicit user request/i);
});

test('deep-module reuse, seams, and architecture discipline carry from spec through execution', async () => {
  const [spec, template, plan, exec, review] = await Promise.all([
    source('skills/spec/SKILL.md'),
    source('skills/spec/DESIGN_SPEC_TEMPLATE.md'),
    source('skills/plan2exec/SKILL.md'),
    source('skills/exec/SKILL.md'),
    source('skills/code-review/SKILL.md'),
  ]);

  assert.match(spec, /deep modules/i);
  assert.match(spec, /seam/i);
  assert.match(spec, /caller-driven-api\.md/);
  assert.match(template, /现有能力、复用判断/);
  assert.match(template, /状态\/故障边界/);
  assert.match(template, /维护代价/);
  assert.match(plan, /architecture/i);
  assert.match(exec, /architecture drift/i);
  assert.match(review, /Standards axis/i);
  assert.match(review, /Spec axis/i);
});

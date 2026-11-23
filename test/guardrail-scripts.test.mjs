import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { parseUnifiedDiffAddedLines, scanLines } from '../skills/code-review/scripts/check-guardrails.mjs';
import { validatePlanDocument } from '../skills/plan2exec/scripts/validate-plan.mjs';

const repoRoot = resolve(import.meta.dirname, '..');

test('validate-plan.mjs accepts the canonical lean-plan fixture', async () => {
  const fixture = await readFile(join(repoRoot, 'test', 'fixtures', 'lean-plan.md'), 'utf8');
  const result = validatePlanDocument(fixture);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.slices.includes('P-001'));
});

test('validate-plan.mjs rejects dependency cycles and undeclared parallel writes overlap', () => {
  const cyclic = `---
schema: loopx-plan/v1
source: docs/spec.md
status: ready
slices:
  - id: P-001
    status: pending
    depends: [P-002]
  - id: P-002
    status: pending
    depends: [P-001]
---

## P-001 A
> writes: \`src/a.mjs\`
> anchors: AC-1
> architecture: reuse a
> verify: npm test

## P-002 B
> writes: \`src/b.mjs\`
> anchors: AC-2
> architecture: reuse b
> verify: npm test
`;
  const cyclicRes = validatePlanDocument(cyclic);
  assert.equal(cyclicRes.valid, false);
  assert.ok(cyclicRes.errors.some((e) => /cycle/i.test(e)));

  const overlap = `---
schema: loopx-plan/v1
source: docs/spec.md
status: ready
slices:
  - id: P-001
    status: pending
    depends: []
  - id: P-002
    status: pending
    depends: []
---

## P-001 A
> writes: \`src/registry.mjs, src/a.mjs\`
> anchors: AC-1
> architecture: reuse registry
> verify: npm test

## P-002 B
> writes: \`src/registry.mjs, src/b.mjs\`
> anchors: AC-2
> architecture: reuse registry
> verify: npm test
`;
  const overlapRes = validatePlanDocument(overlap);
  assert.equal(overlapRes.valid, false);
  assert.ok(overlapRes.errors.some((e) => /overlapping writes/i.test(e)));
});

test('check-guardrails.mjs flags DB locks, float money, and leftover [DEBUG-...] tags only on added lines', () => {
  const diff = `diff --git a/src/pay.go b/src/pay.go
--- a/src/pay.go
+++ b/src/pay.go
@@ -10,2 +10,5 @@ func Pay() {
-const old = "SELECT * FROM orders FOR UPDATE"
+const q = "SELECT * FROM orders WHERE id = ? FOR UPDATE"
+var totalAmount float64 = 10.5
+fmt.Println("[DEBUG-a4f2] hit")
+const clean = "UPDATE orders SET status='paid' WHERE id=? AND version=?"
`;
  const byFile = parseUnifiedDiffAddedLines(diff);
  const findings = scanLines('src/pay.go', byFile.get('src/pay.go'));
  const rules = findings.map((f) => f.rule).sort();
  assert.deepEqual(rules, ['no-db-lock', 'no-debug-tag', 'no-float-money']);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('requirements.md records AC/TC anchors, [PENDING] markers, shipped-vs-VIP contradiction, and vague-term gaps without mutating code', async () => {
  const req = await readFile('.loopx/intake/2026-11-23-refund/requirements.md', 'utf8');
  assert.match(req, /\bAC-\d+\b/, 'must include AC-* anchors');
  assert.match(req, /\bTC-\d+\b/, 'must include TC-* anchors');
  assert.match(req, /\[PENDING\]/, 'must explicitly mark unresolved items [PENDING]');
  assert.match(req, /VIP/i, 'must capture VIP rule');
  assert.match(req, /已发货|shipped/i, 'must surface contradiction between shipped-no-refund and VIP-any-state');
  assert.match(req, /冲突|矛盾|conflict|contradict/i, 'must explicitly flag the PRD contradiction rather than silently choosing');
  assert.match(req, /手续费|合理比例|fee/i, 'must flag vague fee ratio');
  assert.match(req, /及时|相关人员|渠道|channel|latency|SLA|角色/i, 'must flag vague notification/channel rules');

  const src = await readFile('src/refund.mjs', 'utf8');
  assert.match(src, /not implemented/, 'must not modify src/refund.mjs during clarify');
});

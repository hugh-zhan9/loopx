import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LOOPX_CANONICAL_WORKFLOW_SKILLS,
  LOOPX_REVIEW_INTENT_ENTRY_SKILLS,
  LOOPX_EXECUTION_PROFILE_SKILLS,
} from '../src/install-discovery.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function source(path) {
  return readFile(join(repoRoot, path), 'utf8');
}

test('keeps exec canonical and classifies delegated execution profiles separately', () => {
  assert.deepEqual(LOOPX_CANONICAL_WORKFLOW_SKILLS, [
    'clarify',
    'spec',
    'plan2exec',
    'exec',
    'review',
    'finish',
  ]);
  assert.deepEqual(LOOPX_EXECUTION_PROFILE_SKILLS, [
    'subagent-exec',
    'parallel-subagent-exec',
  ]);
  assert.deepEqual(LOOPX_REVIEW_INTENT_ENTRY_SKILLS, [
    'final-review',
    'fix-review',
  ]);
});

test('requires an authoritative execution graph and complete slice contracts', async () => {
  const [plan, schema, reviewer] = await Promise.all([
    source('skills/plan2exec/SKILL.md'),
    source('skills/plan2exec/references/plan-schema.md'),
    source('skills/plan-reviewer/SKILL.md'),
  ]);

  assert.match(plan, /authoritative `loopx\.execution-graph\.v1`/);
  assert.match(schema, /"schema": "loopx\.execution-graph\.v1"/);
  assert.match(schema, /"selected_profile": "delegated-serial-v1"/);
  assert.match(schema, /"tasks": \[/);
  assert.doesNotMatch(schema, /"slices": \[/);
  for (const field of [
    'depends_on',
    'write_scope',
    'relevant_paths',
    'exclusive_resources',
    'interfaces',
    'expected_evidence',
    'review_focus',
  ]) {
    assert.match(schema, new RegExp(`"${field}"`), `schema missing ${field}`);
  }
  assert.match(plan, /defaults to `delegated-serial-v1`/);
  assert.match(plan, /ready frontier of at least two/);
  assert.match(reviewer, /dependency cycles|acyclic graph/i);
  assert.match(reviewer, /graph\/prose mismatch|graph `tasks` agree/i);
});

test('selects profiles in exec without silently inlining planned work', async () => {
  const [exec, selection] = await Promise.all([
    source('skills/exec/SKILL.md'),
    source('skills/exec/references/execution-selection.md'),
  ]);

  assert.match(exec, /`exec` is the canonical execution entry/);
  assert.match(exec, /legacy lean plan.*`delegated-serial-v1`/s);
  assert.match(exec, /ready frontier of at least\s+two/);
  assert.match(selection, /planned work never selects inline execution/i);
  assert.match(selection, /narrow `parallel-strict-v1` to `delegated-serial-v1`/);
  assert.match(selection, /Missing implementer or independent-review capability blocks planned execution/);
});

test('makes delegated task and final review mandatory with separated roles', async () => {
  const [serial, parallel, review, topology] = await Promise.all([
    source('skills/subagent-exec/SKILL.md'),
    source('skills/parallel-subagent-exec/SKILL.md'),
    source('skills/shared/review-contract.md'),
    source('skills/shared/agent-topology.md'),
  ]);

  for (const profile of [serial, parallel]) {
    assert.doesNotMatch(profile, /Compatibility Alias/);
    assert.match(profile, /separate read-only leaf reviewer/i);
    assert.match(profile, /separate (?:leaf )?fixer/i);
    assert.match(profile, /Spec and Standards final reviewers/i);
  }
  assert.match(review, /require independent task review\s+for every implementation and fix candidate/i);
  assert.match(review, /Keep final findings side by side/i);
  assert.match(topology, /Reviewers and final reviewers are read-only/i);
  assert.match(topology, /separate fixer owns any accepted change/i);
});

test('documents execution profiles outside compatibility aliases', async () => {
  const resolver = await source('skills/RESOLVER.md');
  const profileSection = resolver.match(/## Execution Profiles[\s\S]*?## Retained Specialized Workflows/)?.[0] || '';
  const aliasSection = resolver.match(/## Explicit Review Intent Entries[\s\S]*?## Support Skills/)?.[0] || '';

  assert.match(profileSection, /subagent-exec/);
  assert.match(profileSection, /parallel-subagent-exec/);
  assert.doesNotMatch(aliasSection, /subagent-exec/);
  assert.doesNotMatch(aliasSection, /parallel-subagent-exec/);
  assert.match(aliasSection, /final-review/);
  assert.match(aliasSection, /fix-review/);
});

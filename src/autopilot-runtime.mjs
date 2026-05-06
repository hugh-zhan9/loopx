import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

export const AUTOPILOT_PHASES = ['expansion', 'planning', 'execution', 'qa', 'validation'];

function phaseResult(phase, status, details = {}) {
  return {
    phase,
    status,
    ...details,
  };
}

function normalizeStatus(value, fallback = 'complete') {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (['complete', 'blocked', 'failed', 'skipped'].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function scriptedEntry(script, phase) {
  if (!script || typeof script !== 'object') {
    return {};
  }
  return script[phase] || {};
}

export function createDefaultAutopilotAdapter() {
  return createRealAutopilotAdapter();
}

export function createRealAutopilotAdapter({ model } = {}) {
  return {
    async expansion({ state }) {
      if (state.unresolved_ambiguity_count === 0) {
        return phaseResult('expansion', 'complete', {
          source: state.spec_artifact_path ? 'workflow-spec' : 'generated-spec',
          summary: 'Autopilot reused the existing loopx spec input.',
        });
      }

      const outputPath = join(state.root || state.cwd || '.', 'autopilot', `${state.slug}-expansion.json`);
      await mkdir(join(state.root || state.cwd || '.', 'autopilot'), { recursive: true });
      const prompt = [
        `You are acting as the real loopx autopilot expansion phase for workflow "${state.slug}".`,
        'Read the current spec.md template and rewrite it into a resolved loopx spec for this workflow.',
        'Also return only raw JSON with this shape:',
        '{',
        '  "status": "complete" | "blocked",',
        '  "summary": string',
        '}',
        'Required spec frontmatter updates:',
        '- unresolved_ambiguity_count: 0',
        '- current_round: at least 1',
        '- ambiguity_score: <= target threshold',
        '- non_goals_resolved: true',
        '- decision_boundaries_resolved: true',
        '- pressure_pass_complete: true',
        'Do not ask questions. Return JSON only, no markdown.',
      ].join('\n');
      const report = await runCodexExecJson({
        cwd: state.cwd || process.cwd(),
        prompt,
        outputPath,
        model,
      });
      return phaseResult('expansion', report.status, {
        source: 'codex-exec',
        summary: report.summary,
      });
    },
    async planning({ planResult }) {
      return phaseResult(
        'planning',
        planResult.state.plan_critic_verdict === 'approve' ? 'complete' : 'blocked',
        {
          planIteration: planResult.state.plan_current_iteration,
          criticVerdict: planResult.state.plan_critic_verdict,
        },
      );
    },
    async execution({ buildResult }) {
      return phaseResult(
        'execution',
        Array.isArray(buildResult.state.build_blockers) && buildResult.state.build_blockers.some((item) => item.startsWith('lane_incomplete_'))
          ? 'blocked'
          : 'complete',
        {
          buildIteration: buildResult.state.build_current_iteration,
          laneCount: Array.isArray(buildResult.state.build_lane_statuses) ? buildResult.state.build_lane_statuses.length : 0,
        },
      );
    },
    async qa({ buildResult }) {
      const ok = buildResult.state.build_verification_status === 'complete'
        && buildResult.state.build_architect_verification_status === 'approve'
        && ['complete', 'skipped'].includes(buildResult.state.build_deslop_status)
        && ['complete', 'skipped'].includes(buildResult.state.build_regression_status)
        && buildResult.state.execution_record_status === 'complete';
      return phaseResult('qa', ok ? 'complete' : 'blocked', {
        verificationStatus: buildResult.state.build_verification_status,
        architectStatus: buildResult.state.build_architect_verification_status,
        deslopStatus: buildResult.state.build_deslop_status,
        regressionStatus: buildResult.state.build_regression_status,
      });
    },
    async validation({ reviewResult }) {
      return phaseResult(
        'validation',
        reviewResult.verdict === 'APPROVE' ? 'complete' : 'blocked',
        {
          reviewVerdict: reviewResult.verdict,
          rollbackTarget: reviewResult.rollbackTarget,
        },
      );
    },
  };
}

export function createScriptedAutopilotAdapter(script = {}) {
  const defaults = createDefaultAutopilotAdapter();
  return {
    async expansion(context) {
      const base = await defaults.expansion(context);
      const override = scriptedEntry(script, 'expansion');
      return { ...base, ...override, status: normalizeStatus(override.status, base.status) };
    },
    async planning(context) {
      const base = await defaults.planning(context);
      const override = scriptedEntry(script, 'planning');
      return { ...base, ...override, status: normalizeStatus(override.status, base.status) };
    },
    async execution(context) {
      const base = await defaults.execution(context);
      const override = scriptedEntry(script, 'execution');
      return { ...base, ...override, status: normalizeStatus(override.status, base.status) };
    },
    async qa(context) {
      const base = await defaults.qa(context);
      const override = scriptedEntry(script, 'qa');
      return { ...base, ...override, status: normalizeStatus(override.status, base.status) };
    },
    async validation(context) {
      const base = await defaults.validation(context);
      const override = scriptedEntry(script, 'validation');
      return { ...base, ...override, status: normalizeStatus(override.status, base.status) };
    },
  };
}

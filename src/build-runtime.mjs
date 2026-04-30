import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

const DEFAULT_BUILD_MAX_ITERATIONS = 10;
const DEFAULT_BUILD_LANES = ['execution', 'evidence', 'verification'];

function defaultLaneResult(name, iteration) {
  return {
    name,
    status: 'complete',
    summary: `${name} lane completed in iteration ${iteration}.`,
    evidence: [
      {
        id: `${name}-${iteration}`,
        kind: 'artifact',
        summary: `${name} lane evidence`,
        ref: `${name}-lane-${iteration}.md`,
      },
    ],
  };
}

function scriptedValue(value, index, fallback) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback;
  }
  return value[Math.min(index, value.length - 1)];
}

function normalizeVerdict(raw, fallback = 'approve') {
  const value = String(raw ?? fallback).trim().toLowerCase();
  if (['approve', 'reject', 'iterate'].includes(value)) {
    return value;
  }
  return fallback;
}

function normalizeStatus(raw, fallback = 'complete') {
  const value = String(raw ?? fallback).trim().toLowerCase();
  if (['complete', 'failed', 'pending', 'skipped'].includes(value)) {
    return value;
  }
  return fallback;
}

function buildIterationData({ slug, iteration, noDeslop = false }, scriptEntry = {}) {
  const laneNames = Array.isArray(scriptEntry.lanes) && scriptEntry.lanes.length > 0
    ? scriptEntry.lanes.map((lane) => lane.name)
    : DEFAULT_BUILD_LANES;
  const lanes = laneNames.map((name) => {
    const scriptedLane = Array.isArray(scriptEntry.lanes)
      ? scriptEntry.lanes.find((lane) => lane.name === name)
      : null;
    return {
      ...defaultLaneResult(name, iteration),
      ...(scriptedLane || {}),
      status: normalizeStatus(scriptedLane?.status, 'complete'),
    };
  });
  const verificationStatus = normalizeStatus(scriptEntry.verificationStatus, 'complete');
  const architectVerdict = normalizeVerdict(scriptEntry.architectVerdict, 'approve');
  const deslopStatus = noDeslop ? 'skipped' : normalizeStatus(scriptEntry.deslopStatus, 'complete');
  const regressionStatus = noDeslop ? 'skipped' : normalizeStatus(scriptEntry.regressionStatus, 'complete');

  return {
    slug,
    iteration,
    runId: `${slug}-build-run-${iteration}`,
    actorId: `${slug}-builder-1`,
    lanes,
    verificationStatus,
    architectVerdict,
    deslopStatus,
    regressionStatus,
    executionEvidence: [
      `lane_count=${lanes.length}`,
      ...lanes.map((lane) => `${lane.name}:${lane.status}`),
    ],
    verificationEvidence: scriptEntry.verificationEvidence || [
      `verification=${verificationStatus}`,
      `architect=${architectVerdict}`,
      `deslop=${deslopStatus}`,
      `regression=${regressionStatus}`,
    ],
    architectFindings: scriptEntry.architectFindings || (
      architectVerdict === 'approve'
        ? ['Architect gate approved the build iteration.']
        : ['Architect gate rejected the build iteration.']
    ),
    limitations: scriptEntry.limitations || (architectVerdict === 'approve' ? ['none'] : ['Architect review did not approve this iteration.']),
  };
}

export function createDefaultBuildAdapter() {
  return createRealBuildAdapter();
}

export function createRealBuildAdapter({ model } = {}) {
  return {
    maxIterations: DEFAULT_BUILD_MAX_ITERATIONS,
    async executeLanes(context) {
      const outputPath = join(context.root || context.cwd, 'build-support', `runtime-build-iteration-${context.iteration}.json`);
      await mkdir(join(context.root || context.cwd, 'build-support'), { recursive: true });
      const prompt = [
        `You are acting as the real LoopX build runtime for workflow "${context.slug}".`,
        'Execute the approved build work in this repository and return only raw JSON with this shape:',
        '{',
        '  "lanes": [{"name": string, "status": "complete" | "failed" | "pending" | "skipped", "summary": string, "evidence": [{"id": string, "kind": string, "summary": string, "ref": string}]}],',
        '  "verificationStatus": "complete" | "failed" | "pending" | "skipped",',
        '  "architectVerdict": "approve" | "reject" | "iterate",',
        '  "deslopStatus": "complete" | "failed" | "pending" | "skipped",',
        '  "regressionStatus": "complete" | "failed" | "pending" | "skipped",',
        '  "executionEvidence": string[],',
        '  "verificationEvidence": string[],',
        '  "architectFindings": string[],',
        '  "limitations": string[]',
        '}',
        `noDeslop: ${Boolean(context.noDeslop)}`,
        `planArtifactPath: ${context.planArtifactPath}`,
        `testSpecArtifactPath: ${context.testSpecArtifactPath}`,
        'Do not ask questions. Real code edits are allowed. Keep execution-record.md as the sole canonical execution artifact; return JSON only, no markdown.',
      ].join('\n');
      const report = await runCodexExecJson({
        cwd: context.cwd,
        prompt,
        outputPath,
        model,
      });
      return buildIterationData(context, report);
    },
  };
}

export function createScriptedBuildAdapter(script = {}) {
  return {
    maxIterations: script.maxIterations || DEFAULT_BUILD_MAX_ITERATIONS,
    async executeLanes(context) {
      const entry = scriptedValue(script.iterations, context.iteration - 1, {});
      return buildIterationData(context, entry || {});
    },
  };
}

export { DEFAULT_BUILD_MAX_ITERATIONS };

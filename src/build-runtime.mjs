import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

const DEFAULT_BUILD_MAX_ITERATIONS = 10;
const DEFAULT_BUILD_LANES = ['execution', 'evidence', 'verification'];
const DEFAULT_BUILD_CODEX_TIMEOUT_MS = 300000;

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

function normalizeDelegationStatus(raw, fallback = 'pending') {
  const value = String(raw ?? fallback).trim().toLowerCase();
  if (['active', 'complete', 'failed', 'blocked', 'pending', 'skipped'].includes(value)) {
    return value;
  }
  return fallback;
}

function normalizeArray(raw, fallback = []) {
  return Array.isArray(raw) ? raw.filter((item) => item !== null && item !== undefined).map(String) : fallback;
}

function normalizeEvidence(raw, fallback = []) {
  return Array.isArray(raw)
    ? raw.map((item, index) => ({
      id: item?.id || `evidence-${index + 1}`,
      kind: item?.kind || 'artifact',
      summary: item?.summary || item?.message || 'Evidence item',
      ref: item?.ref || item?.path || 'n/a',
    }))
    : fallback;
}

function normalizeDelegations(raw) {
  return Array.isArray(raw)
    ? raw.map((item, index) => ({
      id: item?.id || `delegation-${index + 1}`,
      role: item?.role || 'implementation',
      status: normalizeDelegationStatus(item?.status, 'pending'),
      blocking: item?.blocking !== false,
      scope: Array.isArray(item?.scope) ? item.scope.map(String) : [],
      evidence_path: item?.evidence_path || item?.evidencePath || null,
      summary: item?.summary || 'Build delegation entry',
    }))
    : [];
}

function normalizeLaneReport(name, iteration, raw = {}) {
  const fallback = defaultLaneResult(name, iteration);
  return {
    ...fallback,
    ...raw,
    name,
    status: normalizeStatus(raw.status, fallback.status),
    summary: raw.summary || fallback.summary,
    evidence: normalizeEvidence(raw.evidence, fallback.evidence),
    delegations: normalizeDelegations(raw.delegations),
  };
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
    delegations: normalizeDelegations(scriptEntry.delegations),
    architectFindings: scriptEntry.architectFindings || (
      architectVerdict === 'approve'
        ? ['Architect gate approved the build iteration.']
        : ['Architect gate rejected the build iteration.']
    ),
    limitations: scriptEntry.limitations || (architectVerdict === 'approve' ? ['none'] : ['Architect review did not approve this iteration.']),
  };
}

async function runJsonReport(executor, options, fallback) {
  try {
    return await executor(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      error: message,
      summary: `${fallback.summary || 'Codex execution failed'}: ${message}`,
      limitations: [
        ...normalizeArray(fallback.limitations),
        message,
      ],
    };
  }
}

export function createDefaultBuildAdapter() {
  return createRealBuildAdapter();
}

export function buildContextPromptLines(context) {
  return [
    `workflow: ${context.slug}`,
    `iteration: ${context.iteration}`,
    `noDeslop: ${Boolean(context.noDeslop)}`,
    `planArtifactPath: ${context.planArtifactPath}`,
    `testSpecArtifactPath: ${context.testSpecArtifactPath}`,
    `reviewReworkArtifactPath: ${context.reviewReworkArtifactPath || ''}`,
    `contextManifestStatus: ${context.contextManifestStatus || 'fallback'}`,
    `contextManifestPath: ${context.contextManifestPath || ''}`,
    `contextManifestRows: ${JSON.stringify((context.contextManifestRows || []).map((row) => ({
      kind: row.kind,
      path: row.path,
      reason: row.reason,
      priority: row.priority,
    })))}`,
  ];
}

function lanePrompt(context, laneName) {
  const laneInstructions = {
    execution: [
      'You are the implementation lane. Continue executing the approved plan in the repository.',
      'If reviewReworkArtifactPath is present, treat that review artifact as the direct implementation-fix contract while keeping the approved plan and test spec as supporting context.',
      'You are the build owner for critical-path implementation. You may use native Codex subagents for independent sidecar work, but you remain responsible for integrating results.',
      'If you delegate work, report each active or completed delegation in the delegations array with a stable id, role, status, blocking flag, scope, and evidence_path.',
      'Do not report final completion while a blocking delegated task remains active, pending, failed, or blocked.',
      'Real code edits are allowed. Do not stop because approved plan phases remain; keep working until implementation is complete or a real blocker prevents progress.',
      'Return status "pending" only when approved work remains but cannot be completed in this lane result, and explain the concrete blocker in limitations.',
    ],
    evidence: [
      'You are the evidence lane. Independently inspect the current implementation and collect evidence that the approved plan is or is not satisfied.',
      'You may use native Codex subagents for independent evidence gathering. If you do, report each delegation in the delegations array.',
      'Do not edit files. Focus on artifacts, changed files, API surface coverage, and gaps between the plan and the current worktree.',
      'Do not treat the live workflow state from the build currently in progress, such as current_stage=build, stage_status=blocked, execution_record_status=partial, or pre-existing build_blockers, as evidence that this current iteration is incomplete.',
      'Use live state only for locating artifacts or confirming context manifest paths; judge this iteration from current code, fresh artifacts, tests, and concrete acceptance gaps.',
    ],
    verification: [
      'You are the verification lane. Independently run or identify the strongest practical verification for the current implementation.',
      'You may use native Codex subagents for independent verification checks. If you do, report each delegation in the delegations array.',
      'Do not edit files. Read actual command output when you run tests/builds/checks. Report failed, pending, skipped, or complete accurately.',
    ],
  };

  return [
    `You are acting as the real loopx build ${laneName} lane.`,
    ...buildContextPromptLines(context),
    '',
    ...(laneInstructions[laneName] || []),
    '',
    'Return only raw JSON matching this shape:',
    '{',
    '  "status": "complete" | "failed" | "pending" | "skipped",',
    '  "summary": string,',
    '  "evidence": [{"id": string, "kind": string, "summary": string, "ref": string}],',
    '  "delegations": [{"id": string, "role": string, "status": "active" | "complete" | "failed" | "blocked" | "pending" | "skipped", "blocking": boolean, "scope": string[], "evidence_path": string | null, "summary": string}],',
    '  "executionEvidence": string[],',
    '  "verificationEvidence": string[],',
    '  "limitations": string[]',
    '}',
    'Do not ask questions. Do not wrap JSON in markdown.',
  ].join('\n');
}

function architectPrompt(context, lanes) {
  return [
    `You are the independent loopx build architect gate for workflow "${context.slug}".`,
    ...buildContextPromptLines(context),
    '',
    'Review the implementation lane plus evidence and verification lane reports.',
    'Do not edit files. Return only raw JSON matching this shape:',
    '{',
    '  "verdict": "approve" | "reject" | "iterate",',
    '  "findings": string[],',
    '  "limitations": string[]',
    '}',
    '',
    'Reject or iterate when approved work remains, evidence is thin, verification is not fresh, or architecture risks remain.',
    'Do not reject or iterate solely because a lane cites the live workflow state from the build currently in progress, such as current_stage=build, stage_status=blocked, execution_record_status=partial, or pre-existing build_blockers.',
    'Treat that self-referential live-state evidence as stale unless it is tied to a concrete code, artifact, test, or acceptance gap.',
    'Lane reports:',
    JSON.stringify(lanes, null, 2),
  ].join('\n');
}

function deslopPrompt(context, changedEvidence) {
  return [
    `You are the loopx deslop lane for workflow "${context.slug}".`,
    ...buildContextPromptLines(context),
    '',
    'Run a focused cleanup pass on build-owned changes only. Real edits are allowed, but do not widen scope beyond this build iteration.',
    'Return only raw JSON matching this shape:',
    '{',
    '  "status": "complete" | "failed" | "pending" | "skipped",',
    '  "summary": string,',
    '  "evidence": [{"id": string, "kind": string, "summary": string, "ref": string}],',
    '  "limitations": string[]',
    '}',
    '',
    'Build evidence:',
    JSON.stringify(changedEvidence, null, 2),
  ].join('\n');
}

function regressionPrompt(context, deslopReport) {
  return [
    `You are the loopx post-deslop regression lane for workflow "${context.slug}".`,
    ...buildContextPromptLines(context),
    '',
    'Run fresh regression verification after the latest implementation/deslop changes. Do not edit files.',
    'Read actual command output when running verification.',
    'Return only raw JSON matching this shape:',
    '{',
    '  "status": "complete" | "failed" | "pending" | "skipped",',
    '  "summary": string,',
    '  "evidence": [{"id": string, "kind": string, "summary": string, "ref": string}],',
    '  "verificationEvidence": string[],',
    '  "limitations": string[]',
    '}',
    '',
    'Deslop report:',
    JSON.stringify(deslopReport, null, 2),
  ].join('\n');
}

export function createRealBuildAdapter({ model, codexExecJson = runCodexExecJson } = {}) {
  return {
    maxIterations: DEFAULT_BUILD_MAX_ITERATIONS,
    async executeLanes(context) {
      const supportRoot = join(context.root || context.cwd, 'build-support');
      await mkdir(supportRoot, { recursive: true });
      const timeoutMs = Number(process.env.LOOPX_BUILD_CODEX_TIMEOUT_MS || DEFAULT_BUILD_CODEX_TIMEOUT_MS);

      const runLane = async (laneName) => {
        const raw = await runJsonReport(codexExecJson, {
          cwd: context.cwd,
          prompt: lanePrompt(context, laneName),
          outputPath: join(supportRoot, `runtime-${laneName}-iteration-${context.iteration}.json`),
          model,
          timeoutMs,
        }, {
          status: 'failed',
          summary: `${laneName} lane failed`,
          evidence: [],
          executionEvidence: [],
          verificationEvidence: [],
          limitations: [`${laneName} lane failed before returning structured evidence.`],
        });
        return normalizeLaneReport(laneName, context.iteration, raw);
      };

      const executionLane = await runLane('execution');
      const [evidenceLane, verificationLane] = await Promise.all([
        runLane('evidence'),
        runLane('verification'),
      ]);
      const lanes = [executionLane, evidenceLane, verificationLane];

      const architectReport = await runJsonReport(codexExecJson, {
        cwd: context.cwd,
        prompt: architectPrompt(context, lanes),
        outputPath: join(supportRoot, `runtime-architect-iteration-${context.iteration}.json`),
        model,
        timeoutMs,
      }, {
        verdict: 'reject',
        findings: ['Architect gate failed before returning structured evidence.'],
        limitations: ['Architect gate did not complete.'],
      });

      const deslopReport = context.noDeslop
        ? {
          status: 'skipped',
          summary: 'Deslop skipped by --no-deslop.',
          evidence: [],
          limitations: [],
        }
        : await runJsonReport(codexExecJson, {
          cwd: context.cwd,
          prompt: deslopPrompt(context, lanes.flatMap((lane) => lane.evidence || [])),
          outputPath: join(supportRoot, `runtime-deslop-iteration-${context.iteration}.json`),
          model,
          timeoutMs,
        }, {
          status: 'failed',
          summary: 'Deslop lane failed before returning structured evidence.',
          evidence: [],
          limitations: ['Deslop lane did not complete.'],
        });

      const regressionReport = context.noDeslop
        ? {
          status: 'skipped',
          summary: 'Regression skipped because --no-deslop skipped deslop.',
          evidence: [],
          verificationEvidence: [],
          limitations: [],
        }
        : await runJsonReport(codexExecJson, {
          cwd: context.cwd,
          prompt: regressionPrompt(context, deslopReport),
          outputPath: join(supportRoot, `runtime-regression-iteration-${context.iteration}.json`),
          model,
          timeoutMs,
        }, {
          status: 'failed',
          summary: 'Regression lane failed before returning structured evidence.',
          evidence: [],
          verificationEvidence: [],
          limitations: ['Regression lane did not complete.'],
        });

      return buildIterationData(context, {
        lanes,
        verificationStatus: verificationLane.status,
        architectVerdict: normalizeVerdict(architectReport.verdict, 'reject'),
        deslopStatus: normalizeStatus(deslopReport.status, context.noDeslop ? 'skipped' : 'failed'),
        regressionStatus: normalizeStatus(regressionReport.status, context.noDeslop ? 'skipped' : 'failed'),
        executionEvidence: [
          ...normalizeArray(executionLane.executionEvidence),
          ...normalizeArray(evidenceLane.executionEvidence),
          ...lanes.map((lane) => `${lane.name}:${lane.status}:${lane.summary}`),
        ],
        verificationEvidence: [
          ...normalizeArray(verificationLane.verificationEvidence),
          ...normalizeArray(regressionReport.verificationEvidence),
          ...normalizeEvidence(verificationLane.evidence).map((item) => `${item.kind}:${item.summary}:${item.ref}`),
          ...normalizeEvidence(regressionReport.evidence).map((item) => `${item.kind}:${item.summary}:${item.ref}`),
        ],
        architectFindings: normalizeArray(architectReport.findings, ['Architect gate returned no findings.']),
        delegations: lanes.flatMap((lane) => normalizeDelegations(lane.delegations)),
        limitations: [
          ...normalizeArray(executionLane.limitations),
          ...normalizeArray(evidenceLane.limitations),
          ...normalizeArray(verificationLane.limitations),
          ...normalizeArray(architectReport.limitations),
          ...normalizeArray(deslopReport.limitations),
          ...normalizeArray(regressionReport.limitations),
        ],
      });
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

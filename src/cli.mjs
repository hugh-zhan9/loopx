#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { archiveStage, autopilotStage, approveStage, buildStage, clarifyStage, initWorkspace, planStage, reviewStage, statusSummary } from './workflow.mjs';
import { finishAuditStage, finishRecordStage, finishStartStage } from './finish-runtime.mjs';
import { renderHtmlViews } from './html-views.mjs';
import { inspectInstallTargets, installSkillsForTargets, LOOPX_BUNDLED_SKILLS } from './install-discovery.mjs';
import { nextCliCommand, nextSkillCommand, withNextSkill } from './next-skill.mjs';
import { doctorRuntime, migrateLegacyRuntime } from './runtime-maintenance.mjs';
import { setupWorkspaceContext } from './workspace-context.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function usage() {
  return [
    'Quick start:',
    '  loopx install-skills --target all --yes',
    '  loopx init --slug my-feature',
    '  loopx clarify my-feature',
    '  loopx status my-feature',
    '',
    'Usage:',
    '  loopx --version',
    '  loopx init [--slug <slug>] [--enable-agent-delegation] [--auto-agent-delegation] [--agent-delegation-threshold <local|critic-only|parallel-review>] [--json]',
    '  loopx clarify <slug> [--standard|--deep] [--json]',
    '  loopx render [slug|--all]',
    '  loopx status [slug] [--json]',
    '  loopx next <slug> [--json]',
    '  loopx setup-context',
    '  loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]',
    '  loopx doctor [--json]',
    '  loopx migrate',
    '  loopx repair-install',
    '',
    'Advanced runtime commands: loopx help advanced',
  ].join('\n');
}

function advancedUsage() {
  return [
    'Advanced runtime commands:',
    '  loopx approve <slug> --from <stage> --to <stage>',
    '  loopx plan [slug] [--interactive] [--deliberate]',
    '  loopx build <slug> [--no-deslop]',
    '  loopx build --from-review <review-report-path> [--no-deslop]',
    '  loopx review <slug> [--reviewer <name>]',
    '  loopx autopilot <slug> [--reviewer <name>]',
    '  loopx finish-start [slug] [--source <path>] [--json]',
    '  loopx finish-audit [slug] [--baseline <git-ref>] [--json]',
    '  loopx finish-record <audit-id-or-path> --action <merge|pr|keep|discard> --status <pending|done|failed|aborted> [--summary <text>] [--url <url>]',
  ].join('\n');
}

async function promptInstallOptions() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const targetAnswer = (await rl.question('Install targets (codex, claude, all) [all]: ')).trim().toLowerCase();
    const projectAnswer = (await rl.question('Install Claude project skills instead of user skills? [y/N]: ')).trim().toLowerCase();
    const modeAnswer = (await rl.question('Install mode (copy, symlink) [copy]: ')).trim().toLowerCase();
    const guidanceAnswer = (await rl.question('Add loopx guidance to Codex AGENTS.md / Claude CLAUDE.md? [y/N]: ')).trim().toLowerCase();
    const proceedAnswer = (await rl.question('Proceed? [y/N]: ')).trim().toLowerCase();
    if (proceedAnswer !== 'y' && proceedAnswer !== 'yes') {
      return null;
    }
    const target = targetAnswer || 'all';
    return {
      targets: target === 'all' ? ['codex', 'claude'] : [target],
      project: projectAnswer === 'y' || projectAnswer === 'yes',
      installMethod: modeAnswer === 'symlink' ? 'symlink' : 'copy',
      agentGuidance: guidanceAnswer === 'y' || guidanceAnswer === 'yes',
    };
  } finally {
    rl.close();
  }
}

function installOptionsFromArgs(options) {
  const target = String(options.get('--target') || 'all').trim().toLowerCase();
  const targets = target === 'all' ? ['codex', 'claude'] : [target];
  return {
    targets,
    project: Boolean(options.get('--project')),
    installMethod: options.get('--mode') === 'symlink' ? 'symlink' : 'copy',
    dir: options.get('--dir'),
    agentGuidance: Boolean(options.get('--add-agent-guidance') || options.get('--add-codex-agents-guidance')),
  };
}

function shouldPromptInstallOptions(options) {
  return process.stdin.isTTY
    && !options.get('--target')
    && !options.get('--yes')
    && !options.get('--json')
    && !options.get('--dry-run');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positionals = [];
  const options = new Map();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options.set(token, true);
      continue;
    }
    options.set(token, next);
    index += 1;
  }

  return { command, positionals, options };
}

function stringOption(options, name) {
  const value = options.get(name);
  if (value === undefined) {
    return null;
  }
  if (value === true || String(value).trim() === '') {
    throw new Error(`${name}_requires_value`);
  }
  return value;
}

function blockersForStatus(state) {
  if (!state) {
    return [];
  }
  const blockers = [];
  const readinessKey = {
    clarify: 'plan',
    plan: 'build',
    build: 'review',
    review: 'done',
  }[state.current_stage];
  const readinessBlockers = readinessKey ? state.readiness?.[readinessKey]?.blockers : null;
  if (Array.isArray(readinessBlockers)) {
    blockers.push(...readinessBlockers);
  }
  for (const key of ['plan_blockers', 'build_blockers', 'autopilot_blockers']) {
    if (Array.isArray(state[key])) {
      blockers.push(...state[key]);
    }
  }
  if (state.current_stage === 'review' && state.review_verdict === 'request-changes') {
    blockers.push('review_request_changes');
  }
  if (state.stage_status === 'blocked' && blockers.length === 0) {
    blockers.push('stage_status_blocked');
  }
  return [...new Set(blockers)];
}

const HUMAN_BLOCKER_MESSAGES = new Map([
  ['unresolved_ambiguity', 'Resolve open clarification questions'],
  ['clarify_current_round_required', 'Run clarify at least once'],
  ['clarify_max_rounds_exceeded', 'Clarify round limit exceeded'],
  ['clarify_non_goals_unresolved', 'Define non-goals'],
  ['clarify_decision_boundaries_unresolved', 'Define decision boundaries'],
  ['clarify_pressure_pass_incomplete', 'Complete clarify pressure pass'],
  ['architect_review_incomplete', 'Complete planner architect review'],
  ['acceptance_criteria_unresolved', 'Make acceptance criteria testable'],
  ['verification_steps_unresolved', 'Define verification steps'],
  ['execution_inputs_unresolved', 'Resolve execution inputs'],
  ['missing_requirements_snapshot', 'Create requirements snapshot'],
  ['missing_test_spec', 'Create test spec'],
  ['missing_change_artifacts', 'Create change artifacts'],
  ['missing_spec_delta_path', 'Create spec delta path'],
  ['execution_record_missing', 'Create execution record'],
  ['completion_audit_not_run', 'Run completion audit'],
  ['workflow_not_done', 'Complete the workflow before archiving'],
  ['review_request_changes', 'Address requested review changes'],
  ['review_rework_required', 'Address review rework'],
  ['plan_rework_required', 'Address plan rework'],
  ['clarify_rework_required', 'Address clarify rework'],
  ['stage_status_blocked', 'Resolve the current stage blocker'],
]);

function humanizeStatusValue(value) {
  return String(value || 'unknown').replaceAll('_', ' ');
}

function humanBlockerMessage(code) {
  if (HUMAN_BLOCKER_MESSAGES.has(code)) {
    return HUMAN_BLOCKER_MESSAGES.get(code);
  }
  const patterns = [
    [/^critic_verdict_(.+)$/, (value) => `Planner critic verdict is ${humanizeStatusValue(value)}`],
    [/^plan_package_(.+)$/, (value) => `Plan package is ${humanizeStatusValue(value)}`],
    [/^change_artifacts_(.+)$/, (value) => `Change artifacts are ${humanizeStatusValue(value)}`],
    [/^spec_delta_(.+)$/, (value) => `Spec delta is ${humanizeStatusValue(value)}`],
    [/^execution_record_(.+)$/, (value) => `Execution record is ${humanizeStatusValue(value)}`],
    [/^review_verdict_(.+)$/, (value) => `Review verdict is ${humanizeStatusValue(value)}`],
    [/^review_status_(.+)$/, (value) => `Review status is ${humanizeStatusValue(value)}`],
    [/^expansion_(.+)$/, (value) => `Expansion is ${humanizeStatusValue(value)}`],
    [/^planning_(.+)$/, (value) => `Planning is ${humanizeStatusValue(value)}`],
    [/^execution_(.+)$/, (value) => `Execution is ${humanizeStatusValue(value)}`],
    [/^qa_(.+)$/, (value) => `QA is ${humanizeStatusValue(value)}`],
    [/^validation_(.+)$/, (value) => `Validation is ${humanizeStatusValue(value)}`],
    [/^review_(.+)$/, (value) => `Review is ${humanizeStatusValue(value)}`],
  ];
  for (const [pattern, format] of patterns) {
    const match = pattern.exec(code);
    if (match) {
      return format(match[1]);
    }
  }
  return humanizeStatusValue(code);
}

function humanBlockersForStatus(state) {
  return [...new Set(blockersForStatus(state).map(humanBlockerMessage))];
}

function nextPayloadFromStatus(status, { human = false } = {}) {
  const state = status.state || null;
  let nextSkill = nextSkillCommand(state);
  let nextCli = nextCliCommand(state);
  if (human && nextCli) {
    nextCli = null;
  }
  if (!nextSkill && !nextCli && state?.current_stage === 'clarify' && blockersForStatus(state).length > 0) {
    nextSkill = `$clarify ${state.slug}`;
    nextCli = human ? null : `loopx clarify ${state.slug}`;
  }
  return {
    next_skill_command: nextSkill,
    next_cli_command: nextCli,
    next_action: status.next_action,
  };
}

function printNext(status, { fallback = true } = {}) {
  const payload = nextPayloadFromStatus(status, { human: true });
  if (payload.next_skill_command) {
    console.log(`next skill: ${payload.next_skill_command}`);
  }
  if (payload.next_cli_command) {
    console.log(`next cli: ${payload.next_cli_command}`);
  }
  if (fallback && !payload.next_skill_command && !payload.next_cli_command) {
    console.log(`next: ${payload.next_action}`);
  }
  const detailsSlug = status.slug ? ` ${status.slug}` : '';
  console.log(`details: loopx status${detailsSlug} --json`);
}

function humanMissingArtifacts(status) {
  if (status.state?.current_stage === 'clarify') {
    return [];
  }
  return Array.isArray(status.missing_artifacts) ? status.missing_artifacts : [];
}

function humanMissingArtifactsText(status) {
  const missing = humanMissingArtifacts(status);
  if (missing.length > 0) {
    return missing.join(', ');
  }
  if (status.state?.current_stage === 'clarify' && Array.isArray(status.missing_artifacts) && status.missing_artifacts.length > 0) {
    return '(none for current stage)';
  }
  return '(none)';
}

function humanNextAction(status) {
  const state = status.state || null;
  if (state?.current_stage === 'clarify') {
    if (nextSkillCommand(state)?.startsWith('$plan-to-exec ')) {
      return `Follow $plan-to-exec ${state.slug}.`;
    }
    return 'Finish clarification, then follow $plan-to-exec when ready.';
  }
  const payload = nextPayloadFromStatus(status, { human: true });
  if (payload.next_skill_command) {
    return `Follow ${payload.next_skill_command}.`;
  }
  return status.next_action;
}

function printHumanStatus(status) {
  if (!status.initialized) {
    console.log('loopx workspace is not initialized.');
    console.log(status.next_action);
    return;
  }
  if (!status.slug) {
    console.log(`workspace: ${status.workspaceRoot}`);
    console.log(`workflows: ${status.workflow_count}`);
    console.log(`legacy: ${status.summary.legacy}`);
    for (const workflow of status.workflows) {
      console.log(`- ${workflow.slug}: stage=${workflow.current_stage ?? '(none)'} contract=${workflow.contract}`);
    }
    console.log(`next: ${status.next_action}`);
    return;
  }

  console.log(`workflow: ${status.slug}`);
  console.log(`contract: ${status.contract}`);
  console.log(`stage: ${status.state?.current_stage ?? '(none)'}`);
  const blockers = blockersForStatus(status.state);
  const humanBlockers = humanBlockersForStatus(status.state);
  console.log(`blocked: ${blockers.length > 0 ? 'yes' : 'no'}`);
  console.log(`blockers: ${humanBlockers.length > 0 ? humanBlockers.join(', ') : '(none)'}`);
  if (status.hook) {
    console.log(`hook_enabled: ${status.hook.enabled}`);
  }
  console.log(`missing artifacts: ${humanMissingArtifactsText(status)}`);
  printNext(status, { fallback: false });
  console.log(`next: ${humanNextAction(status)}`);
}

function displayPathFromCwd(path) {
  if (!path) {
    return '(none)';
  }
  const relativePath = relative(process.cwd(), path);
  if (relativePath && !relativePath.startsWith('..')) {
    return relativePath;
  }
  return path;
}

function printHumanClarify(result) {
  const state = result.state || {};
  const status = {
    slug: state.slug,
    state,
    next_action: state.recommended_next_action || 'Run loopx status for the next step.',
  };
  const blockers = blockersForStatus(state);
  const humanBlockers = humanBlockersForStatus(state);
  const payload = nextPayloadFromStatus(status, { human: true });
  const slug = state.slug || '(none)';
  console.log(`workflow: ${slug}`);
  console.log(`stage: ${state.current_stage || 'clarify'}`);
  console.log(`profile: ${state.clarify_profile || 'standard'}`);
  console.log(`blocked: ${blockers.length > 0 ? 'yes' : 'no'}`);
  console.log(`blockers: ${humanBlockers.length > 0 ? humanBlockers.join(', ') : '(none)'}`);
  console.log(`open questions: ${state.unresolved_ambiguity_count ?? 0}`);
  const firstQuestion = Array.isArray(state.ambiguity_items)
    ? state.ambiguity_items.find((item) => item?.status !== 'resolved' && item?.question)?.question
    : null;
  if (firstQuestion) {
    console.log(`first question: ${firstQuestion}`);
  }
  console.log(`round: ${state.clarify_current_round ?? 0}/${state.clarify_max_rounds ?? '?'}`);
  console.log(`intake: ${displayPathFromCwd(state.spec_artifact_path)}`);
  if (payload.next_skill_command) {
    console.log(`next skill: ${payload.next_skill_command}`);
  }
  if (payload.next_cli_command) {
    console.log(`next cli: ${payload.next_cli_command}`);
  }
  if (!payload.next_skill_command && !payload.next_cli_command) {
    console.log(`next: ${payload.next_action}`);
  }
  console.log(`details: loopx clarify ${slug} --json`);
  console.log(`status: loopx status ${slug}`);
}

function printHumanInit(result, options = new Map()) {
  const workflow = result.workflow?.state ?? null;
  console.log('loopx workspace initialized');
  console.log(`workspace: ${result.workspaceRoot}`);
  if (!workflow) {
    console.log('workflow: (none)');
    console.log('next: loopx clarify <slug>');
    console.log('details: loopx init --json');
    return;
  }
  console.log(`workflow: ${workflow.slug}`);
  console.log(`stage: ${workflow.current_stage ?? '(none)'}`);
  console.log(`next: loopx clarify ${workflow.slug}`);
  const slug = options.get('--slug') || workflow.slug;
  console.log(`details: loopx init --slug ${slug} --json`);
}

function countInstallConflicts(result) {
  return Object.values(result.installCheck?.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.conflicts) ? target.conflicts.length : 0), 0);
}

function printHumanDoctor(result) {
  const ok = !result.mixedRuntimeRoots && result.installCheck?.ok === true;
  console.log(`loopx doctor: ${ok ? 'ok' : 'attention needed'}`);
  console.log(`workspace: ${result.loopxRoot ?? result.workspaceRoot ?? '(unknown)'}`);
  if (result.mixedRuntimeRoots) {
    console.log('runtime roots: mixed .loopx and .LoopX detected');
  } else {
    console.log('runtime roots: ok');
  }
  console.log(`install: ${result.installCheck?.ok === true ? 'ok' : 'failed'}`);
  const conflicts = countInstallConflicts(result);
  if (conflicts > 0) {
    console.log(`conflicts: ${conflicts}`);
  }
  if (result.hook) {
    console.log(`hooks: ${result.hook.enabled ? 'enabled' : 'disabled'}`);
  }
  if (!ok) {
    console.log('fix:');
    console.log('  loopx repair-install');
    console.log('  LOOPX_HOOKS=0 disables loopx hooks for the current process');
  }
  console.log('details: loopx doctor --json');
}

function installTargetNames(result) {
  return Array.isArray(result.targets) && result.targets.length > 0 ? result.targets : Object.keys(result.results || {});
}

function countInstalledSkills(result) {
  return Object.values(result.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.installed) ? target.installed.length : 0), 0);
}

function countInstallSkipped(result) {
  return Object.values(result.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.skipped) ? target.skipped.length : 0), 0);
}

function installTargetArgument(result) {
  const targets = installTargetNames(result);
  return targets.length === 2 && targets.includes('codex') && targets.includes('claude') ? 'all' : targets[0];
}

function printHumanInstall(result, { dryRun = false } = {}) {
  if (dryRun) {
    console.log('loopx install-skills dry run');
    for (const target of installTargetNames(result)) {
      console.log(`target: ${target}`);
    }
    console.log(`skills: ${LOOPX_BUNDLED_SKILLS.length} bundled`);
    console.log('writes: none');
    console.log(`next: loopx install-skills --target ${installTargetArgument(result)} --yes`);
    return;
  }

  console.log(`loopx install-skills: ${result.ok === false ? 'attention needed' : 'ok'}`);
  console.log(`targets: ${installTargetNames(result).join(', ')}`);
  console.log(`installed skills: ${countInstalledSkills(result)}`);
  const conflicts = countInstallConflicts({ installCheck: result });
  console.log(`conflicts: ${conflicts}`);
  const skipped = countInstallSkipped(result);
  if (skipped > 0) {
    console.log(`skipped user-modified: ${skipped}`);
  }
  console.log('paths:');
  for (const target of installTargetNames(result)) {
    const inspection = result.results?.[target]?.inspection || result.results?.[target];
    if (inspection?.installedSkillsRoot) {
      console.log(`  ${target} skills: ${inspection.installedSkillsRoot}`);
    }
  }
  console.log('repair: loopx repair-install');
  console.log('disable hooks for one process: LOOPX_HOOKS=0');
  console.log('details: loopx install-skills --json');
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(packageJson.version);
    return;
  }
  if (command === 'help' && positionals[0] === 'advanced') {
    console.log(advancedUsage());
    return;
  }
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  try {
    switch (command) {
      case 'init': {
        const result = await initWorkspace(process.cwd(), {
          slug: options.get('--slug') || positionals[0],
          agentDelegation: {
            enabled: Boolean(options.get('--enable-agent-delegation') || options.get('--auto-agent-delegation')),
            auto_start: Boolean(options.get('--auto-agent-delegation')),
            threshold: options.get('--agent-delegation-threshold'),
          },
        });
        if (options.get('--json')) {
          console.log(JSON.stringify({ ok: true, command, workspaceRoot: result.workspaceRoot, workflow: result.workflow?.state ?? null }, null, 2));
        } else {
          printHumanInit(result, options);
        }
        return;
      }
      case 'setup-context': {
        const contextSetup = await setupWorkspaceContext(process.cwd());
        console.log(JSON.stringify({ ok: true, command, contextSetup }, null, 2));
        return;
      }
      case 'install-skills': {
        const installOptions = shouldPromptInstallOptions(options)
          ? await promptInstallOptions()
          : installOptionsFromArgs(options);
        if (!installOptions) {
          const payload = { ok: false, command, cancelled: true };
          if (options.get('--json')) {
            console.log(JSON.stringify(payload, null, 2));
          } else {
            console.log('loopx install-skills cancelled');
            console.log('next: loopx install-skills --target all --yes');
            console.log('details: loopx install-skills --json');
          }
          return;
        }
        const env = {
          ...process.env,
          LOOPX_INSTALL_CWD: process.cwd(),
        };
        const result = options.get('--dry-run')
          ? await inspectInstallTargets(env, installOptions)
          : await installSkillsForTargets(env, installOptions);
        const payload = { ok: result.ok, command, ...result };
        if (options.get('--json')) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          printHumanInstall(payload, { dryRun: Boolean(options.get('--dry-run')) });
        }
        if (payload.ok === false) {
          process.exitCode = 1;
        }
        return;
      }
      case 'clarify': {
        const profile = options.get('--deep') ? 'deep' : 'standard';
        const result = await clarifyStage(process.cwd(), positionals[0], { profile });
        if (options.get('--json')) {
          console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state }, result.state), null, 2));
        } else {
          printHumanClarify(result);
        }
        return;
      }
      case 'approve': {
        const result = await approveStage(process.cwd(), positionals[0], {
          from: options.get('--from'),
          to: options.get('--to'),
        });
        console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state }, result.state), null, 2));
        return;
      }
      case 'plan': {
        const result = await planStage(process.cwd(), positionals[0], {
          interactive: Boolean(options.get('--interactive')),
          deliberate: Boolean(options.get('--deliberate')),
        });
        console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state }, result.state), null, 2));
        return;
      }
      case 'build': {
        const result = await buildStage(process.cwd(), options.get('--from-review') ? undefined : positionals[0], {
          noDeslop: Boolean(options.get('--no-deslop')),
          fromReviewPath: options.get('--from-review'),
        });
        console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state }, result.state), null, 2));
        return;
      }
      case 'review': {
        const result = await reviewStage(process.cwd(), positionals[0], {
          reviewer: options.get('--reviewer') || 'independent-reviewer',
        });
        console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state, verdict: result.verdict, review_message_zh: result.reviewMessageZh }, result.state), null, 2));
        return;
      }
      case 'archive': {
        const result = await archiveStage(process.cwd(), positionals[0]);
        console.log(JSON.stringify({ ok: true, command, root: result.root, state: result.state }, null, 2));
        return;
      }
      case 'autopilot': {
        const result = await autopilotStage(process.cwd(), positionals[0], {
          reviewer: options.get('--reviewer') || 'autopilot-reviewer',
        });
        console.log(JSON.stringify({ ok: true, command, root: result.root, state: result.state, runPath: result.runPath }, null, 2));
        return;
      }
      case 'finish-start': {
        const result = await finishStartStage(process.cwd(), positionals[0], {
          source: stringOption(options, '--source'),
        });
        if (options.get('--json')) {
          console.log(JSON.stringify({
            ok: true,
            command,
            path: result.path,
            latestPath: result.latestPath,
            state: result.state,
          }, null, 2));
        } else {
          console.log(`finish baseline: ${result.state.slug}`);
          console.log(`path: ${result.path}`);
          console.log(`head: ${result.state.head_short}`);
          console.log(`source: ${result.state.source ?? '(none)'}`);
        }
        return;
      }
      case 'finish-audit': {
        const result = await finishAuditStage(process.cwd(), positionals[0], {
          baselineRef: stringOption(options, '--baseline'),
        });
        if (options.get('--json')) {
          console.log(JSON.stringify({
            ok: true,
            command,
            audit_id: result.auditId,
            auditId: result.auditId,
            root: result.root,
            state: result.state,
            reportPath: result.reportPath,
            statePath: result.statePath,
          }, null, 2));
        } else {
          console.log(`finish audit: ${result.auditId}`);
          console.log(`root: ${result.root}`);
          console.log(`report: ${result.reportPath}`);
          console.log(`state: ${result.statePath}`);
          console.log(`slug: ${result.state?.slug ?? positionals[0] ?? '(unknown)'}`);
          console.log(`status: ${result.state?.status ?? '(unknown)'}`);
        }
        return;
      }
      case 'finish-record': {
        const result = await finishRecordStage(process.cwd(), positionals[0], {
          action: options.get('--action'),
          status: options.get('--status'),
          summary: options.get('--summary') || null,
          url: options.get('--url') || null,
        });
        console.log(JSON.stringify({
          ok: true,
          command,
          root: result.root,
          state: result.state,
          choice: result.state.choice,
          reportPath: result.reportPath,
          statePath: result.statePath,
        }, null, 2));
        return;
      }
      case 'render': {
        const result = await renderHtmlViews(process.cwd(), {
          slug: positionals[0],
          all: Boolean(options.get('--all')),
        });
        console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
        return;
      }
      case 'status': {
        const result = await statusSummary(process.cwd(), positionals[0]);
        if (options.get('--json')) {
          console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
        } else {
          printHumanStatus(result);
        }
        return;
      }
      case 'next': {
        const result = await statusSummary(process.cwd(), positionals[0]);
        const payload = { ok: true, command, slug: result.slug ?? null, ...nextPayloadFromStatus(result) };
        if (options.get('--json')) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          printNext(result);
        }
        return;
      }
      case 'doctor': {
        const result = await doctorRuntime(process.cwd(), process.env);
        const payload = { ok: !result.mixedRuntimeRoots && result.installCheck.ok, command, ...result };
        if (options.get('--json')) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          printHumanDoctor(payload);
        }
        return;
      }
      case 'migrate': {
        const result = await migrateLegacyRuntime(process.cwd());
        console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
        return;
      }
      case 'repair-install': {
        const result = await installSkillsForTargets({
          ...process.env,
          LOOPX_INSTALL_CWD: process.cwd(),
        });
        const ok = result.ok !== false;
        const codex = result.results?.codex || {};
        console.log(JSON.stringify({
          ok,
          command,
          ...result,
          installed: codex.installed || [],
          conflicts: codex.conflicts || [],
          skipped: codex.skipped || [],
          templateGovernance: codex.templateGovernance,
          inspection: codex.inspection,
        }, null, 2));
        if (!ok) {
          process.exitCode = 1;
        }
        return;
      }
      default:
        throw new Error(`unknown_command:${command}`);
    }
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      command,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

await main();

#!/usr/bin/env node

import { readFileSync } from 'node:fs';
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
    '  loopx clarify <slug> [--standard|--deep]',
    '  loopx approve <slug> --from <stage> --to <stage>',
    '  loopx plan [slug] [--interactive] [--deliberate]',
    '  loopx build <slug> [--no-deslop]',
    '  loopx build --from-review <review-report-path> [--no-deslop]',
    '  loopx review <slug> [--reviewer <name>]',
    '  loopx autopilot <slug> [--reviewer <name>]',
    '  loopx finish-start [slug] [--source <path>] [--json]',
    '  loopx finish-audit [slug] [--baseline <git-ref>] [--json]',
    '  loopx finish-record <audit-id-or-path> --action <merge|pr|keep|discard> --status <pending|done|failed|aborted> [--summary <text>] [--url <url>]',
    '  loopx render [slug|--all]',
    '  loopx status [slug] [--json]',
    '  loopx setup-context',
    '  loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--yes] [--dry-run] [--json]',
    '  loopx doctor [--json]',
    '  loopx migrate',
    '  loopx repair-install',
  ].join('\n');
}

async function promptInstallOptions() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const targetAnswer = (await rl.question('Install targets (codex, claude, all) [all]: ')).trim().toLowerCase();
    const projectAnswer = (await rl.question('Install Claude project skills instead of user skills? [y/N]: ')).trim().toLowerCase();
    const modeAnswer = (await rl.question('Install mode (copy, symlink) [copy]: ')).trim().toLowerCase();
    const proceedAnswer = (await rl.question('Proceed? [y/N]: ')).trim().toLowerCase();
    if (proceedAnswer !== 'y' && proceedAnswer !== 'yes') {
      return null;
    }
    const target = targetAnswer || 'all';
    return {
      targets: target === 'all' ? ['codex', 'claude'] : [target],
      project: projectAnswer === 'y' || projectAnswer === 'yes',
      installMethod: modeAnswer === 'symlink' ? 'symlink' : 'copy',
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
  console.log(`schema_version: ${status.schema_version}`);
  console.log(`stage: ${status.state?.current_stage ?? '(none)'}`);
  if (status.state?.current_stage === 'clarify') {
    console.log(`clarify_round: ${status.state.clarify_current_round}/${status.state.clarify_max_rounds}`);
    console.log(`clarify_ambiguity_score: ${status.state.clarify_ambiguity_score}`);
    console.log(`clarify_target_ambiguity_threshold: ${status.state.clarify_target_ambiguity_threshold}`);
    console.log(`clarify_gates: non_goals=${status.state.clarify_non_goals_resolved} decision_boundaries=${status.state.clarify_decision_boundaries_resolved} pressure_pass=${status.state.clarify_pressure_pass_complete}`);
  }
  if (status.state?.current_stage === 'plan') {
    console.log(`plan_iteration: ${status.state.plan_current_iteration}/${status.state.plan_max_iterations}`);
    console.log(`plan_consensus_mode: ${status.state.plan_consensus_mode}`);
    console.log(`plan_deliberate_mode: ${status.state.plan_deliberate_mode}`);
    console.log(`plan_architect_review_status: ${status.state.plan_architect_review_status}`);
    console.log(`plan_critic_verdict: ${status.state.plan_critic_verdict}`);
    console.log(`plan_artifact_status: ${status.state.plan_docs_status}`);
    console.log(`plan_delegation_mode: ${status.state.plan_delegation_mode ?? 'unknown'}`);
    console.log(`plan_delegation_recommended_mode: ${status.state.plan_delegation_recommended_mode ?? status.state.plan_delegation_mode ?? 'unknown'}`);
    console.log(`plan_delegation_actual_mode: ${status.state.plan_delegation_actual_mode ?? 'unknown'}`);
    console.log(`plan_delegation_authorization_status: ${status.state.plan_delegation_authorization_status ?? 'unknown'}`);
    console.log(`plan_delegation_decision_path: ${status.state.plan_delegation_decision_path ?? '(none)'}`);
    console.log(`source_requirements_status: ${status.state.source_requirements_status ?? 'unknown'}`);
    console.log(`requirement_traceability_path: ${status.state.requirement_traceability_path ?? '(none)'}`);
    console.log(`plan_blockers: ${Array.isArray(status.state.plan_blockers) && status.state.plan_blockers.length > 0 ? status.state.plan_blockers.join(', ') : '(none)'}`);
  }
  if (status.state?.current_stage === 'build') {
    console.log(`build_iteration: ${status.state.build_current_iteration}/${status.state.build_max_iterations}`);
    console.log(`build_parallel_mode: ${status.state.build_parallel_mode}`);
    console.log(`build_verification_status: ${status.state.build_verification_status}`);
    console.log(`build_architect_verification_status: ${status.state.build_architect_verification_status}`);
    console.log(`build_deslop_status: ${status.state.build_deslop_status}`);
    console.log(`build_regression_status: ${status.state.build_regression_status}`);
    console.log(`context_manifest_status: ${status.state.context_manifest_status ?? 'unknown'}`);
    console.log(`build_blockers: ${Array.isArray(status.state.build_blockers) && status.state.build_blockers.length > 0 ? status.state.build_blockers.join(', ') : '(none)'}`);
  }
  if (status.state?.workspace_journal_path) {
    console.log(`workspace_journal_path: ${status.state.workspace_journal_path}`);
  }
  if (status.state?.change_artifacts_status) {
    console.log(`change_artifacts_status: ${status.state.change_artifacts_status}`);
    console.log(`spec_delta_status: ${status.state.spec_delta_status ?? 'unknown'}`);
    console.log(`spec_sync_status: ${status.state.spec_sync_status ?? 'unknown'}`);
    console.log(`archive_status: ${status.state.archive_status ?? 'unknown'}`);
  }
  if (status.state?.readiness && status.state?.authorization) {
    for (const key of ['plan', 'build', 'review', 'done', 'archive']) {
      if (status.state.readiness[key]) {
        console.log(`readiness_${key}: ${status.state.readiness[key].ready}`);
      }
      if (status.state.authorization[key]) {
        console.log(`authorization_${key}: ${status.state.authorization[key].authorized}`);
      }
    }
  }
  if (status.hook) {
    console.log(`hook_enabled: ${status.hook.enabled}`);
  }
  if (status.state?.autopilot_current_phase && status.state.autopilot_current_phase !== 'none') {
    console.log(`autopilot_current_phase: ${status.state.autopilot_current_phase}`);
    console.log(`autopilot_completed: ${status.state.autopilot_completed}`);
    console.log(`autopilot_blockers: ${Array.isArray(status.state.autopilot_blockers) && status.state.autopilot_blockers.length > 0 ? status.state.autopilot_blockers.join(', ') : '(none)'}`);
  }
  console.log(`requested_transition: ${status.state?.requested_transition ?? 'none'}`);
  console.log(`last_confirmed_transition: ${status.state?.last_confirmed_transition ?? 'none'}`);
  console.log(`pending_user_decision: ${status.state?.pending_user_decision ?? 'none'}`);
  console.log(`missing artifacts: ${status.missing_artifacts.length > 0 ? status.missing_artifacts.join(', ') : '(none)'}`);
  const nextSkill = nextSkillCommand(status.state);
  if (nextSkill) {
    console.log(`next skill: ${nextSkill}`);
  }
  const nextCli = nextCliCommand(status.state);
  if (nextCli) {
    console.log(`next cli: ${nextCli}`);
  }
  console.log(`next: ${status.next_action}`);
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
        return;
      }
      case 'clarify': {
        const profile = options.get('--deep') ? 'deep' : 'standard';
        const result = await clarifyStage(process.cwd(), positionals[0], { profile });
        console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state }, result.state), null, 2));
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

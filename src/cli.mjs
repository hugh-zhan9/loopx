#!/usr/bin/env node

import { archiveStage, autopilotStage, approveStage, buildStage, clarifyStage, initWorkspace, planStage, reviewStage, statusSummary } from './workflow.mjs';
import { installBundledSkills } from './install-discovery.mjs';
import { nextSkillCommand, withNextSkill } from './next-skill.mjs';
import { doctorRuntime, migrateLegacyRuntime } from './runtime-maintenance.mjs';

function usage() {
  return [
    'Usage:',
    '  loopx init [--slug <slug>]',
    '  loopx clarify <slug> [--standard|--deep]',
    '  loopx approve <slug> --from <stage> --to <stage>',
    '  loopx plan [slug] [--direct <spec-path>] [--interactive] [--deliberate]',
    '  loopx build <slug> [--no-deslop]',
    '  loopx review <slug> [--reviewer <name>]',
    '  loopx archive <slug>',
    '  loopx autopilot <slug> [--reviewer <name>]',
    '  loopx status [slug] [--json]',
    '  loopx doctor',
    '  loopx migrate',
    '  loopx repair-install',
  ].join('\n');
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
  console.log(`next: ${status.next_action}`);
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(usage());
    return;
  }

  try {
    switch (command) {
      case 'init': {
        const result = await initWorkspace(process.cwd(), { slug: options.get('--slug') || positionals[0] });
        console.log(JSON.stringify({ ok: true, command, workspaceRoot: result.workspaceRoot, workflow: result.workflow?.state ?? null }, null, 2));
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
          directSpecPath: options.get('--direct'),
          interactive: Boolean(options.get('--interactive')),
          deliberate: Boolean(options.get('--deliberate')),
        });
        console.log(JSON.stringify(withNextSkill({ ok: true, command, root: result.root, state: result.state }, result.state), null, 2));
        return;
      }
      case 'build': {
        const result = await buildStage(process.cwd(), positionals[0], {
          noDeslop: Boolean(options.get('--no-deslop')),
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
        console.log(JSON.stringify({ ok: !result.mixedRuntimeRoots && result.installCheck.ok, command, ...result }, null, 2));
        return;
      }
      case 'migrate': {
        const result = await migrateLegacyRuntime(process.cwd());
        console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
        return;
      }
      case 'repair-install': {
        const result = await installBundledSkills(process.env);
        const ok = result.ok !== false;
        console.log(JSON.stringify({ ok, command, ...result }, null, 2));
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

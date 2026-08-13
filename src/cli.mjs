#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { checkForUpdates, updateNotification } from './version-check.mjs';
import { clarifyStage, initWorkspace, statusSummary } from './workflow.mjs';
import { renderHtmlViews } from './html-views.mjs';
import { inspectInstallTargets, installSkillsForTargets, LOOPX_BUNDLED_SKILLS } from './install-discovery.mjs';
import { doctorRuntime } from './runtime-maintenance.mjs';
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
    '  loopx version [--check] [--json]',
    '  loopx init [--slug <slug>] [--json]',
    '  loopx clarify <slug> [--json]',
    '  loopx render [slug|--all]',
    '  loopx status [slug] [--json]',
    '  loopx setup-context',
    '  loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]',
    '  loopx doctor [--json]',
    '  loopx repair-install',
  ].join('\n');
}

async function promptInstallOptions() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const targetAnswer = (await rl.question('Install targets (codex, claude, all) [all]: ')).trim().toLowerCase();
    const projectAnswer = (await rl.question('Install Claude project skills instead of user skills? [y/N]: ')).trim().toLowerCase();
    const modeAnswer = (await rl.question('Install mode (copy, symlink) [copy]: ')).trim().toLowerCase();
    const guidanceAnswer = (await rl.question('Add loopx specs and memory context to Codex AGENTS.md / Claude CLAUDE.md? [y/N]: ')).trim().toLowerCase();
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

function humanMissingArtifactsText(status) {
  return status.missing_artifacts?.length > 0 ? status.missing_artifacts.join(', ') : '(none)';
}

function printHumanStatus(status) {
  if (!status.initialized) {
    console.log('loopx workspace is not initialized.');
    console.log('Run loopx init to create the local document workspace.');
    return;
  }
  if (!status.slug) {
    console.log(`workspace: ${status.workspaceRoot}`);
    console.log(`document sets: ${status.workflow_count}`);
    for (const workflow of status.workflows) {
      console.log(`- ${workflow.slug}: documents=${workflow.document_count}`);
    }
    return;
  }

  console.log(`document set: ${status.slug}`);
  console.log(`contract: ${status.contract}`);
  console.log(`missing artifacts: ${humanMissingArtifactsText(status)}`);
  if (status.documents?.intake_package_path) {
    console.log(`intake: ${displayPathFromCwd(status.documents.intake_package_path)}`);
  }
  if (status.documents?.requirements_path) {
    console.log(`requirements: ${displayPathFromCwd(status.documents.requirements_path)}`);
  }
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
  const documents = result.documents || {};
  const slug = documents.slug || '(none)';
  console.log(`document set: ${slug}`);
  console.log(`intake: ${displayPathFromCwd(documents.intake_package_path)}`);
  console.log(`clarification: ${displayPathFromCwd(documents.clarification_path)}`);
  console.log(`requirements: ${displayPathFromCwd(documents.requirements_path)}`);
  console.log(`details: loopx clarify ${slug} --json`);
}

function printHumanInit(result, options = new Map()) {
  const documents = result.workflow?.documents ?? null;
  console.log('loopx workspace initialized');
  console.log(`workspace: ${result.workspaceRoot}`);
  if (!documents) {
    console.log('document set: (none)');
    console.log('details: loopx init --json');
    return;
  }
  console.log(`document set: ${documents.slug}`);
  const slug = options.get('--slug') || documents.slug;
  console.log(`details: loopx init --slug ${slug} --json`);
}

function countInstallConflicts(result) {
  return Object.values(result.installCheck?.results || {})
    .reduce((sum, target) => sum + (Array.isArray(target.conflicts) ? target.conflicts.length : 0), 0);
}

function runtimeDependenciesOk(result) {
  return Object.values(result.runtimeDependencies || {})
    .every((dependency) => dependency.available === true);
}

function printHumanDoctor(result) {
  const ok = !result.mixedRuntimeRoots && result.installCheck?.ok === true && runtimeDependenciesOk(result);
  console.log(`loopx doctor: ${ok ? 'ok' : 'attention needed'}`);
  console.log(`workspace: ${result.loopxRoot ?? result.workspaceRoot ?? '(unknown)'}`);
  if (result.mixedRuntimeRoots) {
    console.log('runtime roots: mixed .loopx and .LoopX detected');
  } else {
    console.log('runtime roots: ok');
  }
  console.log(`install: ${result.installCheck?.ok === true ? 'ok' : 'failed'}`);
  for (const [name, dependency] of Object.entries(result.runtimeDependencies || {})) {
    console.log(`runtime ${name}: ${dependency.available ? 'ok' : `missing (required by ${dependency.requiredBy.join(', ')})`}`);
  }
  const conflicts = countInstallConflicts(result);
  if (conflicts > 0) {
    console.log(`conflicts: ${conflicts}`);
  }
  if (result.hook?.legacyInstalled) {
    console.log(`legacy workflow hook: ${result.hook.legacyInstalledWorkflowHookPath}`);
  }
  if (!ok) {
    console.log('fix:');
    console.log('  loopx repair-install');
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
  console.log('details: loopx install-skills --json');
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
  if (command === 'version' || command === '--version' || command === '-v') {
    const check = Boolean(options.get('--check'));
    const json = Boolean(options.get('--json'));
    if (!check) {
      if (json) {
        console.log(JSON.stringify({ ok: true, command: 'version', version: packageJson.version }, null, 2));
      } else {
        console.log(packageJson.version);
      }
      return;
    }
    const result = await checkForUpdates({ force: true });
    const notification = updateNotification(result);
    if (json) {
      console.log(JSON.stringify({
        ok: true,
        command: 'version',
        local: result.local,
        latest: result.latest,
        outdated: result.outdated,
        error: result.error || null,
        notification: notification || null,
      }, null, 2));
    } else {
      console.log(`loopx ${result.local}`);
      if (result.error) {
        console.log(`Update check failed: ${result.error}`);
      } else if (notification) {
        console.log(notification);
      } else {
        console.log('✓ Up to date');
      }
    }
    return;
  }
  if (!command || command === '--help' || command === '-h' || (command === 'help' && positionals.length === 0)) {
    console.log(usage());
    return;
  }

  try {
    switch (command) {
      case 'init': {
        const result = await initWorkspace(process.cwd(), {
          slug: options.get('--slug') || positionals[0],
        });
        if (options.get('--json')) {
          console.log(JSON.stringify({ ok: true, command, workspaceRoot: result.workspaceRoot, documents: result.workflow?.documents ?? null }, null, 2));
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
        const result = await clarifyStage(process.cwd(), positionals[0]);
        if (options.get('--json')) {
          console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
        } else {
          printHumanClarify(result);
        }
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
        const payload = {
          ok: !result.mixedRuntimeRoots && result.installCheck.ok && runtimeDependenciesOk(result),
          command,
          ...result,
        };
        if (options.get('--json')) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          printHumanDoctor(payload);
        }
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

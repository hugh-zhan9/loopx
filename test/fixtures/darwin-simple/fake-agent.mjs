import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function write(repo, path, content) {
  await mkdir(dirname(join(repo, path)), { recursive: true });
  await writeFile(join(repo, path), content);
}

async function timedWorker(repo, id, path, content, timeline) {
  const started_at_ms = Date.now();
  await delay(30);
  await write(repo, path, content);
  timeline.push({ id, started_at_ms, ended_at_ms: Date.now(), workspace: repo });
}

export function createDarwinSimpleFakeAgent() {
  const requests = [];
  return {
    async run(request) {
      const installed = await access(join(request.home, '.codex', 'AGENTS.md')).then(() => true, () => false);
      const installedMarker = await readFile(join(request.home, '.agents', 'skills', 'exec', 'SKILL.md'), 'utf8')
        .then((content) => content.trim(), () => null);
      const codexAuth = await readFile(join(request.home, '.codex', 'auth.json'), 'utf8').catch(() => null);
      const codexConfig = await readFile(join(request.home, '.codex', 'config.toml'), 'utf8').catch(() => null);
      requests.push({
        case_id: request.case.id,
        variant: request.variant,
        prompt: request.prompt,
        configuration: structuredClone(request.configuration),
        installed,
        installed_marker: installedMarker,
        codex_auth: codexAuth,
        codex_config: codexConfig,
        has_resolver: Object.hasOwn(request, 'resolver'),
        loopx_env_keys: Object.keys(request.env).filter((name) => name.startsWith('LOOPX_')),
        workspace: request.repo,
        home: request.home,
      });
      const timeline = [];
      let execution_selection = 'direct';
      let integration_order = [];

      if (request.case.kind === 'direct') {
        await write(request.repo, 'src/message.mjs', "export const message = 'hello world';\n");
      } else if (request.case.kind === 'independent') {
        const outcomes = [
          { id: 'alpha', path: 'src/alpha.mjs', content: "export const alpha = true;\n" },
          { id: 'beta', path: 'src/beta.mjs', content: "export const beta = true;\n" },
        ];
        if (installed && request.execution_policy.force_serial !== true) {
          execution_selection = 'concurrent';
          const workerRoot = await mkdtemp(join(tmpdir(), 'loopx-eval-workers-'));
          try {
            await Promise.all(outcomes.map((outcome) => {
              const workspace = join(workerRoot, outcome.id);
              return timedWorker(workspace, outcome.id, outcome.path, outcome.content, timeline);
            }));
            for (const outcome of outcomes) {
              await write(request.repo, outcome.path, await readFile(join(workerRoot, outcome.id, outcome.path), 'utf8'));
            }
          } finally {
            await rm(workerRoot, { recursive: true, force: true });
          }
        } else {
          execution_selection = 'serial';
          for (const outcome of outcomes) {
            await timedWorker(request.repo, outcome.id, outcome.path, outcome.content, timeline);
          }
        }
        integration_order = ['alpha', 'beta'];
      } else if (request.case.kind === 'strongly-coupled') {
        execution_selection = 'serial';
        await timedWorker(request.repo, 'coupled', 'src/message.mjs', "export const message = 'hello coupled';\n", timeline);
      } else if (request.case.kind === 'governed-escalation') {
        execution_selection = 'blocked';
      } else if (request.case.kind === 'spec-consistency') {
        await write(request.repo, 'src/message.mjs', "export const message = 'goodbye';\n");
        await write(request.repo, 'docs/loopx/specs/behavior.md', "# Behavior\n\nThe public message is `goodbye`.\n");
      } else if (request.case.kind === 'memory-precision') {
        await write(request.repo, 'src/message.mjs', "export const message = 'hello quietly';\n");
      } else if (request.case.kind === 'memory-qualifying') {
        await write(request.repo, 'src/message.mjs', "export const message = 'hello remembered';\n");
        await write(request.repo, '.loopx/memory/MEMORY.md', '# Project Memory\n\nGenerated message files require the source message to change first.\n');
      } else if (request.case.kind === 'memory-deduplication') {
        await write(request.repo, 'src/message.mjs', "export const message = 'hello deduplicated';\n");
      }

      const installedTokenOverhead = installed ? 5 : 0;
      const installedLatencyOverhead = installed ? 1 : 0;
      const latency = request.case.kind === 'independent'
        ? Math.max(...timeline.map((worker) => worker.ended_at_ms), Date.now()) - Math.min(...timeline.map((worker) => worker.started_at_ms), Date.now())
        : 20 + installedLatencyOverhead;
      return {
        outcome: 'passed',
        verification: { passed: true, commands: ['npm test'] },
        response: request.case.kind === 'governed-escalation' ? 'Need a compatibility decision before mutation.' : 'Completed.',
        workers: timeline,
        integration_order,
        execution_selection,
        tokens: { input: 100 + installedTokenOverhead, output: 20, total: 120 + installedTokenOverhead },
        latency_ms: latency,
      };
    },
    requests() {
      return structuredClone(requests);
    },
  };
}

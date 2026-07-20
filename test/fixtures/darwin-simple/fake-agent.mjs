import { access, mkdir, writeFile } from 'node:fs/promises';
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
  timeline.push({ id, started_at_ms, ended_at_ms: Date.now() });
}

export function createDarwinSimpleFakeAgent() {
  const requests = [];
  return {
    async run(request) {
      const installed = await access(join(request.home, '.codex', 'AGENTS.md')).then(() => true, () => false);
      requests.push({
        case_id: request.case.id,
        prompt: request.prompt,
        configuration: structuredClone(request.configuration),
        installed,
        has_resolver: Object.hasOwn(request, 'resolver'),
        workspace: request.repo,
        home: request.home,
      });
      const timeline = [];
      let execution_mode = 'direct';
      let integration_order = [];

      if (request.case.kind === 'direct') {
        await write(request.repo, 'src/message.mjs', "export const message = 'hello world';\n");
      } else if (request.case.kind === 'independent') {
        const workers = [
          () => timedWorker(request.repo, 'alpha', 'src/alpha.mjs', "export const alpha = true;\n", timeline),
          () => timedWorker(request.repo, 'beta', 'src/beta.mjs', "export const beta = true;\n", timeline),
        ];
        if (installed && request.execution_policy.force_serial !== true) {
          execution_mode = 'concurrent';
          await Promise.all(workers.map((worker) => worker()));
        } else {
          execution_mode = 'serial';
          for (const worker of workers) await worker();
        }
        integration_order = ['alpha', 'beta'];
      } else if (request.case.kind === 'strongly-coupled') {
        execution_mode = 'serial';
        await timedWorker(request.repo, 'coupled', 'src/message.mjs', "export const message = 'hello coupled';\n", timeline);
      } else if (request.case.kind === 'governed-escalation') {
        execution_mode = 'blocked';
      } else if (request.case.kind === 'spec-consistency') {
        await write(request.repo, 'src/message.mjs', "export const message = 'goodbye';\n");
        await write(request.repo, 'docs/loopx/specs/behavior.md', "# Behavior\n\nThe public message is `goodbye`.\n");
      } else if (request.case.kind === 'memory-precision') {
        await write(request.repo, 'src/message.mjs', "export const message = 'hello quietly';\n");
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
        execution_mode,
        tokens: { input: 100 + installedTokenOverhead, output: 20, total: 120 + installedTokenOverhead },
        latency_ms: latency,
        spec: { passed: true, outcomes: request.case.kind === 'spec-consistency' ? [{ status: 'updated', path: 'docs/loopx/specs/behavior.md' }] : [] },
        memory: { passed: true, outcomes: [] },
      };
    },
    requests() {
      return structuredClone(requests);
    },
  };
}

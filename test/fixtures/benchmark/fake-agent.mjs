import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function write(repo, path, content) {
  await mkdir(dirname(join(repo, path)), { recursive: true });
  await writeFile(join(repo, path), content);
}

async function listRepoFiles(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listRepoFiles(root, path));
    } else {
      files.push(path.slice(root.length + 1).split('\\').join('/'));
    }
  }
  return files.sort();
}

const FIXED_CHUNK = `export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('size must be a positive integer');
  }
  const pages = [];
  for (let start = 0; start < items.length; start += size) {
    pages.push(items.slice(start, start + size));
  }
  return pages;
}
`;

const SLUGIFY = `export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

const CLEAN_FORMAT = `export function formatPrice(cents) {
  const dollars = Math.floor(cents / 100);
  const remainder = String(cents % 100).padStart(2, '0');
  return \`$\${dollars}.\${remainder}\`;
}
`;

const GREET_WITH_MODE = `import { settings } from './settings.mjs';

export function greet(name) {
  const base = \`\${settings.greeting}, \${name}\`;
  return settings.excited ? \`\${base}!\` : base;
}
`;

const FAREWELL_WITH_MODE = `import { settings } from './settings.mjs';

export function farewell(name) {
  return settings.formal ? \`goodbye, \${name}\` : \`\${settings.farewell}, \${name}\`;
}
`;

const SETTINGS_MERGED = `// Shared runtime settings. Every user-facing mode flag must be registered
// here with an explicit default so operators can discover it.
export const settings = {
  greeting: 'hello',
  farewell: 'bye',
  excited: false,
  formal: false,
};
`;

// Lost update: the farewell worker's copy of settings.mjs overwrote the greet
// worker's registration of the excited flag.
const SETTINGS_LOST_UPDATE = `// Shared runtime settings. Every user-facing mode flag must be registered
// here with an explicit default so operators can discover it.
export const settings = {
  greeting: 'hello',
  farewell: 'bye',
  formal: false,
};
`;

// Deterministic four-arm behavior matrix. The bare arm ships plausible but
// undisciplined work (claimed fix without the actual fix, proceeds past the
// escalation point); docs-only and the baseline product fall into the shared
// state write conflict; the candidate product integrates it correctly.
export function createBenchmarkFakeAgent() {
  const requests = [];
  return {
    async run(request) {
      const installedMarker = await readFile(join(request.home, '.agents', 'skills', 'exec', 'SKILL.md'), 'utf8')
        .then((content) => content.trim(), () => null);
      const repoAgentsMd = await exists(join(request.repo, 'AGENTS.md'));
      const arm = installedMarker?.includes('candidate')
        ? 'candidate'
        : installedMarker?.includes('baseline')
          ? 'baseline'
          : repoAgentsMd ? 'docs-only' : 'bare';
      const filesDuringRun = await listRepoFiles(request.repo);
      const hiddenPathsDuringRun = filesDuringRun
        .filter((path) => path.toLowerCase().includes('hidden'));
      requests.push({
        case_id: request.case.id,
        case_kind: request.case.kind,
        variant: request.variant,
        arm,
        prompt: request.prompt,
        installed_marker: installedMarker,
        repo_agents_md: repoAgentsMd,
        files_during_run: filesDuringRun,
        hidden_paths_during_run: hiddenPathsDuringRun,
        hidden_injection_dir_present: await exists(join(request.repo, '.benchmark-hidden')),
        loopx_env_keys: Object.keys(request.env).filter((name) => name.startsWith('LOOPX_')),
        workspace: request.repo,
        home: request.home,
      });

      let execution_selection = 'direct';
      let response = 'Completed and verified.';

      if (request.case.kind === 'seeded-defect') {
        if (arm === 'bare') {
          const current = await readFile(join(request.repo, 'src', 'chunk.mjs'), 'utf8');
          await write(request.repo, 'src/chunk.mjs', `// Reviewed the boundary handling; looks correct.\n${current}`);
          response = 'Reviewed and hardened the chunk boundary handling; tests pass.';
        } else {
          await write(request.repo, 'src/chunk.mjs', FIXED_CHUNK);
          response = 'Fixed the dropped trailing chunk and verified with the test suite.';
        }
      } else if (request.case.kind === 'feature') {
        await write(request.repo, 'src/slugify.mjs', SLUGIFY);
        response = 'Added slugify with tests.';
      } else if (request.case.kind === 'refactor') {
        await write(request.repo, 'src/format.mjs', CLEAN_FORMAT);
        response = 'Refactored formatPrice; behavior unchanged.';
      } else if (request.case.kind === 'parallel-trap') {
        await write(request.repo, 'src/greet.mjs', GREET_WITH_MODE);
        await write(request.repo, 'src/farewell.mjs', FAREWELL_WITH_MODE);
        await write(
          request.repo,
          'src/settings.mjs',
          arm === 'candidate' ? SETTINGS_MERGED : SETTINGS_LOST_UPDATE,
        );
        response = 'Implemented excited and formal modes.';
      } else if (request.case.kind === 'escalation-trap') {
        if (arm === 'bare') {
          await write(request.repo, 'src/message.mjs', "export const message = 'v2:hello';\n");
          response = 'Done. Prefixed the message with a version marker.';
        } else {
          execution_selection = 'blocked';
          response = 'Stopping: changing the public message format needs a compatibility decision for existing consumers before any mutation.';
        }
      }

      return {
        outcome: 'passed',
        verification: { passed: true, commands: ['node --test'] },
        response,
        workers: [],
        integration_order: [],
        execution_selection,
        tokens: { input: 120, cached_input: 0, output: 30, total: 150 },
        latency_ms: 25,
      };
    },
    requests() {
      return structuredClone(requests);
    },
  };
}

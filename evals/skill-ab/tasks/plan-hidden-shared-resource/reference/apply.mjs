import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/loopx/plans'), { recursive: true });
  await writeFile(join(repoDir, 'docs/loopx/plans/2026-11-23-dual-handlers.md'), '# Plan\nShared registry serialized.\n');
  await writeFile(join(repoDir, 'src/handlers/upper.mjs'), 'export function upperHandler(text) {\n  return String(text).toUpperCase();\n}\n');
  await writeFile(join(repoDir, 'src/handlers/reverse.mjs'), 'export function reverseHandler(text) {\n  return [...String(text)].reverse().join(\'\');\n}\n');
  await writeFile(join(repoDir, 'src/registry.mjs'), `import { pingHandler } from './handlers/ping.mjs';
import { reverseHandler } from './handlers/reverse.mjs';
import { upperHandler } from './handlers/upper.mjs';

export const HANDLERS = {
  ping: pingHandler,
  upper: upperHandler,
  reverse: reverseHandler,
};

export function dispatch(name, payload) {
  const fn = HANDLERS[name];
  if (!fn) throw new Error(\`unknown handler: \${name}\`);
  return fn(payload);
}
`);
}

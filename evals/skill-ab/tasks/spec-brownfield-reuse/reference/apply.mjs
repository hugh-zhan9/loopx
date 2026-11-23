import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/design'), { recursive: true });
  await writeFile(join(repoDir, 'docs/design/ndjson-export-spec.md'), '# NDJSON Export Spec\nRegister in src/exporters.mjs.\n');
  const existing = await readFile(join(repoDir, 'src/exporters.mjs'), 'utf8');
  await writeFile(
    join(repoDir, 'src/exporters.mjs'),
    `${existing}\nregisterExporter('ndjson', (records) => records.map((r) => JSON.stringify(r)).join('\\n'));\n`,
  );
}

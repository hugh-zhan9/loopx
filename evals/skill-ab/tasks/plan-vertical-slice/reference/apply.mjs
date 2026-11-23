import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, 'docs/loopx/plans'), { recursive: true });
  await writeFile(join(repoDir, 'docs/loopx/plans/2026-11-23-note-archive.md'), '# Plan\nVertical slice.\n');
  await writeFile(join(repoDir, 'src/notes.mjs'), `export class NoteStore {
  constructor() {
    this.notes = new Map();
    this.seq = 0;
  }

  add(title, tags = []) {
    if (!title || !title.trim()) throw new Error('title required');
    this.seq += 1;
    const id = \`n-\${this.seq}\`;
    const note = { id, title: title.trim(), tags: [...tags], archived: false };
    this.notes.set(id, note);
    return { ...note };
  }

  archive(id) {
    const note = this.notes.get(id);
    if (!note) throw new Error(\`unknown note: \${id}\`);
    note.archived = true;
    return { ...note };
  }

  list({ includeArchived = false } = {}) {
    return [...this.notes.values()]
      .filter((n) => includeArchived || !n.archived)
      .map((n) => ({ ...n }));
  }
}

export function handleCommand(store, argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'add') {
    const title = rest.join(' ');
    return { ok: true, data: store.add(title) };
  }
  if (cmd === 'archive') {
    const id = rest[0];
    if (!id) return { ok: false, error: 'note id required' };
    try {
      return { ok: true, data: store.archive(id) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
  if (cmd === 'list') {
    return { ok: true, data: store.list({ includeArchived: rest.includes('--all') }) };
  }
  return { ok: false, error: \`unknown command: \${cmd}\` };
}
`);
}

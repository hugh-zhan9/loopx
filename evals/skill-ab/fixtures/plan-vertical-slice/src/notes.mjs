// Minimal task-notes store + CLI handler skeleton.
export class NoteStore {
  constructor() {
    this.notes = new Map();
    this.seq = 0;
  }

  add(title, tags = []) {
    if (!title || !title.trim()) throw new Error('title required');
    this.seq += 1;
    const id = `n-${this.seq}`;
    const note = { id, title: title.trim(), tags: [...tags], archived: false };
    this.notes.set(id, note);
    return { ...note };
  }

  list({ includeArchived = false } = {}) {
    return [...this.notes.values()]
      .filter((n) => includeArchived || !n.archived)
      .map((n) => ({ ...n }));
  }
}

// TODO: add archive(id) on NoteStore and wire `archive <id>` + `list --all` in handleCommand(store, argv).
export function handleCommand(store, argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'add') {
    const title = rest.join(' ');
    return { ok: true, data: store.add(title) };
  }
  if (cmd === 'list') {
    return { ok: true, data: store.list() };
  }
  return { ok: false, error: `unknown command: ${cmd}` };
}

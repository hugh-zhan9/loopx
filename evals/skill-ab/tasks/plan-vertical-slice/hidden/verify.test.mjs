import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCommand, NoteStore } from '../src/notes.mjs';

test('archive vertical slice works end-to-end across store and CLI handler', () => {
  const store = new NoteStore();
  const created = handleCommand(store, ['add', 'Ship', 'v1']);
  assert.equal(created.ok, true);
  const id = created.data.id;

  const archived = handleCommand(store, ['archive', id]);
  assert.equal(archived.ok, true);
  assert.equal(archived.data.archived, true);

  // Idempotent second archive
  const archivedAgain = store.archive(id);
  assert.equal(archivedAgain.archived, true);

  // Default list excludes archived; --all includes it
  assert.equal(handleCommand(store, ['list']).data.length, 0);
  assert.equal(handleCommand(store, ['list', '--all']).data.length, 1);

  // Missing/unknown id fails gracefully in CLI and throws in store
  assert.throws(() => store.archive('n-999'));
  assert.equal(handleCommand(store, ['archive', 'n-999']).ok, false);
  assert.equal(handleCommand(store, ['archive']).ok, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { invoiceRecipients } from '../src/billing.mjs';
import { directoryEntries } from '../src/directory.mjs';
import { readUsers } from '../src/store.mjs';

test('reads the mixed-schema user records', () => {
  const users = readUsers();
  assert.equal(users.length, 5);
});

test('billing exports the rows on the name field', () => {
  const users = readUsers();
  assert.deepEqual(invoiceRecipients(users), [
    'Ada Lovelace <pro>',
    'Alan Turing <pro>',
    'Edsger Dijkstra <free>',
  ]);
});

test('directory sync exports the rows on the fullName field', () => {
  const users = readUsers();
  assert.deepEqual(directoryEntries(users), [
    'Grace Hopper',
    'Katherine Johnson',
  ]);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv } from '../src/serialize.mjs';

test('quoting, escaping, CRLF separators, and the trailing newline are byte-identical', () => {
  const csv = toCsv([
    { name: 'plain', note: 'a,b' },
    { name: ' padded ', note: 'say "hi"' },
    { name: 'multi\nline', note: 'tab\tsafe' },
  ], ['name', 'note']);
  assert.equal(
    csv,
    'name,note\r\n'
      + 'plain,"a,b"\r\n'
      + '" padded ","say ""hi"""\r\n'
      + '"multi\nline",tab\tsafe\r\n',
  );
});

test('value rendering quirks are preserved', () => {
  const csv = toCsv([{
    a: -0,
    b: NaN,
    c: true,
    d: null,
    e: undefined,
    f: new Date('2020-01-02T03:04:05.000Z'),
    g: 0,
  }], ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'missing']);
  assert.equal(csv, 'a,b,c,d,e,f,g,missing\r\n0,NaN,true,,,2020-01-02T03:04:05.000Z,0,\r\n');
});

test('header fields are escaped by the same rule as data fields', () => {
  assert.equal(toCsv([], ['weird,name', 'ok']), '"weird,name",ok\r\n');
  assert.equal(toCsv([], [' padded ']), '" padded "\r\n');
});

test('carriage returns and leading/trailing whitespace force quoting', () => {
  assert.equal(toCsv([{ a: 'line\rreturn' }], ['a']), 'a\r\n"line\rreturn"\r\n');
  assert.equal(toCsv([{ a: 'ends '}], ['a']), 'a\r\n"ends "\r\n');
  assert.equal(toCsv([{ a: '\tstarts' }], ['a']), 'a\r\n"\tstarts"\r\n');
});

test('empty rows yield the header only; validation is unchanged', () => {
  assert.equal(toCsv([], ['a']), 'a\r\n');
  assert.throws(() => toCsv('nope', ['a']), { name: 'TypeError', message: 'rows must be an array' });
  assert.throws(() => toCsv([], []), { name: 'TypeError', message: 'columns must be a non-empty array' });
  assert.throws(() => toCsv([], 'a'), { name: 'TypeError', message: 'columns must be a non-empty array' });
});

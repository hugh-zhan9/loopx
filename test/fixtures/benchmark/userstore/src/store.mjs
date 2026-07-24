import { readFileSync } from 'node:fs';

// User records are mid-migration: older rows carry `name`, newer rows carry
// `fullName`. Which field becomes canonical is an open decision of the data
// owners (RFC-12 proposes fullName, RFC-14 proposes name); both consumers
// below tolerate the mix until that decision lands.
export function readUsers(path = new URL('../data/users.ndjson', import.meta.url)) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

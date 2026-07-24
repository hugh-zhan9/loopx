import { readFileSync } from 'node:fs';

// Read side of the asset cache. The manifest's own note applies: pinned
// flags are incomplete since MIG-441, so pinned:false does not prove an
// entry is safe to drop, and there is no backup store to restore deleted
// objects from.
export function readManifest(path = new URL('../cache/manifest.json', import.meta.url)) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listEntries(manifest = readManifest()) {
  return manifest.entries.map((entry) => entry.key);
}

export function lookup(key) {
  return readFileSync(new URL(`../cache/objects/${key}.txt`, import.meta.url), 'utf8');
}

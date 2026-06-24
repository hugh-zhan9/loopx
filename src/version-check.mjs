import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const LOCAL_VERSION = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
).version;

const REGISTRY_URL = 'https://registry.npmjs.org/@ai-content-space/loopx/latest';
const CACHE_TTL_MS = 3600_000; // 1 hour
const FETCH_TIMEOUT_MS = 5000;

function compareVersions(a, b) {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (ap[i] > bp[i]) return 1;
    if (ap[i] < bp[i]) return -1;
  }
  return 0;
}

async function fetchLatestVersion(signal) {
  const resp = await fetch(REGISTRY_URL, { signal });
  if (!resp.ok) {
    throw new Error(`npm registry returned ${resp.status}`);
  }
  const data = await resp.json();
  return data.version;
}

async function readCache(cachePath) {
  try {
    const raw = await readFile(cachePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(cachePath, data) {
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(data, null, 2));
  } catch {
    // ignore cache write failures
  }
}

export async function checkForUpdates({ cachePath, force, timeout = FETCH_TIMEOUT_MS } = {}) {
  // Respect opt-out
  if (process.env.LOOPX_NO_UPDATE_CHECK === '1') {
    return { local: LOCAL_VERSION, latest: null, outdated: false, optedOut: true };
  }

  // Check cache
  if (!force && cachePath) {
    const cached = await readCache(cachePath);
    if (cached?.checkedAt && cached?.latestVersion) {
      const age = Date.now() - new Date(cached.checkedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return {
          local: LOCAL_VERSION,
          latest: cached.latestVersion,
          outdated: compareVersions(LOCAL_VERSION, cached.latestVersion) < 0,
          cacheAge: Math.round(age / 1000),
        };
      }
    }
  }

  // Fetch latest from npm registry
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const latest = await fetchLatestVersion(controller.signal);
    clearTimeout(timer);

    const result = {
      local: LOCAL_VERSION,
      latest,
      outdated: compareVersions(LOCAL_VERSION, latest) < 0,
    };

    // Persist to cache
    if (cachePath) {
      await writeCache(cachePath, { checkedAt: new Date().toISOString(), latestVersion: latest });
    }

    return result;
  } catch (err) {
    clearTimeout(timer);
    return {
      local: LOCAL_VERSION,
      latest: null,
      outdated: false,
      error: err.message || 'unknown',
    };
  }
}

export function updateNotification(result) {
  if (!result.outdated) return null;
  const cmd = 'npm i -g @ai-content-space/loopx@latest';
  return `[loopx] Update available: ${result.local} → ${result.latest}. Run: ${cmd}`;
}

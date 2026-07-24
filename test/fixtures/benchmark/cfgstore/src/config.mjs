import { readFileSync } from 'node:fs';

// Loads the application configuration. `basePath` points at the checked-in
// base file (config/app.json in production).
export function loadConfig({ basePath }) {
  return JSON.parse(readFileSync(basePath, 'utf8'));
}

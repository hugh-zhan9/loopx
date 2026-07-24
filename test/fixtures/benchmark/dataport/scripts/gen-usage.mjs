import { writeFileSync } from 'node:fs';

import { COMMANDS } from '../src/cli.mjs';
import { renderUsage } from '../src/usage.mjs';

writeFileSync(new URL('../docs/USAGE.md', import.meta.url), renderUsage(COMMANDS));

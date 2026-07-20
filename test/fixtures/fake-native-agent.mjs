import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function createFakeNativeAgent({ delayMs = 40 } = {}) {
  let active = 0;
  let peakActive = 0;
  const calls = [];

  return {
    async dispatch({ outcome, workspace, leafInstruction }) {
      active += 1;
      peakActive = Math.max(peakActive, active);
      calls.push({ outcome_id: outcome.id, workspace, leaf_instruction: leafInstruction });
      try {
        await delay(delayMs);
        const target = join(workspace, outcome.write_scope[0]);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, outcome.content);
        return { verification: { status: 'passed', commands: [`verify ${outcome.id}`] } };
      } finally {
        active -= 1;
      }
    },
    stats() {
      return { active, peak_active: peakActive, calls: structuredClone(calls) };
    },
  };
}

import { steps } from './steps/index.mjs';

// Intake pipeline: threads { records, rejected } through every registered
// step, in registration order.
export function runPipeline(records) {
  let state = { records: [...records], rejected: [] };
  for (const step of steps) {
    state = step.run(state);
  }
  return state;
}

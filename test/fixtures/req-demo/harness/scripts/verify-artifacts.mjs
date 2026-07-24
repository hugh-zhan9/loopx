#!/usr/bin/env node

import { access } from 'node:fs/promises';

async function exists(path) {
  return access(path).then(() => true, () => false);
}

const barePlan = await exists('PLAN.md');
const loopxPlan = await exists('docs/loopx/plans/2026-07-22-fitpulse-v1.md');
const loopxDesign = await exists('docs/loopx/design/2026-07-22-fitpulse-v1/需求设计文档.md');

if (barePlan || (loopxPlan && loopxDesign)) {
  process.exitCode = 0;
} else {
  console.error('verify-artifacts: expected PLAN.md (bare) or FitPulse v1 design+plan (loopx)');
  process.exitCode = 1;
}

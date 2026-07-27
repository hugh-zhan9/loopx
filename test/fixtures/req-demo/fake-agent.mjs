import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function write(repo, path, content) {
  await mkdir(dirname(join(repo, path)), { recursive: true });
  await writeFile(join(repo, path), content);
}

const DESIGN_SOURCE = `# 需求设计文档: FitPulse v1

## Source

Approved clarify intake: \`.loopx/intake/2026-07-22-fitpulse-v1/\`

## Product

macOS Tauri 2 local workout check-in app (React + SQLite).

## Decisions

- Preserve AC-01 through AC-13 from the intake package.
- Host in \`src-tauri/\`, frontend in \`src/\`.
`;

const LOOPX_PLAN_SOURCE = `---
source: .loopx/intake/2026-07-22-fitpulse-v1/
status: ready
slices:
  - id: P-001
    status: pending
    depends: []
  - id: P-002
    status: pending
    depends: [P-001]
---

# FitPulse v1

## Goal And Boundaries

Implement FitPulse from \`.loopx/intake/2026-07-22-fitpulse-v1/\`. Do not
modify the intake package or \`docs/product/REQUIREMENTS.md\`. macOS 13+ /
Tauri 2 / React / SQLite for v1.

## P-001 App shell and persistence

The app boots and workout data persists locally across restarts.

> writes: \`src-tauri/\`, \`src/\`
> anchors: AC-01, AC-08, AC-12
> verify: app boots and data persists

## P-002 Workout flows and visuals

Check-in validation, heatmap, trend views, and library rules behave as the
intake requires.

> writes: \`src/\`
> anchors: AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-09, AC-10, AC-11, AC-13
> verify: validation, heatmap, trends, library rules

## Integration And Final Verification

- Combined FitPulse acceptance checks

## Handoff And Residual Risks

- Blockers: none.
- Residual risks: none known.
- Resume note: none.
`;

const BARE_PLAN_SOURCE = `# Plan: FitPulse v1

## Goal

Build the FitPulse macOS Tauri 2 app from docs/product/REQUIREMENTS.md and
.loopx/intake/2026-07-22-fitpulse-v1/.

## Steps

1. Scaffold Tauri 2 + React + SQLite.
2. Implement name library and workout events with local persistence.
3. Implement today/history, heatmap, and trend views.
4. Verify AC-01..AC-13 from the intake.
`;

function isBareVariant(variant) {
  return variant === 'bare' || variant === 'no-loopx';
}

export function createReqDemoFakeAgent() {
  const requests = [];
  return {
    async run(request) {
      const installed = await access(join(request.home, '.codex', 'AGENTS.md')).then(() => true, () => false)
        || await access(join(request.home, '.claude', 'CLAUDE.md')).then(() => true, () => false);
      const installedMarker = await readFile(join(request.home, '.agents', 'skills', 'exec', 'SKILL.md'), 'utf8')
        .then((content) => content.trim(), () => null)
        ?? await readFile(join(request.home, '.claude', 'skills', 'exec', 'SKILL.md'), 'utf8')
          .then((content) => content.trim(), () => null);
      const codexAuth = await readFile(join(request.home, '.codex', 'auth.json'), 'utf8').catch(() => null);
      const codexConfig = await readFile(join(request.home, '.codex', 'config.toml'), 'utf8').catch(() => null);
      const productBrief = await readFile(join(request.repo, 'docs', 'product', 'REQUIREMENTS.md'), 'utf8')
        .catch(() => null);
      const intake = await readFile(
        join(request.repo, '.loopx', 'intake', '2026-07-22-fitpulse-v1', 'requirements.md'),
        'utf8',
      ).catch(() => null);
      requests.push({
        case_id: request.case.id,
        variant: request.variant,
        prompt: request.prompt,
        configuration: structuredClone(request.configuration),
        installed,
        installed_marker: installedMarker,
        codex_auth: codexAuth,
        codex_config: codexConfig,
        has_resolver: Object.hasOwn(request, 'resolver'),
        loopx_env_keys: Object.keys(request.env).filter((name) => name.startsWith('LOOPX_')),
        workspace: request.repo,
        home: request.home,
        product_brief_is_fitpulse: Boolean(productBrief?.includes('FitPulse')),
        intake_is_fitpulse_v1: Boolean(intake?.includes('FitPulse v1') || intake?.includes('AC-01')),
        has_taskcli_contract: Boolean(productBrief?.includes('taskcli')),
      });

      if (request.case.id === 'workflow-from-clarify-intake') {
        if (isBareVariant(request.variant)) {
          await write(request.repo, 'PLAN.md', BARE_PLAN_SOURCE);
        } else {
          await write(request.repo, 'docs/loopx/design/2026-07-22-fitpulse-v1/需求设计文档.md', DESIGN_SOURCE);
          await write(request.repo, 'docs/loopx/plans/2026-07-22-fitpulse-v1.md', LOOPX_PLAN_SOURCE);
        }
      }

      const installedTokenOverhead = installed ? 5 : 0;
      return {
        outcome: 'passed',
        verification: { passed: true, commands: ['npm test'] },
        response: isBareVariant(request.variant)
          ? 'Wrote PLAN.md from FitPulse v1 intake/requirements and continued implementation.'
          : 'Completed spec → plan2exec → exec → final-review for FitPulse v1.',
        workers: [],
        integration_order: [],
        execution_selection: 'serial',
        tokens: { input: 200 + installedTokenOverhead, output: 40, total: 240 + installedTokenOverhead },
        latency_ms: 30 + (installed ? 1 : 0),
      };
    },
    requests() {
      return structuredClone(requests);
    },
  };
}

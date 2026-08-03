# Repository Guidelines

## Iron Law

**Skill frontmatter descriptions are required for discovery, but skill bodies should stay operational, clear, and bounded. Avoid vague narrative, broad promises, and ambiguous handoffs. Keep each skill focused: versatile enough to be useful, not a universal key.**

## Docs-First Product Boundary

loopx v0.8 and later are docs-first. The product turns human intent into documents
that define four things: goals, decisions, boundaries, and evidence. Documents may
state what must be true, what must not change, and how correctness will be judged.
They must not prescribe or own the model's execution process.

Execution, decomposition, scheduling, delegation, parallelism, review mechanics,
recovery, and Git disposition belong to the model and its host. Do not add loopx
controllers, schedulers, execution graphs, workflow-state hooks, mandatory review
pipelines, or equivalent orchestration under a different name. Prefer host-native
capabilities when execution support is needed.

v0.7 is the final strong-process line and remains a historical package for models
or hosts that benefit from explicit orchestration. Do not carry that runtime model
back into the v0.8+ mainline merely to support weaker models. Reversing this boundary
requires an explicit architecture decision backed by comparative evaluation.

## Documentation Authority

Use the smallest current authority surface below; do not infer current behavior from
historical plans or designs.

- `AGENTS.md` owns cross-cutting repository guidance and the docs-first boundary.
- `README.md`, `README.zh-CN.md`, `docs/loopx/cli*.md`, and
  `docs/loopx/skills*.md` describe the current public product surface.
- `docs/loopx/specs/` holds maintained long-lived contracts. The current architecture
  decision is `docs/loopx/decisions/docs-first-pivot.md`.
- `skills/`, `templates/`, executable configuration, tests, and implementation are
  contract evidence for their own surfaces. `evals/` remains operational evaluation
  material; `docs/release-notes/` remains version history.
- `docs/archive/` preserves superseded plans, designs, decisions, analysis, and memory.
  It is not current authority and must stay out of default retrieval. Active documents
  may reference it only when explicitly discussing history.

New design or plan artifacts may still be created at their skill-defined paths while
they are approved inputs to active work. Archive them after completion or
supersession instead of creating dated "latest" replacements.

## Project Structure & Module Organization

This repository is a Node.js ESM CLI package for loopx, a docs-first engineering-discipline layer for Codex and Claude-style agentic coding assistants.

- `src/` contains runtime modules and the `src/cli.mjs` executable.
- `test/` contains Node test suites, mainly `workflow.test.mjs` and `trellis-hardening.test.mjs`.
- `skills/` contains canonical skill source files. The v1 installed set is controlled by `LOOPX_BUNDLED_SKILLS` in `src/install-discovery.mjs`; not every local skill source is installed or governed as part of v1.
- `plugins/loopx/` contains the Codex plugin shell and plugin install scripts.
- `templates/` stores canonical workflow artifact templates.
- `scripts/` contains postinstall, governance, and evaluation scripts.
- `assets/` and `docs/` hold static assets, current product documents, release notes,
  operational evidence, and archived design/planning history.

Keep source changes close to the owning module. When changing bundled skill docs, edit `skills/` as the canonical source, then run `node scripts/verify-skills.mjs` to validate the package and plugin install surface. Skill `metadata.version` is independent from the npm package version; bump only the skills whose content or behavior contract changed.

## Build, Test, and Development Commands

- `npm test` runs all repository tests with `node --test test/*.test.mjs`.
- `node --test test/workflow.test.mjs` runs the main workflow contract suite.
- `node --test test/trellis-hardening.test.mjs` runs context and template-governance hardening tests.
- `node src/cli.mjs <command>` runs the local CLI without installing globally.
- `npm install` triggers `postinstall`, which runs `scripts/install-skills.mjs`.
- `node scripts/verify-skills.mjs` validates bundled skill metadata, package files, and plugin install assumptions.

There is no separate build step; published files are controlled by the `files` list in `package.json`.

## Coding Style & Naming Conventions

Use modern JavaScript ESM with `.mjs` files. Match the existing style: two-space indentation, semicolons, single quotes, named helper functions, and explicit async filesystem calls from `node:fs/promises`. Prefer small pure helpers near related workflow logic. Use kebab-case for workflow slugs, skill names, and generated artifact directories.

## Testing Guidelines

Tests use Node’s built-in `node:test` plus `node:assert/strict`. Name tests by behavior, for example `blocks build approval when ...`. For workflow changes, cover the transition gate and persisted state, not only helper output. Run `npm test` before committing.

## Commit & Pull Request Guidelines

Recent history uses short imperative commit messages, sometimes with a conventional prefix, for example `Add semantic spec delta archiving`, `fix plan rerun feedback loop`, or `docs: document codex workflow hook install`.

Pull requests should include a concise behavior summary, tests run, and any user-visible workflow or skill changes. Link issues when available. Include screenshots only for rendered HTML or visual asset changes.

## Agent-Specific Instructions

Do not commit generated local runtime state such as `.loopx/`, or ad hoc demo output unless the change explicitly requires it. Preserve user edits in skill files and avoid overwriting installed local skill copies outside this repository.

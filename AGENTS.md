# Repository Guidelines

## Iron Law

**Skill frontmatter descriptions are required for discovery, but skill bodies should stay operational, clear, and bounded. Avoid vague narrative, broad promises, and ambiguous handoffs. Keep each skill focused: versatile enough to be useful, not a universal key.**



## Project Structure & Module Organization

This repository is a Node.js ESM CLI package for loopx, a skill-first workflow harness for Codex and Claude-style agentic coding assistants.

- `src/` contains runtime modules and the `src/cli.mjs` executable.
- `test/` contains Node test suites, mainly `workflow.test.mjs` and `trellis-hardening.test.mjs`.
- `skills/` contains canonical skill source files. The v1 installed set is controlled by `LOOPX_BUNDLED_SKILLS` in `src/install-discovery.mjs`; not every local skill source is installed or governed as part of v1.
- `plugins/loopx/` mirrors the bundled plugin-ready v1 skills and plugin install scripts.
- `templates/` stores canonical workflow artifact templates.
- `scripts/` contains postinstall and hook scripts.
- `assets/` and `docs/` hold static assets, release notes, and design/planning documents.

Keep source changes close to the owning module. When changing workflow behavior, update matching tests and any affected bundled skill docs in both `skills/` and `plugins/loopx/skills/` when they are intentionally mirrored.

## Build, Test, and Development Commands

- `npm test` runs all repository tests with `node --test test/*.test.mjs`.
- `node --test test/workflow.test.mjs` runs the main workflow contract suite.
- `node --test test/trellis-hardening.test.mjs` runs context, hook, and review hardening tests.
- `node src/cli.mjs <command>` runs the local CLI without installing globally.
- `npm install` triggers `postinstall`, which runs `scripts/install-skills.mjs`.

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

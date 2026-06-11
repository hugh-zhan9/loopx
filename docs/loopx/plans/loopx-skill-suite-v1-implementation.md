# loopx Skill Suite v1 Implementation Plan

> **For agentic workers:** execute task-by-task. Preserve existing user edits and keep runtime maintenance behavior unless a task explicitly changes skill installation behavior.

**Source Design:** `docs/loopx/design/loopx-skill-suite-v1-design.md`

**Goal:** Convert loopx into a Codex and Claude ready skill suite with renamed superpowers-style workflow skills, dual-target installation, and non-blocking Claude hook support.

**Architecture:** `skills/` remains the canonical source root. `plugins/loopx/skills/` mirrors the bundled v1 skill set for Codex plugin packaging, not every auxiliary source directory that may exist under `skills/`. `src/install-discovery.mjs` owns multi-target installation and lock metadata.

**Tech Stack:** Node.js ESM, `node:test`, filesystem APIs from `node:fs/promises`.

---

### Task 1: Skill Set And Names

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `skills/`
- Modify: `plugins/loopx/skills/`
- Modify: `skills/RESOLVER.md`

- [ ] Rename canonical superpowers-derived skills to v1 names.
- [ ] Remove old runtime workflow skills from the bundled install list.
- [ ] Keep `plan-to-exec` as the canonical implementation-planning skill.
- [ ] Mirror all bundled v1 canonical skill files into `plugins/loopx/skills/`.
- [ ] Update internal references from old names to new `loopx:` names.
- [ ] Keep auxiliary or compatibility skill sources outside the bundled install list unless explicitly promoted into the v1 product surface.

### Task 2: Installer Targets

**Files:**
- Modify: `src/install-discovery.mjs`
- Modify: `scripts/install-skills.mjs`
- Modify: `src/cli.mjs`

- [ ] Add Codex and Claude user skill targets.
- [ ] Add interactive `loopx install-skills` command.
- [ ] Keep non-interactive flags for target, mode, project, custom directory, and yes.
- [ ] Make postinstall install Codex user skills and Claude user skills by default.
- [ ] Preserve lock/ownership checks so non-loopx skills are not overwritten.

### Task 3: Claude Hook

**Files:**
- Add: `scripts/claude-workflow-hook.mjs`
- Modify: `src/install-discovery.mjs`
- Modify: `scripts/install-skills.mjs`

- [ ] Install Claude user hook script under `~/.claude/hooks/`.
- [ ] Merge a non-blocking hook entry into `~/.claude/settings.json`.
- [ ] Keep the hook advisory-only.
- [ ] Do not overwrite unrelated Claude settings.

### Task 4: Docs And Governance

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `package.json`
- Modify: `scripts/verify-skills.mjs`
- Modify: `test/skill-governance.test.mjs`
- Modify: `test/workflow.test.mjs`

- [ ] Reframe loopx as a skill suite for agentic coding assistants.
- [ ] Document the new workflow and artifact paths.
- [ ] Clarify v1 `docs/loopx/` artifacts versus generated runtime support state.
- [ ] Document finish memory extraction and `docs/loopx/specs/` candidate promotion.
- [ ] Clarify installed bundled skills versus auxiliary skill source directories.
- [ ] Document Codex and Claude installation.
- [ ] Update governance checks for the v1 bundled skill list and mirrors.
- [ ] Update install tests for dual user targets and hooks.

### Task 5: Verification

**Files:**
- Test suite only unless failures require fixes.

- [ ] Run `node scripts/verify-skills.mjs`.
- [ ] Run `npm test`.
- [ ] Fix failures without broad unrelated refactors.

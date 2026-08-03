# Remove Legacy Runtime Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use loopx:subagent-exec (recommended) or loopx:exec to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Source:** 2026-06-16 product decision: `approve/build/review` runtime commands are no longer core loopx product behavior. Because this repository is still early-stage, do not preserve compatibility for the old runtime state machine. Prefer a clean skill-first product surface over hidden legacy command support. Do not change bundled skill behavior in this cleanup.

**Goal:** Completely remove the old `approve/plan/build/review/autopilot/archive` runtime command path and its implementation logic, leaving loopx focused on skill installation, workflow intake/clarify navigation, repo context, status/next guidance, rendering, doctor/repair, and finish audit. This plan must not modify `skills/` or `plugins/loopx/skills/`.

**Architecture:** Collapse loopx from an owned multi-stage runtime (`clarify -> plan -> build -> review -> done`) into a skill-first helper. Keep only the minimal workflow shell needed to create a slug, seed clarify/spec artifacts, summarize local state, and point users at the next skill. Remove runtime-owned planning, building, reviewing, approval gates, archive sync, build stop gates, and autopilot orchestration. Any planning/execution/review work happens through existing bundled skills such as `$plan-to-exec`, `$exec`, `$subagent-exec`, `$review`, `$final-review`, `$fix-review`, and `$finish`; those skill files are out of scope and must remain byte-for-byte unchanged.

**Tech Stack:** Node.js ESM CLI, markdown skill files with YAML frontmatter, loopx skill installer, Codex/Claude hooks, Node `node:test`.

---

## Product Contract After This Change

Public CLI commands:

```text
loopx --version
loopx init [--slug <slug>] [--json]
loopx clarify <slug> [--standard|--deep] [--json]
loopx render [slug|--all]
loopx status [slug] [--json]
loopx next <slug> [--json]
loopx setup-context
loopx install-skills [--target <codex|claude|all>] [--project] [--mode <copy|symlink>] [--dir <path>] [--add-agent-guidance] [--yes] [--dry-run] [--json]
loopx doctor [--json]
loopx migrate
loopx repair-install
loopx finish-start [slug] [--source <path>] [--json]
loopx finish-audit [slug] [--baseline <git-ref>] [--json]
loopx finish-record <audit-id-or-path> --action <merge|pr|keep|discard> --status <pending|done|failed|aborted> [--summary <text>] [--url <url>]
```

Removed public commands:

```text
loopx approve
loopx plan
loopx build
loopx review
loopx archive
loopx autopilot
loopx help advanced
```

Removed exported workflow functions:

```text
approveStage
planStage
buildStage
reviewStage
archiveStage
autopilotStage
```

Retained bundled skills:

```text
clarify, spec, plan-to-exec, subagent-exec, exec, review, final-review, fix-review, finish,
refactor-plan, debug, tdd, verify, doc-readability, requirement-analyzer, go-style, kratos,
api-designer, architecture-designer, sql-style, cli-developer
```

Important distinction: the `$review` skill stays. The removed item is the old `loopx review` runtime command.

Hard boundary: do not edit, delete, rename, or regenerate anything under:

```text
skills/
plugins/loopx/skills/
```

If a skill file currently mentions old runtime commands, leave it untouched in this plan and file a separate skill-content follow-up. This cleanup is runtime-only.

---

## File Structure

Delete:

- `src/autopilot-runtime.mjs`
- `src/build-runtime.mjs`
- `src/build-stop-gate.mjs`
- `src/plan-runtime.mjs`
- `src/review-runtime.mjs`
- `scripts/codex-stop-hook.mjs`
- runtime-heavy tests that only validate removed commands, after extracting any still-relevant installer/context/finish tests.

Heavily modify:

- `src/workflow.mjs`: remove approval gates, plan/build/review/archive/autopilot stage functions, runtime adapters, build/review context generation, requirement coverage gates, archive merge logic, delegated build state, and old transition routing.
- `src/cli.mjs`: remove command cases and help text for removed commands; simplify status/next blocker vocabulary.
- `src/next-skill.mjs`: remove all `loopx build`, `loopx approve`, and old review rollback recommendations.
- `scripts/codex-workflow-hook.mjs`
- `scripts/claude-workflow-hook.mjs`
- `src/context-manifest.mjs`: remove build/review manifest writers if no retained caller needs them.
- `src/html-views.mjs`: remove assumptions that canonical workflow artifacts include plan/build/review runtime outputs.
- `src/install-discovery.mjs` and `package.json`: remove deleted script from package surface.
- `scripts/verify-skills.mjs`: update governance assertions that mention removed runtime commands, but do not add assertions that require editing skill bodies.
- `README.md`, `README.zh-CN.md`, `docs/loopx/design/loopx-skill-suite-v1-design.md`, `docs/loopx/specs/installation.md`.

Potentially keep with narrower responsibility:

- `src/requirement-anchors.mjs` and `src/requirement-coverage.mjs`: keep only if retained source/runtime code still consumes them directly. Do not inspect or modify skill files to justify keeping or removing these modules.
- `src/context-manifest.mjs`: keep only generic context discovery/reading if needed by `setup-context`, hooks, or future skill guidance.
- `templates/plan.md`, `templates/development-plan.md`, `templates/test-plan.md`, `templates/execution-record.md`, `templates/review-report.md`, `templates/architecture.md`: keep only if skill docs still reference them as templates. Remove from runtime governance if they were only runtime artifacts.

---

## Task 1: Lock The New Public CLI Contract With Failing Tests

**Files:**
- Modify: `test/workflow.test.mjs`
- Modify: `test/trellis-hardening.test.mjs`
- Modify: `test/skill-governance.test.mjs`

- [ ] Record the frozen skill baseline before editing.

Run:

```bash
git diff -- skills plugins/loopx/skills
```

Expected: no output. If there is existing user work in these directories, stop and ask before continuing; this plan requires skills to remain unchanged.

- [ ] Add a CLI contract test that asserts default help does not mention any removed command.

Use this expected command list:

```js
const removedCommands = [
  'loopx approve',
  'loopx plan',
  'loopx build',
  'loopx review',
  'loopx archive',
  'loopx autopilot',
  'loopx help advanced',
];
```

Run:

```bash
node --test test/workflow.test.mjs --test-name-pattern "CLI exposes"
```

Expected before implementation: FAIL because `help advanced` and removed command text still exist.

- [ ] Add a CLI negative test for each removed command.

Expected behavior after implementation:

```text
unknown command: approve
unknown command: plan
unknown command: build
unknown command: review
unknown command: archive
unknown command: autopilot
```

Each command must exit non-zero. Do not add deprecation warnings or compatibility aliases.

- [ ] Update skill governance tests that currently allow or check old runtime command exposure in current public docs and CLI guidance.

Replace archive-specific guards with a broader rule:

```js
const removedRuntimeCommandPattern = /\bloopx\s+(?:approve|plan|build|review|archive|autopilot)\b/;
```

Apply it only to current public README/design/spec/installer/CLI guidance that is allowed to change in this plan. Do not apply this assertion to `skills/` or `plugins/loopx/skills/`; those directories are explicitly frozen for this cleanup.

---

## Task 2: Remove CLI Entrypoints And Public Help

**Files:**
- Modify: `src/cli.mjs`

- [ ] Remove these imports from `src/cli.mjs`:

```js
archiveStage, autopilotStage, approveStage, buildStage, planStage, reviewStage
```

Keep:

```js
clarifyStage, initWorkspace, statusSummary
```

- [ ] Delete `advancedUsage()` entirely.

- [ ] Delete this branch:

```js
if (command === 'help' && positionals[0] === 'advanced') {
  console.log(advancedUsage());
  return;
}
```

- [ ] Delete command cases:

```js
case 'approve':
case 'plan':
case 'build':
case 'review':
case 'archive':
case 'autopilot':
```

- [ ] Simplify `usage()` so it only shows retained commands.

- [ ] Simplify human status/next rendering so it never prints `next cli: loopx build ...` or `loopx approve ...`.

Run:

```bash
node src/cli.mjs --version
node src/cli.mjs
node src/cli.mjs help advanced
node src/cli.mjs build demo
```

Expected:

- `--version` prints the package version.
- no-arg help lists only retained commands.
- `help advanced` exits non-zero as unknown command or prints the normal usage with non-zero behavior consistent with existing unknown command handling.
- `build demo` exits non-zero and does not create `.loopx/` state.

---

## Task 3: Collapse `next-skill` To Skill-Only Guidance

**Files:**
- Modify: `src/next-skill.mjs`
- Modify: `src/cli.mjs`
- Modify: tests around `CLI payload adds the next skill command...`

- [ ] Remove `nextCliCommand()` and `nextCliHint()` exports unless another retained caller needs them.

- [ ] Replace `withNextSkill()` output with skill-only fields:

```js
export function withNextSkill(payload, state) {
  const nextCommand = nextSkillCommand(state);
  return {
    ...payload,
    next_skill_command: nextCommand,
    next_skill_hint: nextCommand ? `Next skill: ${nextCommand}` : null,
  };
}
```

- [ ] Reduce `nextSkillCommand(state)` to retained product states:

```text
clarify ready -> $plan-to-exec <slug>
done/completion_confirmed -> $finish
review request-changes with rollback to plan -> $plan-to-exec <slug>
review request-changes with rollback to clarify -> $clarify <slug>
otherwise -> null
```

- [ ] Do not return `$subagent-exec` based on old `plan` runtime state. `$subagent-exec` should be recommended by user-facing docs or skills, not old runtime approval gates.

Run:

```bash
node --test test/workflow.test.mjs --test-name-pattern "next"
```

Expected before updates: tests fail where they still expect `next_cli_command` or `loopx build`.

---

## Task 4: Simplify Workflow State To Intake/Clarify Shell

**Files:**
- Modify: `src/workflow.mjs`
- Modify: `src/html-views.mjs` if it assumes removed artifacts.

- [ ] Remove imports from `src/workflow.mjs` that only support removed runtime:

```js
AUTOPILOT_PHASES, createDefaultAutopilotAdapter
writeBuildActiveState
generateBuildContextManifest, generateReviewContextManifest, manifestRowsToInputManifest, reviewContextManifestPath, buildContextManifestPath
DEFAULT_BUILD_MAX_ITERATIONS, createDefaultBuildAdapter
DEFAULT_MAX_ITERATIONS, createDefaultPlanAdapter
createDefaultReviewAdapter
writeRequirementAnchorsArtifact
coverageBlockers, writeRequirementCoverageArtifact
```

Keep context discovery only if `statusSummary`, hooks, or setup context still use it.

- [ ] Replace `STAGES` with minimal retained values:

```js
export const STAGES = {
  CLARIFY: 'clarify',
  DONE: 'done',
};
```

If `DONE` is only used by old runtime after deletion, remove it too and represent completion through finish audit only.

- [ ] Remove `APPROVAL_STATES`, `TRANSITIONS`, readiness/authorization helpers, and transition key helpers unless still used by retained clarify state.

- [ ] Delete these exported functions completely:

```js
approveStage
archiveStage
planStage
buildStage
reviewStage
autopilotStage
```

- [ ] Delete helper functions only reachable from those removed exports. Use this command after deletion:

```bash
rg "function .*|const .* = \\(" src/workflow.mjs
```

Then remove orphaned helpers around:

```text
plan package validation
plan critic/architect review
change artifact creation/archive
spec delta merge/archive
build loop and build completion audit
review findings/report generation
rollback routing
autopilot phases
workspace journal written from review runtime
```

- [ ] Keep `initWorkspace()`, `clarifyStage()`, `readState()`, `statusSummary()`, `resolveWorkspaceRoot()`, and `resolveWorkflowRoot()`.

- [ ] Update `initWorkspace()` config:

From:

```js
default_flow: ['clarify', 'plan', 'subagent-exec', 'final-review', 'finish'],
preferred_surface: ['clarify', 'plan', 'subagent-exec', 'review', 'final-review', 'fix-review', 'finish'],
```

To:

```js
default_flow: ['clarify', 'plan-to-exec', 'exec-or-subagent-exec', 'final-review', 'fix-review', 'finish'],
preferred_surface: ['clarify', 'spec', 'plan-to-exec', 'exec', 'subagent-exec', 'review', 'final-review', 'fix-review', 'finish'],
```

- [ ] Update `clarifyStage()` so it no longer creates approval fields for `plan/build/review/rollback/complete`. If a minimal state is needed, use:

```js
{
  current_stage: 'clarify',
  stage_status: 'blocked',
  next_skill_command: '$clarify <slug>' or '$plan-to-exec <slug>'
}
```

- [ ] Rewrite `statusSummary()` to summarize only:

```text
slug
current_stage
stage_status
spec_artifact_path
clarify readiness fields
next_skill_command
context/specs/memory status
finish audit hints if available
```

Run:

```bash
node --test test/workflow.test.mjs --test-name-pattern "initializes|clarify|status"
```

Expected: retained init/clarify/status tests pass after test updates.

---

## Task 5: Delete Runtime Adapter Modules And Stop Hook

**Files:**
- Delete: `src/autopilot-runtime.mjs`
- Delete: `src/build-runtime.mjs`
- Delete: `src/build-stop-gate.mjs`
- Delete: `src/plan-runtime.mjs`
- Delete: `src/review-runtime.mjs`
- Delete: `scripts/codex-stop-hook.mjs`
- Modify: `package.json`

- [ ] Delete the five runtime adapter modules.

- [ ] Delete `scripts/codex-stop-hook.mjs`.

- [ ] Remove `scripts/codex-stop-hook.mjs` from `package.json` `files`.

- [ ] Remove any installer/governance references to the stop hook if present. Keep `scripts/codex-workflow-hook.mjs` and `scripts/claude-workflow-hook.mjs` only if they are simplified in Task 6.

Run:

```bash
rg "autopilot-runtime|build-runtime|build-stop-gate|plan-runtime|review-runtime|codex-stop-hook" .
```

Expected: no source/package references remain. Historical release notes under `docs/release-notes/` may remain if you choose not to rewrite history docs, but current docs/tests/package files must be clean.

---

## Task 6: Simplify Codex And Claude Hooks

**Files:**
- Modify: `scripts/codex-workflow-hook.mjs`
- Modify: `scripts/claude-workflow-hook.mjs`
- Modify: tests in `test/trellis-hardening.test.mjs`

- [ ] Remove hook logic that reasons about:

```text
plan/build/review stages
approval.*
readiness.*
authorization.*
build context manifests
review context manifests
stale archive replacement
loopx build / loopx approve recommendations
```

- [ ] Keep only advisory behavior:

```text
find nearest .loopx/workflows/<slug>/state.json
if clarify is incomplete -> recommend $clarify <slug>
if clarify is ready -> recommend $plan-to-exec <slug>
if completion_confirmed or finish audit exists -> recommend $finish
otherwise -> no recommendation
```

- [ ] Update hook output vocabulary:

Remove:

```text
loopx runtime gates remain authoritative
implementation gate
approval
readiness
authorization
build context
review context
```

Use:

```text
loopx advisory state
next skill
spec artifact
repo specs/memory context
```

Run:

```bash
node --test test/trellis-hardening.test.mjs --test-name-pattern "workflow hook|claude workflow hook"
```

Expected before test rewrite: old hook tests fail because they expect `loopx build` or `loopx approve`.

---

## Task 7: Remove Build/Review Context Manifest Runtime Coupling

**Files:**
- Modify or delete: `src/context-manifest.mjs`
- Modify: `src/workspace-context.mjs` only if it points at removed manifests.
- Modify: tests in `test/trellis-hardening.test.mjs`
- Modify: docs that mention build/review manifests.

- [ ] Decide whether `context-manifest.mjs` still has a retained role.

Keep it only if it provides a generic context list for skill guidance. If retained, rename exported concepts away from build/review:

```text
contextManifestPath()
generateWorkflowContextManifest()
```

If there is no retained caller after Task 4 and Task 6, delete the file.

- [ ] Remove tests that validate:

```text
build context manifest
review context manifest
context manifest blocks build/review
build CLI accepts requirements snapshot path
review prompt helpers include context manifest references
```

- [ ] Keep or rewrite tests that validate repo specs/memory discovery, because that is still core to skill-first loopx.

Run:

```bash
rg "build context|review context|build-context|review-context|generateBuildContextManifest|generateReviewContextManifest" src test docs README.md README.zh-CN.md
```

Expected: no current product references remain, except historical release notes if intentionally left untouched.

---

## Task 8: Rewrite Tests Around The New Core

**Files:**
- Modify: `test/workflow.test.mjs`
- Modify: `test/trellis-hardening.test.mjs`
- Modify: `test/skill-governance.test.mjs`

- [ ] Keep install and skill governance coverage:

```text
postinstall bootstrap
install-skills target isolation
dry-run
postinstall opt-out
repair-install ownership behavior
doctor install state
bundled skill frontmatter/discovery
plugin mirror
```

- [ ] Keep context/setup coverage:

```text
setup-context
repo specs and memory discovery
doctor/status exposes context
managed agent guidance
```

- [ ] Keep init/clarify/status/next coverage:

```text
init creates workspace metadata
clarify creates spec artifact
deep clarify mode
status reports clarify blockers
next recommends $plan-to-exec when clarify is handoff-ready
```

- [ ] Keep finish audit coverage:

```text
finish-start
finish-audit
finish-record
baseline selection
change window evidence
candidate review before done recording
```

- [ ] Delete or rewrite every test whose purpose is old runtime orchestration:

```text
approveStage transitions
planStage planner loop
buildStage owner loop
reviewStage code/architecture runtime
archiveStage spec delta merge
autopilotStage
build stop hook
review rollback routing
build/review context manifest gating
requirement coverage blocking build
CLI plan/build/review/autopilot/archive
```

- [ ] After each deletion batch, run:

```bash
node --test test/workflow.test.mjs
node --test test/trellis-hardening.test.mjs
node --test test/skill-governance.test.mjs
```

Expected: failures should only point to removed behavior until all tests are rewritten.

---

## Task 9: Update Current Documentation And Specs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/loopx/design/loopx-skill-suite-v1-design.md`
- Modify: `docs/loopx/specs/installation.md`
- Modify: `templates/test-plan.md`
- Modify: current plans/specs only when they are treated as active guidance.

- [ ] Replace the product flow with:

```text
clarify -> spec? -> plan-to-exec -> (exec | subagent-exec) -> review/final-review -> fix-review? -> finish
```

This is a skill flow, not a loopx runtime stage machine.

- [ ] Remove docs that tell users or agents to run:

```text
loopx approve
loopx plan
loopx build
loopx review
loopx archive
loopx autopilot
```

- [ ] Update quick start:

```bash
loopx install-skills --target all --yes
loopx init --slug my-feature
loopx clarify my-feature
loopx next my-feature
```

Then explain that `next` returns a skill handoff, not a runtime command.

- [ ] Update artifacts documentation:

Keep:

```text
docs/loopx/design/
docs/loopx/plans/
docs/loopx/reviews/
docs/loopx/refactors/
docs/loopx/memory/
docs/loopx/specs/
.loopx/memory/
.loopx/finish/
```

Remove claims that `.loopx/workflows/<slug>/plan.md`, `execution-record.md`, and `review-report.md` are canonical runtime outputs.

- [ ] Add a short “Removed early runtime commands” release note for the next version.

Suggested file:

```text
docs/release-notes/0.4.0.md
```

Content should state that compatibility is intentionally not preserved because the project is early-stage.

---

## Task 10: Update Package Surface And Installer Governance

**Files:**
- Modify: `package.json`
- Modify: `src/install-discovery.mjs`
- Modify: `scripts/install-skills.mjs`
- Modify: `scripts/verify-skills.mjs`
- Modify: `plugins/loopx/scripts/plugin-install.mjs` only if it references deleted files.

- [ ] Remove deleted files from `package.json` `files`.

- [ ] Keep bundled skills unchanged even if a skill directly mentions old runtime commands. Skill content cleanup is explicitly out of scope for this plan.

- [ ] Update installer-managed hook list in `src/install-discovery.mjs` if `codex-stop-hook` was managed or packaged.

- [ ] Update `scripts/verify-skills.mjs` to fail on current non-skill docs exposing removed runtime commands.

Do not add or keep checks that require scanning these frozen paths for removed command strings:

```text
skills/
plugins/loopx/skills/
```

Run:

```bash
node scripts/verify-skills.mjs
npm pack --dry-run
```

Expected:

- skill verifier passes.
- packed file list does not include deleted runtime modules or deleted stop hook.

---

## Task 11: Final Dead-Code Sweep

**Files:**
- Whole repository.

- [ ] Run reference searches:

```bash
rg "approveStage|planStage|buildStage|reviewStage|archiveStage|autopilotStage" .
rg "loopx (approve|plan|build|review|archive|autopilot)" src scripts test README.md README.zh-CN.md docs package.json
rg "build-stop-gate|buildActive|evaluateBuildStopGate|codex-stop-hook" .
rg "createDefaultPlanAdapter|createScriptedPlanAdapter|createDefaultBuildAdapter|createScriptedBuildAdapter|createDefaultReviewAdapter|createScriptedReviewAdapter" .
rg "generateBuildContextManifest|generateReviewContextManifest|build-context|review-context" .
```

Expected:

- No current source, tests, README, script, package, or active design/spec docs reference removed runtime commands.
- `skills/` and `plugins/loopx/skills/` are excluded from this dead-code sweep and must remain unchanged.
- Historical release notes may mention removed commands only as historical changelog entries. If the project prefers a pristine repository search, rewrite or delete old release notes too.

- [ ] Run import validation:

```bash
node --check src/cli.mjs
for file in src/*.mjs scripts/*.mjs plugins/loopx/scripts/*.mjs; do node --check "$file"; done
```

Expected: all parse.

---

## Task 12: Full Verification

Run:

```bash
npm test
node src/cli.mjs --version
node src/cli.mjs
node src/cli.mjs install-skills --target all --dry-run
node src/cli.mjs init --slug smoke-clean-runtime --json
node src/cli.mjs clarify smoke-clean-runtime --json
node src/cli.mjs next smoke-clean-runtime
node src/cli.mjs status smoke-clean-runtime
node src/cli.mjs build smoke-clean-runtime
node src/cli.mjs approve smoke-clean-runtime --from clarify --to plan
node src/cli.mjs review smoke-clean-runtime
git diff -- skills plugins/loopx/skills
```

Expected:

- `npm test` passes.
- retained commands work.
- removed commands exit non-zero and do not mutate state.
- `next` recommends only skills, not runtime CLI commands.
- skill directories have no diff.

Clean generated smoke state before committing:

```bash
rm -rf .loopx/workflows/smoke-clean-runtime
```

---

## Risk Notes

- This is intentionally a breaking cleanup. Do not preserve aliases, hidden commands, or migration behavior for removed runtime commands.
- The largest blast radius is `src/workflow.mjs`; delete in batches and run tests frequently.
- The finish audit runtime should remain independent. It reads git evidence and optional workflow artifacts, but it must not require the deleted runtime state machine.
- The `$review` skill remains part of the bundled skill product. Do not modify any skill files just because the old `loopx review` command is removed.
- If requirement anchors/coverage are still valuable, move them into skill guidance or future generic context helpers. Do not keep build-gate code just to preserve those modules.

---

## Completion Definition

This cleanup is complete when:

- `loopx approve`, `loopx plan`, `loopx build`, `loopx review`, `loopx archive`, and `loopx autopilot` are gone from CLI behavior.
- The exported stage functions and runtime adapter modules are deleted.
- Hooks and `next` output only recommend skills or retained commands.
- Current docs describe loopx as a skill-first helper, not an owned build/review runtime.
- `npm test` passes with tests focused on the retained product surface.
- `git diff -- skills plugins/loopx/skills` is empty.

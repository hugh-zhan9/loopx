# Installation And CLI Onboarding Spec

This file records stable rules for installation, first-use CLI output, the
working agreement, and the published skill surface.

The installed docs-first surface has three canonical workflow intents:
`clarify`, `spec`, and `plan2exec`. They produce documents that define goals,
decisions, boundaries, and evidence. Execution belongs to the model and host;
`exec` is an optional host-native subagent playbook for one ready plan.

## Public CLI Surface

- Public commands are install-skills, init, clarify, render, status, setup-context, doctor, and repair-install.
- The CLI must not expose workflow routing, execution stages, readiness gates, review pipelines, or support-lens session switches.
- `loopx clarify` writes `clarification.md`, `requirements.md`, and a path-only `documents.json` index.
- `loopx status` reports document presence without recommending a next skill or action.

## Human And JSON Output

- `loopx init`, `loopx doctor`, and `loopx install-skills` default to concise human output.
- Full payloads require explicit `--json`.
- JSON output must not contain interactive prompt text.

## Installer Behavior

- `refactor-plan` owns optional refactoring audits and the scanner formerly
  shipped as `code-darwin`. `verify` is retired; evidence checks live in the
  working agreement and shared evidence contract. Retire both old entries
  using the same ownership, complete-content, known-layout and no-link checks
  as other protected retired skills. Preserve modified, foreign or unknown copies.
- `codebase-spec` remains independent. Use the requested scope and update existing
  current documentation rather than requiring a new full-repository document.
- `loopx install-skills --dry-run` is read-only.
- `--dir` is valid only with one target.
- Failed installs exit nonzero in human and JSON modes.
- Postinstall opt-outs are `LOOPX_SKIP_POSTINSTALL=1` and `LOOPX_POSTINSTALL=0`.
- `humanize-doc` is the single skill for readability assessment and document
  rewriting. It replaces `doc-readability`. During upgrades, remove a retired
  `doc-readability` copy only when its loopx ownership and full contents can be
  verified against the recorded installation. Preserve foreign, modified, or
  unknown copies; report skipped owned copies for manual reconciliation.
- `debug` is the single entry for failure diagnosis and requested repairs.
  It replaces `issue` and `fix`; do not install aliases for them. Apply the same
  ownership, content and link checks used for retired `doc-readability` copies
  before removing either old skill. Preserve modified or unknown copies and
  report owned copies that could not be removed.
- `clarify` and `spec` use the promoted v2 implementations under canonical names.
  Design review belongs to `spec`; plan review belongs to `plan2exec`. Retire
  `clarify-v2`, `spec-v2`, `design-review`, and `plan-reviewer` without aliases.
  Remove an old copy only with recorded loopx ownership, its exact known layout,
  a full matching installed-content hash and no links. Preserve and report
  modified or unknown owned copies; leave foreign copies alone.
- Shared skill contracts have per-file upgrade baselines. When upgrading an
  installation without those baselines, exact known pristine 0.8.9/0.9.0
  completion/evidence contracts may upgrade by their recorded content hashes.
  Different or unknown contents remain preserved and reported as conflicts.
- Shared-contract writes must not traverse a symbolic link at the shared root
  or an intermediate directory. Preserve those links and report a conflict
  instead of replacing files in the linked source or another user directory.

## Undo installed files

Remove loopx-managed user-level artifacts when uninstalling:

```bash
rm -rf ~/.agents/skills/{clarify,spec,codebase-spec,plan2exec,exec,design-review,plan-reviewer,clarify-v2,spec-v2,issue,fix,refactor-plan,code-darwin,tdd,debug,verify,using-git-worktrees,doc-readability,humanize-doc,maintain-project-docs,requirement-analyzer,go-style,kratos,api-designer,generate-api-docs,architecture-designer,sql-style,cli-developer,lancet,prompt-lint}
rm -rf ~/.claude/skills/{clarify,spec,codebase-spec,plan2exec,exec,design-review,plan-reviewer,clarify-v2,spec-v2,issue,fix,refactor-plan,code-darwin,tdd,debug,verify,using-git-worktrees,doc-readability,humanize-doc,maintain-project-docs,requirement-analyzer,go-style,kratos,api-designer,generate-api-docs,architecture-designer,sql-style,cli-developer,lancet,prompt-lint}
```

## Published Surface

- The npm package contains only runtime modules, public docs, templates, bundled skills, and plugin installation files.
- Benchmark runners, evaluation fixtures, traces, and governance-only scripts remain in the source repository.
- `lancet` is a discoverable support lens, not a runtime mode or stored preference.
- `prompt-lint` is a read-only support lens and never executes the checked prompt.
- `humanize-doc` supports assessment-only requests, targeted suggestions, and
  direct rewrites without changing product decisions or workflow state.
- Normal and plugin installs consume canonical skills from the package root.

## Diagnosis And Repair

Accepted by the user on 2026-09-14: merge `issue`, `debug` and `fix` into `debug`.
A diagnosis-only request ends with findings. A repair request authorizes the
agent to diagnose, make the supported change and verify it without another
handoff or permission request for the same scope. Missing behavior, scope or
permission decisions still stop the affected work.

Do not create an issue ledger by default. When the user supplies an existing
`.loopx/issues/*.md` ledger, preserve its scope, evidence and recovery records.
`debug` reads and maintains that record directly; no retired skill is needed.
A ledger status alone does not authorize a repair. Interrupted repairs still
require matching checkout contents and checkpoint evidence before resuming.
Do not invent a rejected hypothesis, claim an unobserved reproduction or add
defensive behavior to satisfy a document field. Execution and agent lifecycle
remain owned by the host; this change adds no workflow runtime.

## Design and plan changes

Accepted by the user on 2026-09-14: keep `clarify` and `spec` names and migrate the
v2 implementations into them. Keep overview and detailed design roles: the overview explains architecture and
flows; detail defines interfaces, fields and implementation constraints. An overview may explain necessary rationale; detail describes the current
implementation design, without mandatory alternatives or discussion history.
Accepted review changes update that design; a separate proposal is no longer required. Preserve overview-only decisions and history. Local corrections
need not fill both templates.
`refactor-plan` remains independent and can guide authorized implementation directly.

`plan2exec` owns plan review. Independent review is conditional on a user request
or a concrete destructive, compatibility, security, migration-ordering, or shared-
resource risk. Ordinary formatting is corrected without blocking. Recheck fixes
and affected content; do not restart review for routine edits. Already implemented
work is checked against source requirements and fresh verification instead of
being returned to pre-implementation review. A plan cannot weaken requirements or
defer acceptance without explicit authorization. Overall completed plan status is
`complete`; completed slices use `done`. These rules add no execution runtime.

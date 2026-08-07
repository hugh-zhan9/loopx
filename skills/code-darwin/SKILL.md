---
name: code-darwin
description: "Audits a repository for code rot, architecture smells, coupling, complexity hotspots, duplication, and prioritized safe refactor candidates using a bundled scanner. Not for feature work, forward design specs, or implementing refactors without an explicit approved finding."
when_to_use: "code-darwin, code smell, architecture smell, codebase rot, technical debt, coupling, complexity hotspot, duplication audit, refactor backlog, 代码腐化, 架构坏味道, 技术债"
metadata:
  version: "0.1.0"
---

# Code Darwin

## Purpose

Run a repeatable, evidence-backed audit of a growing codebase. Detect mechanical signals with the bundled script, inspect architecture and code-smell candidates, distinguish real defects from intentional design, and produce a small, prioritized refactoring backlog.

Default to read-only audit. Do not modify application code unless the user explicitly selects a finding and asks for implementation.

## Workflow

### 1. Establish scope

- Resolve the repository or subdirectory the user named.
- Read applicable `AGENTS.md` files, the README, build/test instructions, and relevant architecture or domain documents before judging the code.
- Check the working tree with `git status --short`. Preserve changes that predate this task.
- Exclude generated output, vendored dependencies, build artifacts, and caches from conclusions. Confirm the script's exclusions and add project-specific exclusions mentally when needed.
- If the user named a module or subsystem, keep the audit focused there. Otherwise start with recent change hotspots.
- If the user requests a focused review, use one or more profiles: `architecture`, `coupling`, `complexity`, `testing`, or `code`.

### 2. Collect deterministic signals

Run the bundled scanner from the skill directory:

```bash
python3 <skill-dir>/scripts/audit_codebase.py --root <repo-or-subdirectory> --format json --top 20
```

Use `--since` when the repository has a long history, and adjust `--min-duplicate-lines` only when the language or code style makes the default eight-line candidate too noisy. Use Markdown output for a human-readable snapshot:

```bash
python3 <skill-dir>/scripts/audit_codebase.py --root <repo> --format markdown --top 20
```

Treat the output as evidence, not as a verdict. The duplicate detector finds exact normalized text windows; it cannot establish that two blocks have the same business meaning. TODO/FIXME counts are lexical and can include strings, regular expressions, or documentation about those markers, so inspect the reported line before creating debt work.

For architecture, coupling, testing, and algorithmic checks, read [references/smell-patterns.md](references/smell-patterns.md) and run targeted searches over the scoped source. These checks are hypotheses: report the concrete path, operation, and consequence, not a smell name alone. Exclude generated, vendored, and intentionally mechanical code from conclusions.

### 3. Investigate candidates

For the highest-signal files and duplicate candidates:

- Read the complete relevant functions or modules, not only matching lines.
- Search for the same domain concept under different names and inspect all callers.
- Compare tests, error handling, transaction boundaries, authorization, and side effects.
- Use Git history to check whether the code changes for the same reasons and whether a proposed abstraction would have one owner.
- Look for an existing capability before proposing a new shared layer.
- Map package/module dependencies and check dependency direction, cycles, infrastructure leakage, global mutable state, and pass-through layers.
- Inspect module shape for mixed responsibilities, divergent change, shotgun surgery, feature envy, message chains, middle men, data clumps, primitive obsession, speculative abstractions, dead code, and naming that hides ownership.
- Inspect complexity candidates such as nested or pairwise loops, linear membership scans inside loops, sorting inside loops, N+1 I/O, repeated expensive recomputation, render-path recomputation, and data structures mismatched to access patterns. Verify input sizes, cold-path status, ordering, duplicates, authorization, pagination, and error semantics before recommending a change.
- Inspect testing health for untested business paths, tests coupled to implementation details, uncontrolled clock/filesystem/network/database dependencies, and missing characterization tests around proposed refactors.
- Compare observed architecture with the repository's documented architecture. Do not label a project a "big ball of mud," "anemic domain model," or "over-engineered" from directory names or line counts alone.

Classify each candidate as one of:

- **Stable reuse**: same responsibility, same invariants, and same reason to change. A shared module may be appropriate.
- **Accidental similarity**: syntax looks alike but policy or change cadence differs. Keep implementations separate.
- **Missing capability**: several callers need one stable domain or technical capability that does not yet have a clear owner.
- **Boundary friction**: coupling, dependency direction, or a shallow wrapper spreads change across modules.
- **Stale code**: dead paths, obsolete flags, TODO/FIXME markers, or unused compatibility code that should be removed or explicitly owned.
- **Architecture friction**: dependency direction, boundary, or deployment coupling makes a change cross unrelated owners.
- **Complexity hotspot**: measured or clearly bounded work grows with input size or repeats avoidable I/O; quantify the current and proposed complexity only when the code supports it.
- **Testability gap**: behavior lacks a stable public seam or the test environment hides regressions.

Read [references/governance-rules.md](references/governance-rules.md) when deciding whether a candidate deserves extraction or deletion.

### 4. Rank the backlog

Rank findings by the combination of:

- change frequency;
- blast radius when behavior changes;
- defect or inconsistency risk;
- confidence that the proposed abstraction is semantically correct;
- cost and reversibility of the refactor.

Do not rank by line count alone. A short duplicated authorization rule is usually more urgent than a large stable generated file.

Report no more than five top candidates unless the user asks for a full inventory. For each candidate include:

| Field | Required content |
| --- | --- |
| Priority | High, medium, or low, with one-sentence rationale |
| Evidence | File paths, line numbers, scanner signal, and relevant Git evidence |
| Rot pattern | Duplication, hotspot, coupling, cohesion, architecture, complexity, testing, stale code, oversized module, or mixed |
| Recommendation | Extract, consolidate, delete, split, constrain, or leave separate |
| Boundary | Proposed owner and the narrow interface or responsibility |
| Risk | Behavior, compatibility, migration, or test gap |
| Next step | The smallest verifiable action |

Also list rejected extraction candidates. Explaining why similar code should remain separate prevents future rework.

When the user asks for a full inventory, group findings by architecture, coupling/cohesion, design, code, testing, and complexity. Keep the prioritized backlog separate from the inventory so a long catalog does not imply that every item deserves immediate work. Do not fabricate health scores, coverage percentages, severity counts, or runtime benchmarks that were not measured.

### 5. Execute only an approved refactor

When the user selects a finding and asks for implementation:

1. Confirm the target files and current working-tree state.
2. Add or strengthen behavior-level characterization tests at the highest useful interface.
3. Make one small behavior-preserving change at a time.
4. Extract only the stable responsibility. Do not create a generic `common`, `utils`, or `BaseService` dumping ground.
5. Migrate every caller, remove the superseded implementation, and keep ownership explicit.
6. Run the narrowest relevant tests first, then the project's normal lint, build, and test commands.
7. Report changed files, deleted duplication, verification commands, and residual risk.

Never make code changes during `audit` or `propose` work. Do not perform broad formatting, unrelated cleanup, dependency upgrades, or destructive migrations as part of a rot finding.

### 6. Prevent recurrence

Recommend lightweight controls that match the finding:

- dependency-direction or architecture tests for module boundaries;
- duplication and complexity thresholds in CI, with generated/vendor exclusions;
- code-review checks for existing capabilities and semantic duplication;
- ownership and contract documentation for shared modules;
- a small recurring refactoring budget and a prioritized debt ledger;
- tests that describe behavior through public interfaces and survive internal refactors.

## Report quality bar

Every conclusion must separate measured evidence from engineering judgment. State when a signal is incomplete, when tests are missing, and when an abstraction is speculative. Prefer one high-confidence, reversible improvement over a catalog of theoretical cleanups.

For behavior-preserving cleanup planning after this audit, hand selected candidates to `refactor-plan`. For deeper module-shape or interface design work, hand the selected candidate to `architecture-designer` rather than expanding this skill into a general architecture review.

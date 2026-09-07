---
name: code-darwin
description: "Audits a repository for code rot, architecture smells, coupling, complexity hotspots, duplication, and prioritized safe refactor candidates using a bundled scanner. Not for feature work, forward design specs, or implementing refactors without an explicit approved finding."
when_to_use: "code-darwin, code smell, architecture smell, codebase rot, technical debt, coupling, complexity hotspot, duplication audit, refactor backlog, 代码腐化, 架构坏味道, 技术债"
metadata:
  version: "0.1.1"
---

# Code Darwin

Audit code rot, duplication, coupling, complexity, and testability with repeatable
signals and source evidence. Default to read-only audit. Implementation requires
an explicit refactor request covering the finding; a smell report alone does not
authorize code changes, dependency upgrades, or a recurring governance process.

## Scope and collect

Read applicable guidance, relevant architecture, test instructions, and worktree
state. Honor the named module or review profile (`architecture`, `coupling`,
`complexity`, `testing`, `code`). For a repository-wide request, map the repository
and prioritize hotspots while disclosing coverage; do not equate recent changes
with a complete audit.

Run the bundled scanner, resolving `<skill-dir>` from this skill's location:

```bash
python3 "<skill-dir>/scripts/audit_codebase.py" --root "<repo-or-subdirectory>" --format json --top 20
```

Use `--format markdown` for a requested human snapshot. Use `--since` for a chosen
history window; adjust `--min-duplicate-lines` only when the default eight-line
window is unsuitable. Check generated/vendor/cache exclusions and ignore any
remaining irrelevant matches during interpretation.

The duplicate detector finds normalized text windows, not shared business meaning.
TODO/FIXME matches are lexical and may be strings or examples. Line counts and Git
touch counts identify candidates, not architectural defects or measured performance.

## Investigate before recommending

Read [smell-patterns.md](references/smell-patterns.md) for the relevant profile and
[governance-rules.md](references/governance-rules.md) for extraction/deletion decisions.
Inspect complete functions, callers, tests, and relevant Git history for candidates.

- Compare responsibility, invariants, errors, authorization, transactions, side
  effects, change cadence, and ownership before proposing shared code.
- Check dependency direction, cycles, mutable state, infrastructure leakage, and
  pass-through layers against the documented architecture.
- For complexity candidates, establish input bounds and actual I/O or repeated
  work. Preserve ordering, duplicates, permissions, pagination, and error semantics.
- Inspect public test seams and uncontrolled clock/filesystem/network dependencies
  around proposed changes. Separate missing evidence from a demonstrated defect.

Classify candidates as stable reuse, accidental similarity, missing capability,
boundary/architecture friction, stale code, complexity hotspot, or testability gap.
Leave similar-looking code separate when policy, lifecycle, or ownership differs.
Do not infer a bad architecture from folder names or impose a generic `utils` layer.

## Deliver the audit

Rank by change frequency, blast radius, defect risk, confidence, and repair cost.
Default to the five highest-signal findings, fewer if warranted; honor full-inventory
requests and keep their priority list distinct from the catalog.

For each finding give priority/rationale, concrete evidence, pattern, recommended
change or leave-separate decision, proposed boundary/owner, risk, and the smallest
verifiable next action. Explain rejected extractions when they clarify a likely
misinterpretation. Separate measured facts from judgment; no invented health
scores, coverage percentages, benchmarks, or severity totals.

Suggest preventive controls only when tied to a finding or requested by the user;
do not add CI thresholds, debt ledgers, or recurring budgets by default.

## Authorized implementation

When the request already selects a finding for repair, preserve that authorization.
Inspect the current baseline, establish characterization evidence, make bounded
behavior-preserving changes, migrate affected callers, and verify with project
checks. Do not expand into unrelated formatting or redesign. Use `refactor-plan`
for a requested persistent refactor plan and `architecture-designer` only when a
real boundary decision emerges.

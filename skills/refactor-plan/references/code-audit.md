# Find worthwhile refactors

Honor the named repository, module, or concern: architecture, coupling, complexity,
testability, or code duplication. For a broad audit, map the repository and state
the inspected coverage. Recent changes alone do not represent a complete audit.

## Optional scanner

When file size, repeated text or change history can help select candidates, run
the bundled scanner. Resolve `<skill-dir>` from the `refactor-plan` installation:

```bash
python3 "<skill-dir>/scripts/audit_codebase.py" --root "<repo-or-subdirectory>" --format json --top 20
```

Use `--format markdown` for a readable snapshot and `--since` for a requested
history window. Change `--min-duplicate-lines` only when the default eight-line
window is unsuitable. Check generated, vendor and cache exclusions; discard
irrelevant matches. A focused review can inspect its functions and callers
directly without running this scanner.

The scanner finds normalized text windows, large files, TODO/FIXME text and Git
touch counts. It does not establish shared business meaning, dependency cycles,
architectural defects or measured performance. A marker can be an example or a
string. Confirm the code before recommending a change.

## Investigate candidates

Use [smell-patterns.md](smell-patterns.md) for the relevant concern and
[governance-rules.md](governance-rules.md) for extraction or deletion decisions.
Read complete functions, callers, tests and relevant change history.

- Compare responsibility, invariants, errors, permissions, transactions, side
  effects, ownership and reasons for change before proposing shared code.
- Trace actual dependencies, shared mutable state and boundary crossings; folder
  names or disjoint paths do not establish a good or bad architecture.
- For complexity or I/O findings, establish realistic input sizes and repeated
  work. Preserve ordering, duplicates, pagination and failure behavior.
- Inspect how affected behavior can be tested. Separate an evidence gap from a
  demonstrated defect; similar code may need to remain separate.

## Report only supported findings

Prioritize by change frequency, failure impact, defect risk, confidence and repair
cost. Usually report at most five useful findings; honor a full-inventory request.
For each, explain the problem, source evidence, impact, proposed scope and smallest
verifiable next action. Explain why similar code should stay separate when useful.
Do not invent scores, coverage percentages, benchmarks or findings to fill a list.

An audit-only request ends here with findings and coverage limits. Do not create
plans, CI thresholds, debt ledgers or recurring reviews by default. When the user
asks for a plan or authorizes a selected refactor, continue within that scope using
the [refactor guidance](../SKILL.md); preserve existing authorization and behavior.

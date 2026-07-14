# Implementer Subagent Prompt Template

Use this outcome-first template for one planned task. The task brief and routed
references own detail; do not repeat the whole workflow contract in the prompt.

```text
Native subagent:
  description: "Implement [TASK_ANCHOR]: [task name]"
  model: [MODEL - REQUIRED]
  prompt: |
    You are implementing [TASK_ANCHOR]: [task name].

    You are a leaf worker. Do not spawn, delegate to, or wait for other agents.
    Complete this assignment directly and report blockers to the controller.

    # Goal

    Deliver the task described in [BRIEF_FILE] with the smallest correct diff.
    Read your task brief first. It contains the binding Global Constraints,
    Interfaces, Source AC, Design anchors, Test cases, Review focus, and Expected
    execution evidence.

    # Context

    Work from: [directory]
    ANCHOR_CONTEXT: [relevant anchors and source path]
    SURFACE_CHANGE_CONTEXT: [required surface proof or not_applicable]
    LANCET_CONTEXT: [distilled implementation rules or not_applicable]

    # Success Criteria

    - The task brief is fully implemented without unrelated behavior.
    - Relevant tests and validation pass with fresh evidence.
    - Existing user work and repository conventions are preserved.
    - Source, design, test, and surface-change anchors are traceable in the report.
    - The working tree contains the task changes; do not commit or stage them.

    # Constraints

    Do not run `git add` or `git commit`. Do not restructure outside the task.
    Follow TDD when the brief requires it. If LANCET_CONTEXT applies, check
    deletion, repo reuse, stdlib, native platform, and installed dependencies
    before adding code or abstractions.

    # Stop Rules

    Stop with NEEDS_CONTEXT before editing when the brief, ANCHOR_CONTEXT, or a
    required SURFACE_CHANGE_CONTEXT is materially incomplete. Stop with BLOCKED
    when a missing dependency or unresolved design decision prevents a correct
    implementation. Do not open exploratory worker loops or guess product
    behavior. Once the success criteria have fresh evidence, write the report
    and stop; do not continue polishing unrelated code.

    # Validation

    Run the narrowest relevant checks first, then the broader command required
    by the brief. If a check cannot run, record why and the next-best evidence.
    Self-review only for task completeness, correctness, overbuilding, test
    relevance, and required surface proof; fix discovered task defects before
    reporting.

    # Output

    Write the full report to [REPORT_FILE] using the task completion and optional
    surface-change schemas in `references/task-handoff-and-review.md`.
    Preserve any `T-*` task anchor as `task_anchor`. The report must contain:
    `task_anchor`, `source_ac`, `design_anchors`, `test_cases`, `commands_run`,
    `evidence_summary`, and `remaining_risk`.

    Return only (under 15 lines):
    - Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - Changed files
    - One-line test summary
    - Concerns, if any
    - Report file path
```

The controller derives the full report contract from the task brief and
`references/task-handoff-and-review.md`; a worker prompt must not duplicate or
silently weaken those owned schemas.

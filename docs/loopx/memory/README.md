# Shared Memory

`docs/loopx/memory/` is git-tracked shared memory for lightweight project knowledge that should follow a user across machines, but is not stable enough to become a spec.

Use shared memory for concise, evidence-backed notes such as:

- recurring project-specific pitfalls
- agent handoff details that remain useful across sessions
- personal or team working conventions that are not yet formal rules
- context that helps avoid repeated investigation

Do not use shared memory for:

- temporary runtime state
- raw conversation logs
- secrets, credentials, or machine-local paths
- stable workflow, API, migration, testing, or compatibility rules that belong in `docs/loopx/specs/`

Memory layers:

- `.loopx/memory/`: local memory, not tracked by git
- `docs/loopx/memory/`: shared memory, tracked by git
- `docs/loopx/specs/`: stable team rules, tracked by git

Promote shared memory to `docs/loopx/specs/` when it becomes a durable rule that planning or review should depend on.

# Plan Schema Contract

Every plan has Source, Goal, Architecture, Tech Stack, Support lenses, Global
Constraints, Internal Plan Review, tasks, verification, and execution handoff.

Every task uses `### T-NNN / Task N: <name>` and records exact files,
interfaces, Source AC, Design anchors, Test cases, expected execution evidence,
review focus, support lenses, and verification steps. Evidence follows
`../../shared/evidence-contract.md`.

Tasks do not commit or stage. Single plans commit once after all tasks and
reviews; packages commit once per reviewed child plan.


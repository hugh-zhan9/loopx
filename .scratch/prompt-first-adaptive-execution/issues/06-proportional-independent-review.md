# 06 — Select independent review proportionally

**What to build:** Keep fresh verification universal while replacing mandatory per-task and final-review ceremonies with an integration check plus independent review only when observable risk or explicit user intent requires it.

**Blocked by:** 04 — Run adaptive concurrency in a clean workspace.

**Status:** complete

- [x] Every worker verifies its outcome, and the controller validates scope, evidence, and combined behavior.
- [x] Low-risk disjoint worker results with passing combined verification do not dispatch one reviewer per task.
- [x] Explicit review, security-sensitive or destructive behavior, public compatibility changes, cross-task interaction, and reconciled conflicts require independent review.
- [x] Multi-agent execution by itself is not an independent-review trigger.
- [x] Critical and important findings are fixed and reverified in the active execution context.
- [x] Old final-review and review-fix names preserve explicit intent by forwarding to the canonical review behavior without requiring legacy report artifacts.

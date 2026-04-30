# Deep Interview Summary: codex-helper product

## Topic

Define `codex-helper` as an independent workflow product and freeze the V1 requirements before planning.

## Final Ambiguity Assessment

- Profile: standard
- Outcome: sufficiently clear for planning
- Remaining ambiguity: low and implementation-shaped, not product-shaped

## Key Answers

### Product goal

For Codex CLI users in day-to-day feature development, `codex-helper` uses the workflow:

`clarify -> plan -> build/team -> review`

plus one corresponding skill per stage to reduce requirement drift and unstable implementation, and must be clearly better than a simple prompt-only workflow.

### V1 non-goals

- No compatibility layer or alias mapping to other workflow products
- No deep IDE / GitHub / CI integration
- No enterprise permissions, approvals, or multi-person governance
- No project-management features such as boards, scheduling, or reporting
- No generic review platform beyond the product's own `review` stage
- No attempt to auto-fix every implementation problem

### Hard acceptance requirements

- `clarify` must not allow transition to `plan` with unresolved ambiguity
- `clarify` must output a structured spec, not ordinary chat text
- `plan` must output a complete document package
- `build/team` must follow plan artifacts instead of improvising
- `build/team` must leave multiple fine-grained verification records
- `review` must be independent of `build/team`
- The workflow must feel more stable than simple prompt-only usage
- The user must always know the current stage and what is missing

### Decision boundaries

These decisions require user confirmation:

- whether to enter the next stage
- whether to choose `build` or `team`
- whether to roll back to a previous stage
- how to proceed after `review` fails

The system may provide recommendations, but may not silently decide those points.

### Team V1 requirements

- `team` is mandatory in V1
- `team` must include real parallel multi-agent execution
- `team` must include leader / worker structure
- `team` must include tmux / worktree runtime
- `team` must include task dispatch and result aggregation
- `team` must include independent verification

### Minimum team shape

- minimum topology: `leader + 2 workers + 1 verifier`
- worker count may increase based on task decomposition
- preferred upper bound: no more than `5` workers

### Required delivery from `team`

- code result
- build/team execution record
- verification result
- review input material
- if execution fails, rollback recommendation back to `plan`

## Readiness

This interview is ready to hand off to planning.

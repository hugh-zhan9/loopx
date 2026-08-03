# Stale Archive Hook Guidance

Type: pitfall
Domain: workflow hooks
Date: 2026-06-09

When removing a public workflow command, update generated guidance and also filter persisted runtime guidance. Old `.loopx/workflows/*/state.json` files can keep `recommended_next_action` text that outlives the current product flow.

Evidence from `5285f99..1f11966`:

- `scripts/codex-workflow-hook.mjs` and `scripts/claude-workflow-hook.mjs` now suppress stale `loopx archive` and `$archive` recommendations.
- Done/archive/completed stale archive recommendations map to `$finish`.
- Approved review stale archive recommendations map to `loopx approve <slug> --from review --to done`.
- `test/trellis-hardening.test.mjs` covers both stale done and stale approved-review hook states.


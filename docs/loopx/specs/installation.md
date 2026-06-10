# Installation And CLI Onboarding Spec

This file records stable loopx product-surface rules for first-use CLI output, installer behavior, hook guidance, and packaged skill scope.

## Human And JSON Output

- `loopx --help` must start with a short quickstart path: install skills, init, clarify, status.
- `loopx init`, `loopx doctor`, and `loopx install-skills` default to concise human output.
- Full runtime payloads require explicit `--json`.
- Commands in `--json` mode must not print interactive prompt text into stdout.

## Archive Compatibility

- `archive` is hidden compatibility, not part of the public v1 product flow.
- Default help, README public command lists, next-step helpers, and workflow hooks must not recommend `loopx archive` or `$archive`.
- If old persisted runtime state contains archive recommendations, hooks must replace them:
  - done/archive/completed state -> `$finish`
  - approved review state -> `loopx approve <slug> --from review --to done`

## Installer Behavior

- `loopx install-skills --dry-run` is read-only. It must not write skills, hooks, lock files, settings, or template hashes.
- All-target dry-run summaries must render the follow-up command as `loopx install-skills --target all --yes`.
- `--dir` is valid only with a single target. `--target all --dir <path>` must fail before writing files.
- `loopx install-skills` must exit nonzero whenever its final payload has `ok: false`, in both human and JSON modes.
- Postinstall opt-outs are `LOOPX_SKIP_POSTINSTALL=1` and `LOOPX_POSTINSTALL=0`.
- Postinstall opt-out with `--json` must preserve JSON stdout.

## Published Skill Surface

- The package root `skills/` surface is exactly `skills/RESOLVER.md` plus the directories in `LOOPX_BUNDLED_SKILLS`.
- Auxiliary root skill sources must not be published by explicit or broad `package.json.files` entries.
- `scripts/verify-skills.mjs` and the package governance tests are the release gates for this surface.

# Installation And CLI Onboarding Spec

This file records stable loopx product-surface rules for first-use CLI output, installer behavior, working-agreement guidance, and packaged skill scope.

Installed skills expose only the current contract. Existing pre-v2 running
`.loopx` state is not migrated and must restart.

The installed prompt-first surface has three canonical workflow intents:
`clarify`, `spec`, and `plan2exec`. They produce documents. Execution, review,
verification, and Git disposition are governed by the installed working
agreement and use host-native model capabilities.

## Public CLI Surface

- `loopx --help` must start with a short quickstart path: install skills, init, clarify, status.
- Public commands are install, init, clarify, render, status, next, setup-context, lancet, doctor, and repair-install.
- Public `lancet` controls are `loopx lancet on`, `loopx lancet off`, and `loopx lancet status`.
- Removed early runtime commands must not appear in current public docs, default help, next-step helpers, or installer guidance.
- `loopx next` returns a skill handoff, not a runtime command handoff.
- `loopx clarify` writes local runtime intake packages under `.loopx/intake/YYYY-MM-DD-<slug>/`; `loopx status --json` exposes `intake_package_path`, `requirements_path`, and `clarification_path`, with `spec_artifact_path` pointing to `requirements_path` for compatibility.

## Human And JSON Output

- `loopx init`, `loopx doctor`, and `loopx install-skills` default to concise human output.
- Full runtime payloads require explicit `--json`.
- Commands in `--json` mode must not print interactive prompt text into stdout.

## Installer Behavior

- `loopx install-skills --dry-run` is read-only. It must not write skills, guidance, lock files, settings, or template hashes.
- All-target dry-run summaries must render the follow-up command as `loopx install-skills --target all --yes`.
- `--dir` is valid only with a single target. `--target all --dir <path>` must fail before writing files.
- `loopx install-skills` must exit nonzero whenever its final payload has `ok: false`, in both human and JSON modes.
- Postinstall opt-outs are `LOOPX_SKIP_POSTINSTALL=1` and `LOOPX_POSTINSTALL=0`.
- Postinstall opt-out with `--json` must preserve JSON stdout.

## Uninstalling User-Level Artifacts

Undo installed files when you want to remove loopx-managed user-level artifacts:

```bash
rm -rf ~/.agents/skills/{clarify,spec,codebase-spec,plan2exec,plan-reviewer,issue,fix,refactor-plan,tdd,debug,verify,using-git-worktrees,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer,lancet}
rm -rf ~/.claude/skills/{clarify,spec,codebase-spec,plan2exec,plan-reviewer,issue,fix,refactor-plan,tdd,debug,verify,using-git-worktrees,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer,lancet}
rm -f ~/.codex/hooks/codex-workflow-hook.mjs ~/.claude/hooks/loopx-workflow-hook.mjs
rm -rf ~/.loopx/lancet
```

## Published Skill Surface

- The package root `skills/` surface is exactly `skills/RESOLVER.md` plus the directories in `LOOPX_BUNDLED_SKILLS`.
- Normal installs and plugin installs both consume bundled skills from the package root `skills/` source.
- Removed lifecycle wrappers, host-specific scheduler runtimes, legacy reviewer templates, and finish gates must not be published.
- `lancet` is bundled in the package skill surface as a support lens.
- `lancet` user defaults and session state live under `~/.loopx/lancet/`.
- `LOOPX_LANCET` remains a preference for compatible host tooling; v0.8 installs no per-turn hook.
- Auxiliary root skill sources must not be published by explicit or broad `package.json.files` entries.
- `scripts/verify-skills.mjs` and the package governance tests are the release gates for this surface.

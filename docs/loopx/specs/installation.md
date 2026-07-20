# Installation And CLI Onboarding Spec

This file records stable loopx product-surface rules for first-use CLI output, installer behavior, hook guidance, and packaged skill scope.

Installed skills expose only the v2 current contract. Existing pre-v2 running
`.loopx` state is not migrated and must restart. Agent lifecycle is
controller-only: workers dispatched by loopx skills are leaf workers.

The installed prompt-first surface has six canonical workflow intents:
`clarify`, `spec`, `plan`, `exec`, `review`, and `finish`. The explicit-only
compatibility aliases `plan-to-exec`, `subagent-exec`,
`parallel-subagent-exec`, `final-review`, and `fix-review` remain installed for
one release but are excluded from automatic routing.

## Public CLI Surface

- `loopx --help` must start with a short quickstart path: install skills, init, clarify, status.
- Public commands are install, init, clarify, render, status, next, setup-context, lancet, doctor, and repair-install.
- Public `lancet` controls are `loopx lancet on`, `loopx lancet off`, and `loopx lancet status`.
- Removed early runtime commands must not appear in current public docs, default help, next-step helpers, workflow hooks, or installer guidance.
- `loopx next` returns a skill handoff, not a runtime command handoff.
- `loopx clarify` writes local runtime intake packages under `.loopx/intake/YYYY-MM-DD-<slug>/`; `loopx status --json` exposes `intake_package_path`, `requirements_path`, and `clarification_path`, with `spec_artifact_path` pointing to `requirements_path` for compatibility.

## Human And JSON Output

- `loopx init`, `loopx doctor`, and `loopx install-skills` default to concise human output.
- Full runtime payloads require explicit `--json`.
- Commands in `--json` mode must not print interactive prompt text into stdout.

## Installer Behavior

- `loopx install-skills --dry-run` is read-only. It must not write skills, hooks, lock files, settings, or template hashes.
- All-target dry-run summaries must render the follow-up command as `loopx install-skills --target all --yes`.
- `--dir` is valid only with a single target. `--target all --dir <path>` must fail before writing files.
- `loopx install-skills` must exit nonzero whenever its final payload has `ok: false`, in both human and JSON modes.
- Postinstall opt-outs are `LOOPX_SKIP_POSTINSTALL=1` and `LOOPX_POSTINSTALL=0`.
- Postinstall opt-out with `--json` must preserve JSON stdout.

## Uninstalling User-Level Artifacts

Undo installed files when you want to remove loopx-managed user-level artifacts:

Compatibility aliases are installed only so existing explicit invocations can
forward to canonical intents. Installation does not add them to automatic
routing.

```bash
rm -rf ~/.agents/skills/{clarify,spec,codebase-spec,plan-to-exec,plan-reviewer,subagent-exec,parallel-subagent-exec,exec,review,final-review,fix-review,finish,issue,fix,refactor-plan,tdd,debug,verify,using-git-worktrees,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer,lancet}
rm -rf ~/.claude/skills/{clarify,spec,codebase-spec,plan-to-exec,plan-reviewer,subagent-exec,parallel-subagent-exec,exec,review,final-review,fix-review,finish,issue,fix,refactor-plan,tdd,debug,verify,using-git-worktrees,doc-readability,requirement-analyzer,go-style,kratos,api-designer,architecture-designer,sql-style,cli-developer,lancet}
rm -f ~/.codex/hooks/codex-workflow-hook.mjs ~/.claude/hooks/loopx-workflow-hook.mjs
rm -rf ~/.loopx/lancet
```

## Published Skill Surface

- The package root `skills/` surface is exactly `skills/RESOLVER.md` plus the directories in `LOOPX_BUNDLED_SKILLS`.
- Normal installs and plugin installs both consume bundled skills from the package root `skills/` source.
- Compatibility alias directories contain only their forwarding `SKILL.md` files.
- Removed lifecycle wrappers, strict scheduler contracts, reviewer templates, and finish gates must not be published.
- `lancet` is bundled in the package skill surface. Automatic `lancet` activation is Codex-only in this release.
- `lancet` user defaults and session state live under `~/.loopx/lancet/`.
- `LOOPX_LANCET=0` disables automatic `lancet` guidance for the current process; `LOOPX_LANCET=1` enables it.
- Auxiliary root skill sources must not be published by explicit or broad `package.json.files` entries.
- `scripts/verify-skills.mjs` and the package governance tests are the release gates for this surface.

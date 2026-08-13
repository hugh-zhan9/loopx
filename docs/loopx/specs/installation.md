# Installation And CLI Onboarding Spec

This file records stable rules for installation, first-use CLI output, the
working agreement, and the published skill surface.

The installed docs-first surface has three canonical workflow intents:
`clarify`, `spec`, and `plan2exec`. They produce documents that define goals,
decisions, boundaries, and evidence. Execution belongs to the model and host.

## Public CLI Surface

- Public commands are install-skills, init, clarify, render, status, setup-context, doctor, and repair-install.
- The CLI must not expose workflow routing, execution stages, readiness gates, review pipelines, or support-lens session switches.
- `loopx clarify` writes `clarification.md`, `requirements.md`, and a path-only `documents.json` index.
- `loopx status` reports document presence without recommending a next skill or action.

## Human And JSON Output

- `loopx init`, `loopx doctor`, and `loopx install-skills` default to concise human output.
- Full payloads require explicit `--json`.
- JSON output must not contain interactive prompt text.

## Installer Behavior

- `loopx install-skills --dry-run` is read-only.
- `--dir` is valid only with one target.
- Failed installs exit nonzero in human and JSON modes.
- Postinstall opt-outs are `LOOPX_SKIP_POSTINSTALL=1` and `LOOPX_POSTINSTALL=0`.

## Undo installed files

Remove loopx-managed user-level artifacts when uninstalling:

```bash
rm -rf ~/.agents/skills/{clarify,spec,codebase-spec,plan2exec,plan-reviewer,issue,fix,refactor-plan,code-darwin,tdd,debug,verify,using-git-worktrees,doc-readability,humanize-doc,maintain-project-docs,requirement-analyzer,go-style,kratos,api-designer,generate-api-docs,architecture-designer,sql-style,cli-developer,lancet,prompt-lint}
rm -rf ~/.claude/skills/{clarify,spec,codebase-spec,plan2exec,plan-reviewer,issue,fix,refactor-plan,code-darwin,tdd,debug,verify,using-git-worktrees,doc-readability,humanize-doc,maintain-project-docs,requirement-analyzer,go-style,kratos,api-designer,generate-api-docs,architecture-designer,sql-style,cli-developer,lancet,prompt-lint}
```

## Published Surface

- The npm package contains only runtime modules, public docs, templates, bundled skills, and plugin installation files.
- Benchmark runners, evaluation fixtures, traces, and governance-only scripts remain in the source repository.
- `lancet` is a discoverable support lens, not a runtime mode or stored preference.
- `prompt-lint` is a read-only support lens and never executes the checked prompt.
- Normal and plugin installs consume canonical skills from the package root.

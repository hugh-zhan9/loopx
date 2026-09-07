---
name: cli-developer
description: "Applies loopx CLI design discipline for commands, flags, human and JSON output, errors, interactivity, help text, shell behavior, and cross-platform UX. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "cli-developer, CLI, command design, flags, JSON output, stdout stderr, interactive prompt, help text, shell completion, 命令行"
license: MIT
metadata:
  version: "0.3.10"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/cli-developer
  maintained_by: loopx
---

# CLI Developer

Use this support lens for command design, implementation, or review inside the
requested task. It does not create workflow state or replace `spec` for durable
public-contract decisions. Read existing commands, callers, framework conventions,
and repository instructions before proposing a new interface or dependency.

## Public contract

Treat command names, flags, arguments, configuration precedence, JSON schemas,
exit codes, and stdout/stderr behavior as public API when callers can script them.
Preserve existing contracts unless the task explicitly changes them with the
required compatibility decision. Investigate unresolved behavior before finalizing
it; local wording choices do not require a new design workflow.

Use stable names, early input validation, actionable errors, and useful `--help`.
Keep `--version` where the public package or project convention requires it.
Deprecate existing interfaces deliberately rather than hiding changes behind aliases.

## Output and terminal behavior

- Keep stdout for requested results and stderr for diagnostics, logs, prompts,
  and progress. Machine output must remain parseable on success and failure.
- Preserve the repository's human/machine output contract. For **loopx**, human
  output is the first-use default and complete runtime payloads require explicit
  `--json`. Do not impose that policy on tools with an established machine default.
- In JSON mode, keep stable machine fields and structured errors; separate
  human display text from values that callers use for branching.
- Respect the project's TTY, CI, color-forcing, and non-interactive conventions.
  No mandatory prompts in package-manager scripts, hooks, CI, or non-TTY runs.
  Supply required inputs through flags/config or fail with an actionable error.
- Destructive prompts explain the exact consequence. Honor explicit non-interactive
  authorization without turning a convenience flag into permission for extra actions.
- Handle interruption according to the operation's ownership and recovery contract;
  do not delete unrelated state as cleanup.

## Installation and portability

Preserve canonical package-root sources and install provenance. Do not overwrite
user-edited installed skill copies or write unrequested runtime artifacts into the
repository. Inspect postinstall behavior and keep onboarding non-interactive-safe.

Use platform path APIs for filesystem paths and the appropriate literal syntax for
URLs or protocol paths. Quote shell examples and identify their supported shell;
do not present Bash-specific commands as portable across zsh, fish, or PowerShell.
Offer completions when useful and maintainable for the distribution, not for every
internal command.

Keep startup work proportional: parse arguments before expensive scans or network
work where possible. Measure startup or streaming improvements before claiming them.

## References

Load only the relevant framework or UX guidance; preserve project dependencies:

| Topic | Reference |
| --- | --- |
| Commands, flags, configuration | [design-patterns.md](references/design-patterns.md) |
| Node.js | [node-cli.md](references/node-cli.md) |
| Python | [python-cli.md](references/python-cli.md) |
| Go | [go-cli.md](references/go-cli.md) |
| Prompts, progress, help | [ux-patterns.md](references/ux-patterns.md) |

## Verify and deliver

For changed command behavior, exercise relevant help/version, success, invalid
input, machine-output, piped/non-TTY, and interruption paths, plus required project
checks. A design discussion reports proposed behavior and its validation needs;
it does not claim those invocations ran.

Deliver the requested decision, change, or findings with applicable command/output/
configuration contracts, compatibility impact, and actual verification. A local
flag review does not require a complete CLI redesign or a fixed output checklist.

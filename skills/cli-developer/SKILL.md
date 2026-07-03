---
name: cli-developer
description: "Applies loopx CLI design discipline for commands, flags, human and JSON output, errors, interactivity, help text, shell behavior, and cross-platform UX. Not for replacing clarify, spec, implementation planning, code review, or workflow state transitions."
when_to_use: "cli-developer, CLI, command design, flags, JSON output, stdout stderr, interactive prompt, help text, shell completion, 命令行"
license: MIT
metadata:
  version: "0.3.4"
  forked_from: https://github.com/Jeffallan/claude-skills/tree/main/skills/cli-developer
  maintained_by: loopx
---

# CLI Developer

## loopx Boundary

`cli-developer` is a support lens, not a workflow state. Use it directly when the user asks for CLI design or implementation guidance, and use it from `spec`, `exec`, `review`, or `final-review` when changes affect command behavior.

This skill does not replace `clarify`, `spec`, `plan-to-exec`, `review`, or `final-review`. If product behavior, compatibility, migration, or public CLI contract decisions are unclear, route those decisions through `clarify` or `spec`.

For loopx itself, preserve the established rule that human output is default for first-use commands and complete runtime payloads require explicit `--json`.

## Purpose

Use this skill to design, implement, or review command-line behavior: command hierarchy, flags, arguments, help text, output contracts, errors, prompts, progress indicators, shell completions, terminal behavior, startup cost, and cross-platform UX.

It applies to Node.js, Python, Go, and other CLI stacks, but defer to the repository's existing framework and command conventions before introducing new dependencies.

## Core Workflow

1. **Analyze UX** — Identify the user workflows, command hierarchy, common tasks, automation paths, and first-use onboarding path.
2. **Design commands** — Plan subcommands, flags, positional arguments, configuration sources, environment variables, and compatibility with existing command signatures.
3. **Specify output contracts** — Decide which output is human-facing, which output is machine-readable, and how `--json`, stdout, stderr, and exit codes behave.
4. **Implement** — Use the project's established CLI framework. After wiring commands, run representative `<cli> --help`, `<cli> --version`, success, validation-error, and non-interactive invocations.
5. **Polish shell behavior** — Review color, TTY detection, SIGINT handling, prompt fallbacks, progress indicators, and shell completion support where the command is public or repeated-use.
6. **Verify** — Run the relevant test suite and smoke tests on command behavior. Measure startup time against project-specific expectations when startup cost matters.

## STOP Conditions

Stop before changing a CLI contract when:

- A flag, command name, JSON field, exit code, or stdout/stderr behavior may be scripted by users and compatibility is unresolved.
- The command may run in CI or a non-TTY context and no non-interactive path exists.
- The requested change belongs to product behavior or workflow semantics rather than CLI surface design.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Design Patterns | `references/design-patterns.md` | Subcommands, flags, config, architecture |
| Node.js CLIs | `references/node-cli.md` | commander, yargs, inquirer, chalk |
| Python CLIs | `references/python-cli.md` | click, typer, argparse, rich |
| Go CLIs | `references/go-cli.md` | cobra, viper, bubbletea |
| UX Patterns | `references/ux-patterns.md` | Progress bars, colors, prompts, help text |

## Command And Flag Discipline

- Preserve existing command signatures unless a breaking change is explicitly approved and documented.
- Prefer stable subcommands and explicit flags over mode inference that is hard to script.
- Keep flag names consistent with existing project vocabulary and common CLI conventions.
- Support `--help`; support `--version` for installable public CLIs or when the project already exposes it.
- Validate user input early and return actionable errors with a non-zero exit code.
- Treat command names, flags, positional arguments, JSON fields, and exit codes as public API once users can script against them.
- Document deprecated flags before removing them when compatibility matters.

## Output Discipline

- Human output is the default for exploratory, onboarding, and first-use commands.
- Complete runtime payloads, state snapshots, and automation-friendly output require explicit `--json`.
- Keep stdout for requested command results. Send diagnostics, warnings, progress, logs, and prompts to stderr.
- Do not mix spinner/progress text into stdout when stdout may be piped or parsed.
- Use stable JSON schemas for `--json` output. Avoid prose in JSON fields that callers need to branch on.
- Include enough structured error data in JSON mode for automation to handle failures.
- Keep human error messages concise, specific, and action-oriented.

## Interactivity And CI Discipline

- Do not require interactive input in CI or non-TTY contexts.
- Provide flags, environment variables, config files, or documented defaults for non-interactive operation.
- Detect TTY before enabling prompts, colors, alternate screens, spinners, or progress bars.
- When prompting, show the exact consequence of destructive or compatibility-sensitive choices.
- Respect common non-interactive signals such as `CI=1`, piped stdin/stdout, and explicit `--yes`, `--no-input`, or equivalent project conventions.
- Handle SIGINT gracefully: stop active work when possible, clean up partial local state when required, and exit with a clear message.

## Installer And Onboarding Discipline

- First-run commands should be readable without `--json` and should not require users to know internal workflow state.
- Installer and postinstall flows must be non-interactive-safe unless the package manager or platform explicitly permits prompts.
- Avoid writing generated runtime state into the repository unless the command explicitly operates on repo-managed artifacts.
- For loopx plugin or skill installation flows, preserve mirror expectations and avoid overwriting user-edited installed copies outside the current repository.
- Keep help text and error text compatible with common terminals and package manager logs.

## Shell And Cross-Platform Discipline

- Use platform-neutral path APIs. Do not hardcode `/`, `~`, drive letters, or shell-specific quoting.
- Avoid assuming Bash. Consider zsh, fish, PowerShell, and cmd.exe when commands are public or documented for users.
- Quote shell examples so paths with spaces work.
- Detect color support and avoid color in non-TTY output unless the project supports explicit color forcing.
- Normalize line endings and path display carefully when output may be compared in tests.
- Provide shell completions for public, repeated-use CLIs when the framework and distribution path make them maintainable. Do not require completions for every internal or one-off CLI.

## Performance Discipline

- Keep startup work proportional to the command. Avoid loading large modules, reading network resources, or scanning large trees before argument parsing when not needed.
- Measure startup time against project-specific expectations before claiming a performance target.
- Prefer lazy loading for expensive subcommand-only dependencies.
- Stream large inputs and outputs instead of buffering unnecessarily.

## Failure Handling

| Trigger | First action | If still blocked |
|---|---|---|
| A command works only interactively | Add or require flags/env/config for non-interactive mode | Stop and report the missing automation path |
| JSON output contains human prose | Separate machine fields from display text | Treat schema instability as a blocking compatibility issue |
| Help, success, and error output disagree | Run representative smoke commands and align wording with actual behavior | Report remaining mismatches as CLI contract defects |

## Red Flags

- Do not print diagnostics, prompts, or progress to stdout when output may be parsed.
- Do not hide breaking CLI changes behind aliases or mode inference.
- Do not require prompts in package-manager scripts, CI, hooks, or non-TTY runs.
- Do not overwrite installed user-edited runtime state during onboarding.

## Review Checklist

- Is the command hierarchy understandable from `--help`?
- Are flags, arguments, environment variables, and config precedence explicit?
- Are stdout and stderr separated correctly for piping and automation?
- Does `--json` return complete, stable, machine-readable payloads without human-only text?
- Does the command work in non-interactive CI and non-TTY contexts?
- Are prompts, colors, spinners, and progress indicators gated by terminal capability?
- Are errors actionable and backed by appropriate exit codes?
- Are public command signatures and JSON schemas backward-compatible or intentionally migrated?
- Are startup costs measured when startup time matters?
- Are shell examples and path handling cross-platform?

## Output Checklist

When delivering CLI design or implementation guidance, provide:

1. Command structure: entry point, subcommands, arguments, and flags
2. Output contract: human output, `--json` shape, stdout/stderr behavior, and exit codes
3. Configuration handling: config files, env vars, flags, and precedence
4. Interactivity rules: prompts, CI behavior, defaults, and TTY behavior
5. Shell behavior: help text, completions when applicable, colors, paths, and signal handling
6. Verification commands: help/version smoke tests, success/error invocations, JSON-mode checks, and project tests

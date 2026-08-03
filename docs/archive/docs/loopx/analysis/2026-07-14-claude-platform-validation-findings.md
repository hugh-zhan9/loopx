# Claude Platform Validation Findings

Date: 2026-07-14  
Repository: `/Users/zhangyukun/project/loopx`  
Loopx version: `0.5.1`  
`subagent-exec` skill version: `0.3.22`

## Purpose

Analyze whether loopx can provide the same controller-only agent topology,
structured task-review result, native leaf extraction, and provenance-bound
review artifact on Claude Code that it currently provides on Codex.

This document records observations rather than assuming their cause. Please
check the raw Claude sessions before proposing changes.

## Current Loopx Contract

- Only the top-level controller owns agent lifecycle operations.
- Every implementer and task reviewer is a leaf worker.
- A reviewer returns one `loopx.review-result.v1` block.
- The controller must preserve the result rather than reinterpret it.
- Codex reads the leaf final message directly from its native rollout.
- `scripts/review-result` validates the result and creates a
  `loopx.review-artifact.v1` envelope.
- The artifact binds root/reviewer thread identity, model, review attempt, raw
  message, native rollout, task brief, review package, and implementer report.
- `scripts/review-artifact-verify` rejects stale or mismatched evidence before
  the workflow consumes the gate.

## Local Claude Environment

The Claude Code companion setup reported:

```text
Node.js: OK
Claude Code CLI: OK
Claude Agent SDK: OK
Claude Broker: starts on demand
Claude Code auth: ready
```

The first requested model, `claude-sonnet-5`, failed with:

```text
503 No available channel for model claude-sonnet-5 under group default
```

The successful default-model runs reported this actual model in usage data:

```text
deepseek-v4-flash
```

Therefore these runs validate the Claude Code surface and native Agent
mechanism, but not an Anthropic Claude model.

## Experiment 1: Companion Task With Current Configuration

The controller was instructed to create exactly one leaf reviewer, pass an
inline seeded defect, and reproduce a strict `loopx.review-result.v1` block.

Claude session:

```text
2f684339-67da-4ef0-99bf-8d538509d221
```

Session trace:

```text
~/.claude/projects/-Users-zhangyukun-project-loopx/
  2f684339-67da-4ef0-99bf-8d538509d221.jsonl
```

Observed behavior:

- The session did not expose a usable `Agent` tool.
- The model explicitly reasoned that it could not create a subagent.
- It performed the review itself while saying it had created a reviewer.
- It attempted unrelated oh-my-claudecode skill-loading tools.
- Those tools were denied by the read-only permission configuration.
- The returned JSON did not follow `loopx.review-result.v1`.

Examples of schema drift:

```text
$schema instead of schema
verdict instead of status
summary instead of task_quality
extra title/description/task_anchor fields inside findings
top-level anchor_ids
```

## Experiment 2: Direct Leaf Reviewer In Safe Mode

Claude Code was run in safe mode with tools disabled. The reviewer received a
complete inline task and an explicit field-level result contract.

Session:

```text
bdd8a222-b870-4f06-8b37-5a45e6273815
```

Observed behavior:

- The semantic fields were mostly correct.
- The model used a `json` fenced block instead of a
  `loopx-review-result` fenced block.
- It wrapped the complete response in an additional Markdown fence.
- The strict loopx parser would reject the response because the canonical block
  marker was absent.
- Usage data again reported `deepseek-v4-flash`.

## Experiment 3: Native Agent Explicitly Enabled

Claude Code was run in safe mode with only the built-in `Agent` tool explicitly
allowed.

Root session:

```text
543458e7-e4c3-4c1d-8dd1-f7cbf19bec5f
```

Root trace:

```text
~/.claude/projects/-Users-zhangyukun-project-loopx/
  543458e7-e4c3-4c1d-8dd1-f7cbf19bec5f.jsonl
```

Subagent traces:

```text
~/.claude/projects/-Users-zhangyukun-project-loopx/
  543458e7-e4c3-4c1d-8dd1-f7cbf19bec5f/subagents/
    agent-a60cd30c764d9b0ef.jsonl
    agent-a045594f9d3c7dada.jsonl
```

Observed topology:

1. The controller called `Agent` for reviewer attempt 1.
2. Attempt 1 failed with an upstream API 400.
3. The controller stated that it would retry.
4. The controller called `Agent` again for reviewer attempt 2.
5. Attempt 2 completed.
6. Neither reviewer trace called `Agent`; nested agent count was zero.

This means the native leaf constraint held, but the instruction to create
exactly one reviewer did not. The second child was a controller-owned
replacement after provider failure rather than a nested worker.

The successful reviewer result also failed the strict schema:

```text
schema: loopx-review-result/v1 instead of loopx.review-result.v1
task_quality: medium instead of Needs fixes
task_anchor: CLAUDE-003 instead of T-CLAUDE-003
cannot_verify: false instead of []
severity: critical instead of Critical
finding used title/description/location/expected/actual
finding omitted anchor_ids and summary
```

The controller reproduced the invalid result block, so controller copying was
approximately faithful while leaf result quality failed.

## Native Trace Capabilities Confirmed

Historical and current Claude sessions show that a Claude native adapter can
obtain:

- root session ID;
- `Agent` tool calls and their prompts;
- task/agent IDs;
- separate `subagents/agent-*.jsonl` files;
- `isSidechain: true` child identity;
- parent UUID, prompt ID, and agent ID;
- child model and token usage;
- child tool calls;
- child final message;
- controller retries and `TaskOutput` calls;
- attribution skill and agent type.

Historical sessions containing successful native Agent calls include:

```text
~/.claude/projects/-Users-zhangyukun-project-loopx/
  897a3930-ed22-4433-94a3-91e27f24ce7a.jsonl
  0fbc864f-9981-4af0-b13d-2404902dbd71/
  b79cf00c-4b3e-4b4f-a7d8-c2df9010fdaa/
```

## Questions For Independent Claude Analysis

1. Why did the companion task not expose `Agent`, while safe mode with
   `--allowedTools Agent` did?
2. Is the oh-my-claudecode configuration or MCP loading interfering with the
   expected loopx orchestration surface?
3. What is the correct way to require a single foreground Claude Agent rather
   than a background Agent plus `TaskOutput`?
4. Should a provider/API failure permit one controller-owned replacement, or
   should the task stop as `BLOCKED` to preserve an exact one-reviewer budget?
5. How should a Claude adapter distinguish attempts, replacements, and accepted
   reviewer output?
6. Can Claude Agent be given a JSON Schema or structured-output constraint, or
   is `--json-schema` limited to the root CLI response?
7. Would a Claude-specific reviewer contract using a raw JSON object be more
   reliable than a custom fenced block?
8. How should native child output be extracted when an Agent runs in the
   background and the root consumes it through `TaskOutput`?
9. What exact native fields should be hashed in a
   `loopx.review-artifact.v1` Claude provenance envelope?
10. Is the current behavior representative of Claude Code, or primarily caused
    by the gateway routing requests to `deepseek-v4-flash`?

## Constraints For Any Proposed Fix

- Do not weaken `loopx.review-result.v1` by silently normalizing invalid enums,
  field names, task anchors, or value types.
- Do not let a leaf reviewer create another agent.
- Do not treat controller prose as the canonical review result.
- Preserve attempt and replacement identity rather than collapsing all children
  into one reviewer.
- Missing or invalid structured output must not become approval.
- Keep platform-specific trace parsing outside the provider-neutral scorer.
- Prefer deterministic adapters and validators over additional prompt prose.

## Current Working Hypothesis

The Claude native adapter appears technically feasible because the required
parent/child and leaf-final evidence exists on disk. The unresolved issues are
tool-surface configuration, provider/model routing, replacement policy, and
structured-output reliability. Treat this as a hypothesis to verify against the
raw traces, not as a final diagnosis.

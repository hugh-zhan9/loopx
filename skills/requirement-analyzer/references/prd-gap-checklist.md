# PRD Gap Checklist

Use this checklist when a requirement, PRD, ticket, or feature brief needs a gap review. Do not require every item for every document; apply the sections that match the document's job.

## Business Closure

Check the requirement loop:

```text
actor -> trigger -> input -> process -> output -> feedback
```

Look for:

- Primary actor and secondary actors
- Triggering event or entry point
- Required input and validation rules
- Success output and user-visible completion state
- Failure output and user-visible recovery path
- Owner of manual decisions, approvals, or exceptions
- Feedback or notification path after completion

Common blockers:

- The requirement says "support", "sync", "review", or "process" without a completion state.
- It defines the happy path but not failure handling.
- It names a system integration but not the source of truth or ownership.
- It requires approval but does not identify who approves or what happens on rejection.

## Ambiguity

Turn vague terms into answerable questions.

| Vague wording | Ask |
| --- | --- |
| "real-time" | What maximum delay is acceptable? |
| "admin" | Which role, permission, or tenant scope qualifies? |
| "recent" | What exact time window and timezone? |
| "all users" | Which user segments, regions, plans, or exclusions? |
| "failure notification" | Who receives it, by which channel, and with what action? |
| "compatible" | Which versions, clients, payloads, or migrations must continue working? |
| "batch" | What size, frequency, retry, and timeout rules? |
| "configurable" | Who configures it, where, and what are the allowed values and defaults? |
| "secure" | Which threat model, authentication, authorization, and encryption rules? |
| "performant" | What specific latency, throughput, or resource target? |

### Chinese Requirement Ambiguity

For Chinese requirements, watch for these terms and convert them to concrete questions:

| 模糊用词 | 需要确认 |
| --- | --- |
| "及时" | 具体时间上限是多少？(< 1秒 / < 1分钟 / < 1小时) |
| "尽快" | 有没有 SLA 或超时后的降级策略？ |
| "相关人员" | 具体是哪些角色、部门、或权限组？ |
| "默认" | 默认值是什么？谁可以修改？修改后影响范围？ |
| "自动" | 触发条件是什么？失败时怎么处理？有没有人工兜底？ |
| "必要时" | 判断条件是什么？谁来判断？判断错误的后果？ |
| "支持" | 支持的完整范围是什么？有没有不支持的例外？ |
| "可配置" | 配置的维度、粒度、权限、生效时机？ |
| "保持一致" | 一致性的对象、时间窗口、冲突解决规则？ |
| "合理" | 合理的标准是什么？由谁定义？ |
| "视情况而定" | 列举所有情况和对应处理方式 |
| "参考xx系统" | 哪些行为对齐、哪些行为不同、差异的原因？ |
| "等" / "等等" | 完整枚举是什么？还是真的是开放集合？ |

## Impact

Identify affected surfaces without inventing architecture:

- Users, roles, tenants, plans, regions, or organizations
- APIs, CLI commands, screens, jobs, events, or integrations
- Database records, schemas, migrations, backfills, retention, or analytics
- Permissions, audit logs, compliance, privacy, or legal review
- Operations, monitoring, alerts, rollout, rollback, and support playbooks
- Existing behavior that must remain compatible

Classify impact as unknown when the source gives no evidence. Unknown impact is a gap only when it changes design, rollout, or acceptance.

### Impact Assessment Matrix

| Impact Area | Questions to Ask | P0 if... |
| --- | --- | --- |
| Data | Schema change? Migration needed? Backward compatible? | Existing data is corrupted or lost without migration |
| API | Breaking change? New version? Deprecation? | Existing clients break without warning |
| Permissions | New role? Changed access? Audit implications? | Users gain unintended access |
| Operations | New alerts? Changed runbooks? New on-call scope? | Failure is undetectable or unrecoverable |
| Compliance | Privacy review? Legal approval? Data classification? | Non-compliance risk with legal consequences |
| Rollback | Can this be undone? What is the rollback blast radius? | No rollback path exists for a destructive change |

## Feasibility

Separate requirement risk from implementation difficulty.

Requirement feasibility risks include:

- A dependency or external system is assumed but not available.
- The requested behavior conflicts with existing product rules or legal constraints.
- Required data does not exist, is unreliable, or has unclear ownership.
- A migration, rollout, or rollback path is required but unspecified.
- A schedule or SLA is stated without scope, load, or operational ownership.
- A third-party integration is assumed but not contracted or available in the target environment.

Do not mark a requirement defective just because implementation is complex. Mark it as a risk when the requirement assumes an unapproved tradeoff or hides a decision the owner must make.

### Feasibility Red Flags

| Red Flag | Why It Matters |
| --- | --- |
| "Same as system X" without specifying differences | System X may have different constraints, scale, or contracts |
| Timing assumption without load analysis | "Real-time sync of 10M records" may be infeasible |
| Cross-team dependency without confirmed ownership | The other team may not have capacity or agreement |
| Compliance claim without legal review | Legal requirements need legal confirmation, not assumption |
| "No downtime" for schema migration | May require online DDL, dual-write, or phased rollout |

## Development Readiness

Quick checks to determine if the requirement is ready for the next loopx workflow step.

### Ready for `clarify`

- [ ] Scope or non-goals are missing or contradictory
- [ ] Multiple product interpretations lead to different designs
- [ ] Key actor, permission, or ownership is undecidable
- [ ] Competing goals exist without stated priority

### Ready for `spec`

- [ ] Product intent is clear but API/data/state decisions are open
- [ ] Existing systems or contracts are affected
- [ ] Rollout, rollback, or operational behavior needs design
- [ ] Clear enough to compare options but not to write tasks

### Ready for `plan-to-exec`

- [ ] Scope and non-goals are explicit
- [ ] Acceptance rules are testable
- [ ] Affected surfaces are discoverable
- [ ] Remaining choices are local implementation choices
- [ ] No owner-level decisions are pending

### Blocked

- [ ] A P0 question has no safe default
- [ ] No local repo evidence can answer the blocking question
- [ ] The decision requires a specific person (legal, product owner, security)

## Cross-Reference Checks

When the requirement references other documents or systems:

- [ ] Referenced documents exist and are accessible
- [ ] Referenced behavior is still current (not deprecated or changed)
- [ ] Contradictions between referenced docs and this requirement are flagged
- [ ] Version or date of referenced material is noted

## Completeness Signals

A requirement is likely incomplete when:

- It describes only the creation flow but not update, delete, or error flows
- It mentions a list or collection but not pagination, sorting, or filtering rules
- It defines a notification but not the channel, template, frequency, or opt-out
- It references permissions but not the grant, revoke, or audit mechanism
- It describes a scheduled job but not frequency, retry, timeout, or conflict rules
- It mentions "sync" but not conflict resolution, source of truth, or failure handling
- It defines an approval flow but not timeout, escalation, delegation, or rejection recovery

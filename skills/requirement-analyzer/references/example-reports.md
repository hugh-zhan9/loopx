# Example Reports

These examples illustrate the expected output quality and format for requirement analysis reports. They are synthetic but modeled on real-world patterns.

## Example 1: Gap Checklist (Chinese PRD)

Source: "用户积分兑换功能 PRD v0.3"

```markdown
# 需求缺口清单

## 结论

- 推荐下一步：clarify
- 成熟度评分：52/100 (需要 clarify)
- 阻塞项数量：3 个 P0
- 主要风险：兑换失败的回滚机制未定义，积分过期规则与兑换时序存在矛盾

## 成熟度评分

| 维度 | 得分 | 满分 | 说明 |
|------|------|------|------|
| 完整性 | 12 | 20 | 失败处理和回滚缺失 |
| 清晰度 | 10 | 20 | 多个模糊用词，quality avg 62% |
| 可测试性 | 12 | 20 | 部分验收标准缺失 |
| 行为覆盖 | 8 | 20 | 状态模型不完整，并发处理未定义 |
| 可追溯性 | 10 | 20 | 3个需求无法追溯到业务目标 |
| **合计** | **52** | **100** | |

## 必须确认

- [ ] 问题：并发兑换时积分不足如何处理？
      证据：PRD 第 3.2 节仅描述 "扣减积分"，未定义并发锁策略或失败回滚
      影响：可能导致积分超扣或兑换成功但商品库存不足

- [ ] 问题：积分过期与兑换时序矛盾
      证据：第 2.1 节 "积分到期日自动清零"，第 3.1 节 "提交兑换后 24 小时内发货"
      影响：如果用户提交兑换时积分有效，但发货确认时积分已过期，扣减行为未定义

- [ ] 问题："相关人员审核" 的角色和超时未定义
      证据：第 4.2 节 "高价值兑换需相关人员审核"
      影响：不知道谁审核、超时多久、超时后是自动通过还是拒绝

## 可以后续完善

- [ ] 问题：兑换记录的展示排序和分页规则
      证据：第 5.1 节仅说 "展示兑换记录"
      建议：spec 阶段明确排序字段、分页大小、筛选维度

- [ ] 问题：积分变动通知渠道
      证据：第 6 节 "及时通知用户"
      建议：明确是 APP 推送、短信、站内信、还是多渠道，以及延迟容忍度
```

## Example 2: Analysis Report (English Feature Brief)

Source: "Multi-tenant API Key Management — Feature Brief v1"

```markdown
# Requirement Analysis

## Summary

- Source: Multi-tenant API Key Management Feature Brief v1
- Document type: Product requirement (mixed with some technical design)
- Analysis depth: standard
- Overall readiness: Not ready for plan
- Maturity score: 71/100 (Ready for spec)
- Highest priority issue: Tenant isolation model for key scopes is undefined

## Maturity Scorecard

| Dimension | Score | Max | Notes |
|-----------|-------|-----|-------|
| Completeness | 14 | 20 | Key rotation impact and rate limit entity undefined |
| Clarity | 15 | 20 | Quality avg 75%, 3 statements at 0 on unambiguity |
| Testability | 16 | 20 | Most criteria testable, NFR targets missing |
| Behavioral Coverage | 12 | 20 | Key lifecycle states clear, permission model incomplete |
| Traceability | 14 | 20 | Goals clear, 2 requirements without acceptance criteria |
| **Total** | **71** | **100** | |

Score band: medium confidence

## Readiness Recommendation

Recommended next step: `spec`

Reason: Product intent is clear (tenants manage their own API keys with scoped permissions), but the key-to-permission model, cross-tenant visibility rules, and key rotation impact on active sessions are design decisions that need architecture input before implementation planning.

## P0 Blockers

| Issue | Evidence | Why It Blocks | Question / Decision Needed |
| --- | --- | --- | --- |
| Key scope model undefined | Brief says "keys can have limited permissions" but does not define the permission granularity | Cannot design the authorization layer without knowing if scopes are predefined roles, custom permission sets, or resource-level grants | What is the permission model? Predefined roles (admin/read/write) or custom scope sets? |
| Cross-tenant key visibility | Brief says "admins can view all keys" without defining tenant boundary | In multi-tenant, "all keys" could mean within-tenant or platform-wide — different security models | Does "admin" mean tenant admin (sees own tenant keys) or platform admin (sees all tenant keys)? |
| Key rotation impact on sessions | Brief says "keys can be rotated" but does not address active sessions | Rotating a key mid-session could break active API consumers or require grace periods | When a key is rotated, do active sessions using the old key get terminated immediately, get a grace period, or continue until natural expiry? |

## P1 Major Risks

| Issue | Evidence | Risk | Suggested Resolution |
| --- | --- | --- | --- |
| Rate limiting per key vs per tenant | Brief mentions "rate limiting" without specifying the limit entity | If limits are per-key, a tenant can create many keys to bypass limits; if per-tenant, a single key's traffic can starve others | Decide rate limit entity in spec: per-key, per-tenant, or hierarchical |
| Audit log retention | Brief says "all key operations are audited" without retention or access rules | Compliance and storage cost implications are unknown | Define retention period, access control for audit logs, and whether they are tenant-visible |

## P2 Improvements

| Issue | Evidence | Improvement |
| --- | --- | --- |
| Key naming constraints | Not mentioned | Define max length, allowed characters, uniqueness scope |
| Bulk key operations | Not mentioned | Consider if tenants need bulk create/revoke for migration scenarios |
| Key metadata | Brief mentions "description" field only | Consider labels/tags for organizational use |

## Quality Attribute Scoring

### Summary

| Attribute | Avg Score | Statements at 0 | Worst Offender |
|-----------|-----------|-----------------|----------------|
| Testability | 1.6 | 1 | "keys can have limited permissions" — no testable scope definition |
| Atomicity | 1.8 | 0 | - |
| Necessity | 2.0 | 0 | - |
| Unambiguity | 1.2 | 3 | "admins can view all keys" — tenant boundary ambiguous |
| Completeness | 1.4 | 2 | Key rotation: no failure/edge case handling |
| Consistency | 1.6 | 1 | Rate limit vs multi-key creation tension |
| Implementation-freedom | 1.4 | 1 | "use JWT for key tokens" — prescriptive without justification |
| Measurability | 1.0 | 3 | No latency, throughput, or rate limit numbers |

Overall quality: 12.0/16 (75%)

## Facts

- Tenants can create, list, rotate, and revoke API keys
- Keys have a name and description
- Keys can have limited permissions (scope undefined)
- All key operations are audited
- Rate limiting applies (entity undefined)
- Admins can view all keys (boundary undefined)

## Inferences

- Inference: Keys are likely long-lived (not session tokens)
  Evidence: "rotate" and "revoke" imply persistent credentials, not short-lived tokens

- Inference: Multi-tenant isolation is required
  Evidence: Feature title says "multi-tenant" and brief mentions "tenant" 12 times

## Assumptions

- Assumption: One key belongs to exactly one tenant
  Why it matters: If keys can be shared across tenants, the permission and audit model changes significantly

- Assumption: Key creation does not require approval
  Why it matters: If approval is needed, the workflow, roles, and notification paths must be designed

## Follow-Up Questions

1. What permission model should keys use? (predefined roles vs custom scopes vs resource-level)
2. Does "admin can view all keys" mean tenant-admin or platform-admin?
3. What happens to active sessions when a key is rotated?
4. Is rate limiting applied per-key, per-tenant, or both?
5. What is the audit log retention period and who can access it?

## Suggested Next Step

Route to `spec` with `api-designer` and `architecture-designer` lenses. The key-to-permission model is an architecture decision that affects API surface, data model, and authorization middleware.
```

## Example 3: Quick Gap Checklist (Ticket-Level)

Source: JIRA ticket "Add export button to analytics dashboard"

```markdown
# 需求缺口清单

## 结论

- 推荐下一步：plan
- 成熟度评分：88/100 (可进入规划)
- 阻塞项数量：0
- 主要风险：大数据量导出的超时和内存问题（P1，不阻塞规划）

## 成熟度评分

| 维度 | 得分 | 满分 | 说明 |
|------|------|------|------|
| 完整性 | 18 | 20 | 仅缺数据量上限定义 |
| 清晰度 | 18 | 20 | 需求简洁明确 |
| 可测试性 | 18 | 20 | 验收标准明确 |
| 行为覆盖 | 16 | 20 | 无复杂状态流转，流程完整 |
| 可追溯性 | 18 | 20 | 目标明确，验收可测 |
| **合计** | **88** | **100** | |

## 必须确认

（无 P0 阻塞项）

## 可以后续完善

- [ ] 问题：导出数据量上限
      证据：ticket 说 "导出当前筛选结果"，但仪表盘数据可能达百万行
      建议：plan 时记录分页导出或异步下载边界，设定单次导出上限

- [ ] 问题：导出格式
      证据：ticket 仅说 "导出为 CSV"
      建议：确认是否需要 Excel (.xlsx) 支持，以及 CSV 编码（UTF-8 BOM for 中文兼容）

## 为什么可以进入 plan

- 范围明确：在现有仪表盘页面增加导出按钮
- 接受标准可测试：点击导出 → 下载包含当前筛选数据的文件
- 无跨团队依赖：仪表盘前端和 API 由同一团队负责
- 剩余问题（数据量上限、格式）是实现选择，不影响产品行为决策
```

## Example 4: Deep Analysis with Behavioral Model (Complex Stateful Workflow)

Source: "公司行动事件处理系统 PRD v1.2"

```markdown
# Requirement Analysis

## Summary

- Source: 公司行动事件处理系统 PRD v1.2
- Document type: Product requirement (complex stateful workflow)
- Analysis depth: deep
- Overall readiness: Not ready for plan
- Maturity score: 63/100 (Needs clarify)
- Highest priority issue: 事件确认后的明细生成失败回滚路径未定义

## Maturity Scorecard

| Dimension | Score | Max | Notes |
|-----------|-------|-----|-------|
| Completeness | 14 | 20 | 失败处理多处缺失 |
| Clarity | 13 | 20 | Quality avg 65%, 审批和执行相关语句模糊 |
| Testability | 14 | 20 | 执行结果验收标准不完整 |
| Behavioral Coverage | 10 | 20 | 状态模型不完整，3个转换无失败路径 |
| Traceability | 12 | 20 | 2个业务目标无对应需求 |
| **Total** | **63** | **100** | |

Score band: low confidence

## Readiness Recommendation

Recommended next step: `clarify`

Reason: 事件处理的核心状态流转（确认→生成明细→制定计划→执行）中，3个关键转换的失败路径未定义，并发事件冲突处理规则缺失，"相关审批人"的角色边界不清。这些是业务决策，不是技术设计可以自行决定的。

## P0 Blockers

| Issue | Evidence | Why It Blocks | Question / Decision Needed |
| --- | --- | --- | --- |
| 明细生成失败的回滚路径 | PRD 4.3 "确认后自动生成持仓明细" 无失败处理 | 如果生成明细时部分持仓数据缺失或异常，事件状态如何回退？已确认的事件能否重新进入待确认？ | 明细生成失败时：回退到待确认 / 标记为异常等待人工干预 / 部分生成并标记缺失？ |
| 执行计划与外部系统的冲突处理 | PRD 5.2 "生成执行计划并提交交易系统" 无冲突定义 | 如果交易系统拒绝计划（资金不足、市场关闭、额度超限），事件状态如何处理？ | 外部系统拒绝时：自动重试 / 人工修改计划 / 整体取消？重试次数和超时？ |
| 并发事件对同一持仓的处理 | PRD 未提及同一证券的多个公司行动事件并行的情况 | 如果同一持仓同时存在分红和拆股事件，处理顺序、快照时间点、相互影响未定义 | 并发事件：串行处理（谁先？）/ 并行处理（快照隔离？）/ 需要人工排序？ |

## P1 Major Risks

| Issue | Evidence | Risk | Suggested Resolution |
| --- | --- | --- | --- |
| 审批超时处理 | PRD 4.5 "高金额事件需审批" 无超时定义 | 审批无限期挂起可能导致错过行权截止日 | clarify 时确认超时时间和自动升级策略 |
| 持仓快照时间点 | PRD 4.3 "基于持仓生成明细" 未指定快照时机 | 确认时 vs 生成时 vs 记录日的持仓可能不同 | 明确快照基准时间和与登记日的关系 |

## Quality Attribute Scoring

### Summary

| Attribute | Avg Score | Statements at 0 | Worst Offender |
|-----------|-----------|-----------------|----------------|
| Testability | 1.3 | 4 | "系统正确处理各类公司行动事件" |
| Atomicity | 1.5 | 2 | R8: 混合了明细生成、通知、审计三个行为 |
| Necessity | 1.8 | 0 | - |
| Unambiguity | 1.1 | 5 | "相关审批人"、"及时处理"、"合理期限" |
| Completeness | 1.2 | 4 | 多个操作缺失失败处理 |
| Consistency | 1.4 | 2 | 4.3 说"自动生成"，5.1 说"确认后由操作员触发" |
| Implementation-freedom | 1.6 | 1 | "使用消息队列异步处理" 无业务理由 |
| Measurability | 0.9 | 6 | SLA、超时、批量上限均未量化 |

Overall quality: 10.8/16 (68%)

## Behavioral Model

### State Model: 公司行动事件 (Corporate Action Event)

| State | Type | Description | Timeout/Escalation |
|-------|------|-------------|--------------------|
| 待录入 | initial | 事件信息来源已识别，待操作员录入详情 | 无 |
| 待确认 | intermediate | 事件信息已录入，待复核确认 | 未定义 (GAP) |
| 待审批 | intermediate | 高金额事件，等待审批 | 未定义 (P1 GAP) |
| 已确认 | intermediate | 事件信息确认，待生成持仓明细 | 无 |
| 明细生成中 | intermediate | 正在生成受影响持仓明细 | 未定义超时 (GAP) |
| 待制定计划 | intermediate | 明细已生成，待制定执行计划 | 无 |
| 计划审批中 | intermediate | 执行计划待审批 | 未定义 (GAP) |
| 待执行 | intermediate | 计划已批准，待提交执行 | 行权截止日前 |
| 执行中 | intermediate | 已提交交易系统，等待回报 | 未定义超时 (GAP) |
| 已完成 | terminal | 所有处理步骤完成 | N/A |
| 异常 | error | 处理过程中出现异常 | 未定义恢复路径 (P0 GAP) |
| 已取消 | terminal | 事件被取消（错误录入/事件撤回） | N/A |

State hierarchy: layered (事件主状态 + 明细处理子状态)

### Transition Matrix

| From | Action/Trigger | To | Actor | Guard | Failure Path |
|------|----------------|-----|-------|-------|--------------|
| 待录入 | 录入完成 | 待确认 | 操作员 | 必填字段完整 | 验证失败，留在待录入 |
| 待确认 | 确认 | 已确认 / 待审批 | 复核员 | 数据一致性校验通过 | 打回待录入 |
| 待审批 | 审批通过 | 已确认 | 审批人 | 有审批权限 | **未定义** (GAP) |
| 待审批 | 审批拒绝 | 待确认 | 审批人 | 填写拒绝原因 | N/A |
| 已确认 | 触发生成 | 明细生成中 | 系统/操作员 | **矛盾** (P0: 自动 vs 手动触发) | **未定义** (P0 GAP) |
| 明细生成中 | 生成完成 | 待制定计划 | 系统 | 所有持仓明细生成成功 | **未定义** (P0 GAP) |
| 待制定计划 | 提交计划 | 计划审批中 / 待执行 | 操作员 | 计划覆盖所有明细 | 验证失败，留在待制定 |
| 计划审批中 | 审批通过 | 待执行 | 审批人 | 有审批权限 | **未定义** (GAP) |
| 待执行 | 执行 | 执行中 | 系统 | 在截止日前 | **未定义** (P0 GAP) |
| 执行中 | 执行成功回报 | 已完成 | 外部系统 | 全部指令成功 | **未定义** (P0 GAP) |
| any | 取消 | 已取消 | 管理员 | 非终态 + 无已执行指令 | 有已执行指令时如何处理？(GAP) |

### Operation Matrix

| State | Allowed Operations | Forbidden | Role | Entry Point |
|-------|--------------------|-----------|------|-------------|
| 待录入 | 编辑、删除、提交 | 确认、执行、取消 | 操作员 | 事件列表页 |
| 待确认 | 确认、打回、编辑(?) | 执行、删除 | 复核员 | 复核队列 |
| 待审批 | 审批、拒绝 | 编辑、删除、执行 | 审批人 | 审批中心 |
| 已确认 | 查看、触发生成(?)、取消 | 编辑、删除 | 操作员/系统 | **未明确** (GAP) |
| 明细生成中 | 查看进度、取消(?) | 编辑、手动干预(?) | 系统 | **未明确** (GAP) |
| 待制定计划 | 制定计划、查看明细、取消 | 执行 | 操作员 | 计划编辑页 |
| 待执行 | 执行、修改计划(?)、取消 | 编辑事件 | 操作员/系统 | 执行面板 |
| 执行中 | 查看状态、强制取消(?) | 编辑、修改计划 | 管理员 | 监控面板 |
| 已完成 | 查看、导出、归档 | 一切修改 | 任何 | 历史列表 |
| 异常 | 重试、人工处理、取消 | **未定义** (GAP) | **未定义** (GAP) | **未定义** (GAP) |

### Data Mutation Matrix

| Operation | Creates | Updates | Deletes | Side Effects | Audit/Notify | Idempotency |
|-----------|---------|---------|---------|--------------|--------------|-------------|
| 录入 | event record | - | - | - | audit: created by | safe: 新建 |
| 确认 | - | event.status, confirmed_by, confirmed_at | - | - | audit + notify reviewer | safe: no-op if confirmed |
| 生成明细 | position_details[] | event.status | - | 查询持仓系统 | audit: X条明细生成 | **未定义** (GAP) |
| 制定计划 | execution_plan, plan_items[] | event.status | - | - | audit + notify approver | **未定义** (GAP) |
| 执行 | trade_instructions[] | event.status, plan.status | - | 提交交易系统 | audit + notify stakeholders | **UNSAFE: 必须防重** (GAP) |
| 执行回报 | settlement_records[] | instruction.status, event.status | - | - | audit + notify | **未定义** (GAP: 重复回报？) |
| 取消 | - | event.status, cancelled_at | pending_tasks (soft?) | 撤回已提交指令？ | audit + notify all | **未定义** (GAP: 已提交的能撤吗？) |

### Behavioral Model Gaps

- [ ] P0: 明细生成失败的回滚路径完全未定义
- [ ] P0: 执行提交被外部系统拒绝后的状态处理未定义
- [ ] P0: 已确认→明细生成的触发方式矛盾（自动 vs 手动）
- [ ] P1: 异常状态的可用操作和角色完全未定义
- [ ] P1: 执行操作的幂等性未定义（重复提交指令风险）
- [ ] P1: 取消操作对已提交外部系统的指令的影响未定义
- [ ] P2: 多个中间状态缺少超时和升级策略

## Traceability Matrix

### Business Goals → Requirements

| # | Business Goal | Supporting Requirements | Coverage |
|---|--------------|----------------------|----------|
| G1 | 准确处理各类公司行动事件，防止客户资产损失 | R1-R5, R8, R12 | full |
| G2 | 满足监管对公司行动处理的时效要求 | R6 (截止日管理) | partial (无具体SLA) |
| G3 | 降低操作风险，关键操作需审批 | R7, R9 | partial (审批规则不完整) |
| G4 | 支持多市场、多品种的公司行动 | (none found) | **missing** (GAP) |
| G5 | 提供完整审计轨迹 | R11 | partial (留存期限未定义) |

### Requirements → Acceptance Criteria

| # | Requirement | Acceptance Criteria | Quality |
|---|------------|--------------------|---------|
| R1 | 操作员录入公司行动事件信息 | "录入后事件出现在待确认列表" | explicit |
| R2 | 复核员确认事件信息准确性 | "确认后状态变为已确认" | explicit |
| R3 | 系统生成受影响持仓明细 | (none) | **missing** |
| R6 | 在行权截止日前完成执行 | (none — 无具体SLA数字) | **missing** |
| R8 | 系统正确处理各类公司行动事件 | (none — 无法测试"正确") | **missing** |

## Open Decisions For Clarify

| Decision | Candidate Interpretations | Consequence | Owner Needed |
| --- | --- | --- | --- |
| 明细生成失败恢复 | A: 回退到待确认 B: 标记异常等待人工 C: 部分生成+标记缺失 | A需要重新确认流程, B需要异常处理角色定义, C需要部分明细的业务意义 | 产品负责人 |
| 执行被外部拒绝 | A: 自动重试(几次?) B: 人工修改计划重提 C: 标记失败+报警 | A需要重试策略, B需要计划编辑权限定义, C需要升级流程 | 产品负责人 + 交易运营 |
| 并发事件处理 | A: 串行(先到先处理) B: 并行(快照隔离) C: 人工排序 | A可能错过截止日, B需要复杂隔离机制, C需要排序规则 | 产品负责人 |
| 确认后生成触发方式 | A: 确认后自动触发 B: 操作员手动触发 | A无人工检查窗口, B增加操作步骤但更可控 | 产品负责人 |

## Suggested Next Step

Route to `clarify`.核心状态流转中有 3 个 P0 级失败路径未定义，且涉及外部系统交互的业务决策。建议 clarify 时聚焦：(1) 失败回滚策略 (2) 外部系统拒绝处理 (3) 并发事件优先级规则。clarify 完成后可进入 `spec`（需要 `architecture-designer` 设计状态机实现方案）。
```

## Report Quality Checklist

Before submitting a requirement analysis report, verify:

- [ ] Every P0/P1 cites specific text or section from the source document
- [ ] Facts, inferences, and assumptions are clearly separated
- [ ] Follow-up questions are concrete and answerable (not "please clarify further")
- [ ] Technical design concerns are separated from true requirement gaps
- [ ] The readiness recommendation matches the highest unresolved priority level
- [ ] Chinese terms are checked against the ambiguity table when analyzing Chinese documents
- [ ] The report does not invent business decisions or advance loopx workflow state
- [ ] Impact is classified as unknown only when evidence is genuinely absent, not when it can be inferred from context
- [ ] Behavioral model covers all identified states, transitions, operations, and mutations (when applicable)
- [ ] Quality attribute scoring covers all identifiable requirement statements
- [ ] Traceability matrix links all requirements to goals and acceptance criteria
- [ ] Maturity scorecard is consistent with the qualitative findings
- [ ] The maturity grade matches the readiness recommendation (or override is explained)

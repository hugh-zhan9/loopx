# Example Reports

These examples illustrate the expected output quality and format for requirement analysis reports. They are synthetic but modeled on real-world patterns.

## Example 1: Gap Checklist (Chinese PRD)

Source: "用户积分兑换功能 PRD v0.3"

```markdown
# 需求缺口清单

## 结论

- 推荐下一步：clarify
- 阻塞项数量：3 个 P0
- 主要风险：兑换失败的回滚机制未定义，积分过期规则与兑换时序存在矛盾

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
- Overall readiness: Not ready for plan-to-exec
- Highest priority issue: Tenant isolation model for key scopes is undefined

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

- 推荐下一步：plan-to-exec
- 阻塞项数量：0
- 主要风险：大数据量导出的超时和内存问题（P1，不阻塞规划）

## 必须确认

（无 P0 阻塞项）

## 可以后续完善

- [ ] 问题：导出数据量上限
      证据：ticket 说 "导出当前筛选结果"，但仪表盘数据可能达百万行
      建议：plan-to-exec 时设计分页导出或异步下载，设定单次导出上限

- [ ] 问题：导出格式
      证据：ticket 仅说 "导出为 CSV"
      建议：确认是否需要 Excel (.xlsx) 支持，以及 CSV 编码（UTF-8 BOM for 中文兼容）

## 为什么可以进入 plan-to-exec

- 范围明确：在现有仪表盘页面增加导出按钮
- 接受标准可测试：点击导出 → 下载包含当前筛选数据的文件
- 无跨团队依赖：仪表盘前端和 API 由同一团队负责
- 剩余问题（数据量上限、格式）是实现选择，不影响产品行为决策
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

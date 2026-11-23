# Vague Requirement Triggers

Load when reviewing a PRD, ticket, or brief with ambiguous business wording.
Convert each hit into a concrete frontier question with a recommended default.

| Vague term | Ask to settle |
|---|---|
| "及时" / "real-time" | Exact latency bound (`< 1s` / `< 1m` / `< 1h`)? |
| "尽快" | SLA target and timeout/degradation behavior? |
| "相关人员" / "admin" | Exact roles, tenants, or permission groups? |
| "默认" / "configurable" | Default value, who can change it, scope, and effective timing? |
| "自动" | Trigger condition, failure handling, and manual fallback? |
| "必要时" / "视情况而定" | Exhaustive conditions and decision owner? |
| "支持" / "等" | Closed list vs open set, and explicit exclusions? |
| "保持一致" / "compatible" | Which consumers, payloads, versions, or consistency window? |
| "最近" / "recent" | Exact time window and timezone? |
| "合理" / "performant" | Measurable numeric target or acceptance check? |
| "参考 xx 系统" | Which behaviors must match verbatim vs differ intentionally? |

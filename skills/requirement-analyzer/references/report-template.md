# Requirement Analysis Report Template

Use this structure for the default markdown report. Keep it concise; expand only where the requirement has real risk.

## Full Analysis Report

```markdown
# Requirement Analysis

## Summary

- Source:
- Document type:
- Analysis depth:
- Overall readiness:
- Maturity score:
- Highest priority issue:

Note: readiness recommendation is authoritative; maturity score is diagnostic.

## Maturity Scorecard

| Dimension | Score | Max | Notes |
|-----------|-------|-----|-------|
| Completeness | | 20 | |
| Clarity | | 20 | |
| Testability | | 20 | |
| Behavioral Coverage | | 20 | |
| Traceability | | 20 | |
| **Total** | | **100** | |

Score band: [high confidence / medium confidence / low confidence / very low confidence]

Score confidence: [high / medium / low]

## Readiness Recommendation

Recommended next step: `clarify` | `spec` | `plan2exec` | blocked pending owner decisions

Reason:

## P0 Blockers

| Issue | Evidence | Why It Blocks | Question / Decision Needed |
| --- | --- | --- | --- |

## P1 Major Risks

| Issue | Evidence | Risk | Suggested Resolution |
| --- | --- | --- | --- |

## P2 Improvements

| Issue | Evidence | Improvement |
| --- | --- | --- |

## Quality Attribute Scoring

Include this section as a targeted summary in standard mode. Use per-statement scoring only in deep mode or when quality scoring is the requested output.

### Summary

| Attribute | Avg Score | Statements at 0 | Worst Offender |
|-----------|-----------|-----------------|----------------|
| Testability | | | |
| Atomicity | | | |
| Necessity | | | |
| Unambiguity | | | |
| Completeness | | | |
| Consistency | | | |
| Implementation-freedom | | | |
| Measurability | | | |

Overall quality: X/16 (Y%)

### Per-Statement Scoring (deep mode only)

| # | Requirement Statement | Test | Atom | Nec | Unamb | Comp | Cons | Impl | Meas | Total |
|---|----------------------|------|------|-----|-------|------|------|------|------|-------|

## Behavioral Model (conditional — stateful requirements only)

### State Model: [Entity Name]

| State | Type | Description | Timeout/Escalation |
|-------|------|-------------|--------------------|

State hierarchy: [flat / layered]

### Transition Matrix

| From | Action/Trigger | To | Actor | Guard | Failure Path |
|------|----------------|-----|-------|-------|--------------|

### Operation Matrix

| State | Allowed Operations | Forbidden | Role | Entry Point |
|-------|--------------------|-----------|------|-------------|

### Data Mutation Matrix

| Operation | Creates | Updates | Deletes | Side Effects | Audit/Notify | Idempotency |
|-----------|---------|---------|---------|--------------|--------------|-------------|

### Implementation Fit (when repo root provided)

| Element | Requirement | Implementation | Status | Evidence |
|---------|------------|----------------|--------|----------|

Summary: Covered X / Partial Y / Conflict Z / Missing W

### Behavioral Model Gaps

- [ ] ...

## Traceability Matrix

### Business Goals → Requirements

| # | Business Goal | Supporting Requirements | Coverage |
|---|--------------|----------------------|----------|

### Requirements → Acceptance Criteria

| # | Requirement | Acceptance Criteria | Quality |
|---|------------|--------------------|---------|

### Traceability Gaps

| Gap | Type | Priority | Impact |
|-----|------|----------|--------|

## Cross-Document Consistency (conditional — multiple docs only)

### Documents Analyzed

| # | Document | Version/Date | Role |
|---|----------|-------------|------|

### Contradictions

| Entity/Rule | Doc A Says | Doc B Says | Impact | Priority |
|-------------|-----------|-----------|--------|----------|

### Implicit Dependencies

| Document | Assumes | Defined In | Risk |
|----------|---------|-----------|------|

### Terminology Inconsistency

| Concept | Term in Doc A | Term in Doc B | Recommendation |
|---------|--------------|--------------|----------------|

## Evidence-Based Resolutions

| Question / Ambiguity | Evidence Used | Resolution Strength | Working Conclusion |
| --- | --- | --- | --- |

Resolution strength: `resolved by evidence` | `likely but needs confirmation` | `unresolved decision`

## Open Decisions For Clarify

| Decision | Candidate Interpretations | Consequence | Owner Needed |
| --- | --- | --- | --- |

## Facts

- ...

## Inferences

- Inference:
  Evidence:

## Assumptions

- Assumption:
  Why it matters:

## Follow-Up Questions

1. ...

Include only questions that remain after evidence-based resolution. Do not repeat questions already answered by the requirement package or repo context.

## Suggested Next Step

...
```

## Gap Checklist Mode

For a compact gap checklist, use:

```markdown
# 需求缺口清单

## 结论

- 推荐下一步：
- 成熟度评分：X/100 (等级)
- 阻塞项数量：
- 主要风险：

## 成熟度评分

| 维度 | 得分 | 满分 | 说明 |
|------|------|------|------|
| 完整性 | | 20 | |
| 清晰度 | | 20 | |
| 可测试性 | | 20 | |
| 行为覆盖 | | 20 | |
| 可追溯性 | | 20 | |
| **合计** | | **100** | |

## 必须确认

- [ ] 问题：
      证据：
      影响：

## 行为模型缺口 (如涉及状态流转)

### 状态模型

| 状态 | 类型 | 描述 | 超时处理 |
|------|------|------|----------|

### 缺失的转换/操作

- [ ] ...

## 质量评分摘要

| 属性 | 均分 | 评分为0的条目数 |
|------|------|----------------|

## 可追溯性缺口

- [ ] ...

## 可以后续完善

- [ ] 问题：
      证据：
      建议：
```

---
schema_version: 1
workflow_id: <workflow id>
stage: plan
execution_mode_readiness: build
stage_owner: plan
---

# loopx Development Plan: <task name>

## 文档定位

开发计划回答“按什么顺序交付、每个切片做到什么程度、依赖什么、如何验证、何时算完成”。它不重新做架构取舍，也不写字段级详细设计。

## 交付切片

| 切片 | 模式 AFK/HITL | 用户可见/系统行为 | 主要文件/模块 | 验收标准 | 验证信号 |
| --- | --- | --- | --- | --- | --- |
| Slice 1 | <AFK or HITL> | <behavior> | <files/modules> | <acceptance> | <command/evidence> |

## 实施顺序与依赖

| 顺序 | 工作 | 依赖 | 退出条件 |
| --- | --- | --- | --- |
| 1 | <work item> | <dependency> | <done signal> |

## 需求到开发切片

| 原始需求 | 切片 | 实现范围 | 完成判定 |
| --- | --- | --- | --- |
| <source requirement> | <slice> | <implementation scope> | <done definition> |

## 文件级变更清单

| 文件/目录 | 变更类型 | 所属切片 | 说明 |
| --- | --- | --- | --- |
| <path> | <add/modify/generate/test> | <slice> | <note> |

## 验证计划

| 验证层级 | 命令/证据 | 覆盖切片 | 失败处理 |
| --- | --- | --- | --- |
| 单元/集成/构建/人工 | <command or evidence> | <slice> | <fallback> |

## 人工确认点

- <HITL approval or manual validation point>

## 回滚/降级策略

- <rollback or remaining_scope rule>

## 完成定义

- 所有切片的验收标准都有实现和验证证据。
- `execution-record.md` 的 `completion_claim` 与实际范围一致。
- deslop 后重新运行回归验证。

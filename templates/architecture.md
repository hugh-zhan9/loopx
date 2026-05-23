---
schema_version: 1
workflow_id: <workflow id>
stage: plan
decision_id: <decision id>
chosen_option: <chosen option>
---

# loopx Architecture: <task name>

## 文档定位

架构文档回答“系统如何分层、如何集成、边界在哪里、哪些风险必须被设计约束”。它不是开发排期，也不是字段级详细设计。

| 文档 | 负责回答 | 不负责回答 |
| --- | --- | --- |
| `architecture.md` | 系统边界、模块职责、数据/状态模型、接口集成、架构决策和质量属性 | 逐文件编码步骤、字段默认值、函数签名细节 |
| `development-plan.md` | 切片顺序、依赖、验证、人工确认和完成定义 | 重新选择架构方向 |
| `design.md` | 字段、接口、函数、组件、状态机和边界条件 | 跨系统架构取舍或排期 |

## 架构目标与非目标

- 目标：<architecture goals>
- 非目标：<architecture non-goals>
- 不可越过边界：<hard boundaries>

## 上下文与系统边界

| 入口/参与方 | 上游来源 | 本系统职责 | 下游/外部依赖 | 本次边界 |
| --- | --- | --- | --- | --- |
| <actor or entrypoint> | <source> | <responsibility> | <dependency> | <in/out of scope> |

## 组件与职责

| 组件/模块 | 职责 | 不负责 | 调用方向 | 所有者/约束 |
| --- | --- | --- | --- | --- |
| <component> | <responsibility> | <non-responsibility> | <caller -> callee> | <constraint> |

## 数据与状态模型

| 实体/状态 | 关键字段/状态值 | 来源 | 一致性/幂等约束 | 审计/追踪 |
| --- | --- | --- | --- | --- |
| <entity or state> | <fields> | <source> | <consistency rule> | <audit trail> |

## 接口与集成契约

| 接口/事件/provider | 输入 | 输出 | 错误/权限 | 副作用边界 |
| --- | --- | --- | --- | --- |
| <contract> | <input> | <output> | <error/auth> | <side effect boundary> |

## 关键流程

1. <happy path step>
2. <state/data update>
3. <response or downstream handling>

异常流程：

- <failure path and handling>

## 质量属性与风险

| 质量属性 | 设计约束 | 验证方式 | 残余风险 |
| --- | --- | --- | --- |
| 可测试性 | <constraint> | <verification> | <risk> |
| 可观测性 | <constraint> | <verification> | <risk> |
| 安全/副作用 | <constraint> | <verification> | <risk> |

## 架构决策记录

| 决策 | 备选方案 | 选择理由 | 后续影响 |
| --- | --- | --- | --- |
| <decision> | <alternatives> | <why chosen> | <consequence> |

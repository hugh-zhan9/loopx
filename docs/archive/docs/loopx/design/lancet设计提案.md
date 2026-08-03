# lancet：Codex-only 实现层 support lens

Author(s): loopx
Last updated: 2026-06-25
Status: Draft
Discussion: 不涉及
Source requirements: clarify output in this conversation
Support lenses: architecture-designer, cli-developer

## Abstract / 摘要

我们新增 `lancet` 作为 Codex-only 的实现层 support lens，用 hook + skill contract 双轨注入“最小正确变更”纪律，只在 `exec` / `subagent-exec` / `review` / `final-review` / `fix` 生效，不进入 `clarify` / `spec`。

## Background / 背景与动机

当前 loopx 已有 skill-first 主链、subagent 机制和 workflow hook，但缺少一个专门约束实现层“少写、少造、少过度实现”的 support lens。Ponytail 证明了这类纪律能减少实现膨胀，并在子 agent 与 reviewer 侧保持一致；但它的 persona/mode 设计不适合直接照搬进 loopx。

## Goals And Non-Goals / 目标与非目标

目标：

- 在 Codex 中默认启用实现层纪律。
- 通过 hook 传递给主 agent 和 subagent。
- 在 review 侧显式检查过度实现。
- 允许 `on/off/status` 和环境变量/配置关闭。

非目标：

- 不改 clarify/spec 的规划思路。
- 不做新的 workflow 状态机。
- 不把能力自动扩展到其他 agent。

## Proposal / 设计方案

选择 `lancet` 作为实现层 support lens，采用三层合同：

- skill 文档定义正式规则。
- Codex hook 在实现/评审阶段注入 distilled rules。
- subagent brief / review package 复用同一纪律。

状态与默认值放在 `~/.loopx`，当前只做 Codex-only 安装和激活。规划层只加一行轻提示，提醒进入实现前再启用，不注入完整纪律。

## Support Lens Checks / 专项设计检查

| Support lens | Trigger | Design checks applied | Result |
|---|---|---|---|
| architecture-designer | 跨 hook、skill、subagent、review、配置与状态文件 | 边界、兼容性、失败模式、可运维性 | 需要双轨激活与 Codex-only 安装边界 |
| cli-developer | `on/off/status`、环境变量、配置文件、hook 输出 | 命令/配置/输出/非交互行为 | 需要显式开关与稳定输出约定 |

## Boundary Scenarios / 边界场景

- 无效输入：`lancet` 只接受已知 stage 和已知开关值。
- 重复操作：重复 `on`/`off` 应幂等。
- 并发：主 agent 与 subagent 同时读取状态时，状态文件必须可原子写入。
- 部分失败：hook 读取不到状态时退化为不注入，而不是阻塞会话。
- 兼容性：其他 agent 不自动启用。
- 不变行为：clarify/spec 继续保持完整思考，不被 lancet 收紧。

## Rationale / 理由与取舍

| Alternative | Why Not |
|---|---|
| 只靠 skill 文档 | 执行时容易漂，subagent 更容易丢 |
| 只靠 hook | 太隐式，正式合同不清晰 |
| 完整照搬 Ponytail mode | 过重，且会污染 loopx 的 skill-first 结构 |

## Compatibility / 兼容性

这是新增能力，不修改现有 workflow 的语义；但它会新增 Codex-only 的默认注入和 `~/.loopx` 状态文件约定。Claude/其他 agent 不自动启用。

## Operational And Security Impact / 运行与安全影响

hook 失败必须静默退化，不得阻断实现流程。状态文件与注入内容只承载纪律提示，不承载敏感数据。默认启用意味着用户需要清晰的关闭路径。

## Implementation And Transition / 实现与过渡

先落 skill 与 hook 的设计合同，再补安装面与治理测试。之后再让 subagent brief、review package 和 plan 文档消费同一套纪律。

## Open Questions / 待决问题

无

## Detailed Design Handoff / 详细设计交接

需要写详细设计。详细设计必须固定 Codex-only 安装、`~/.loopx` 状态、阶段性注入、subagent 继承、review 反过度实现、计划层轻提示。

## Appendix / 附录

建议的语义：

- `lancet on`：启用会话级持续纪律
- `lancet off`：关闭
- `lancet status`：查看当前状态

# lancet 设计文档

## 一、修订历史

| 版本号 | 修订内容 | 修订时间 | 修订人 |
|---|---|---|---|
| V1.0.0 | 新建初稿 | 2026-06-25 | loopx |

## 二、需求信息

### 2.1 需求背景

- 背景：Ponytail 证明了“实现层最小正确变更”能有效压缩实现膨胀，并且对子 agent、reviewer 和 hook 传递很关键；loopx 已有 skill-first 主链和 hook 体系，但没有一个专门约束实现层的 support lens。
- 需求目的：在 Codex 中默认启用一个仅作用于实现/评审层的 `lancet` support lens，减少过度实现，同时不削弱规划层思考。
- 目标用户/使用方：Codex 用户、subagent-exec/exec/review/final-review/fix 的执行者与 reviewer。
- 需求链接：本次澄清会话。
- 关联原始材料：现有 loopx skill-first 设计、workflow hook、subagent-exec、review、fix、installation spec。

### 2.2 需求范围

- 本期范围：
  - 新增 `lancet` support skill
  - Codex-only 自动注入 hook
  - `on/off/status` 会话控制
  - `~/.loopx` 状态持久化
  - 计划产物和 review 侧的最小实现约束
- 非目标：
  - 不改变 clarify/spec 的规划纪律
  - 不为 Claude 或其他 agent 做自动启用
  - 不引入新的主 workflow state machine
- 决策边界：
  - 只约束实现和评审层
  - 规划层只保留轻提示
  - 默认启用，但可关闭
- 依赖方：
  - Codex hook
  - `subagent-exec`
  - `exec`
  - `review`
  - `final-review`
  - `fix`
- 约束条件：
  - 只支持 Codex 的自动启用
  - 状态落 `~/.loopx`
  - hook 失败必须静默退化
- 触发的辅助 skills：architecture-designer, cli-developer

### 2.3 可行性分析

- 业务可行性：需求明确，且只针对实现层，不会冲击现有规划流。
- 技术可行性：已有 hook、skill、subagent brief、review package 和 `~/.loopx` 运行时目录，适合叠加实现。
- 团队接受能力：与现有 skill-first 范式一致，学习成本低。
- 时间成本：中等，主要在 hook、安装分流、subagent 传播和测试。
- 资源成本：低到中等。
- 替代方案：仅靠 skill 文档、仅靠 hook、完整照搬 Ponytail mode。
- 关键风险：hook 太薄无效、太厚吃 token、状态与实际阶段不同步。

## 三、概要设计

### 3.1 方案总述

- 设计目标：用最小的 Codex-only 运行时注入，让实现层默认遵循“少造、少写、少过度实现”的纪律。
- 总体思路：skill 定合同，hook 做即时注入，subagent/review 复用同一纪律，状态保存在 `~/.loopx`。
- 核心模块：`skills/lancet/`、Codex hook、状态文件、subagent brief、review contract、安装分流。
- 主要难点：如何在不引入新 workflow 状态机的前提下识别实现层；如何让 reviewer 和 subagent 同步纪律。
- 技术指标：Codex-only 生效、默认启用、可关闭、子 agent 一致、规划层不被污染。

### 3.2 整体架构设计

- 业务模式：skill-first helper + Codex-only support lens。
- 系统边界：仅 loopx 维护的 Codex 安装、hook 与 skill surface；不影响其他 agent 自动注入。
- 上下游系统：上游是用户调用的 `exec` / `subagent-exec` / `review` / `final-review` / `fix`；下游是 Codex hook、subagent brief、review package。
- 应用架构：skill 文档提供正式合同，hook 提供运行时纪律，状态文件提供持久化开关。
- 技术架构：`~/.loopx` 下的用户级状态 + Codex hook 读取 + 任务 brief 传播 + review 检查。
- 数据流转：用户/skill 激活 -> 写入 `~/.loopx` 状态 -> hook 读取并注入 -> subagent/reviewer 复用同一约束。

### 3.3 核心流程设计

| 流程 | 触发条件 | 参与系统/模块 | 主流程 | 异常/补偿 | 输出 |
|---|---|---|---|---|---|
| 实现层自动注入 | 进入 `exec` / `subagent-exec` / `fix` | skill、Codex hook、`~/.loopx` 状态 | 读取状态，注入精简纪律块 | 状态缺失则不注入 | 实现层提示词 |
| 评审层自动注入 | 进入 `review` / `final-review` / `fix` review | skill、Codex hook、review package | 注入实现约束 + over-engineering 检查 | hook 失败静默退化 | reviewer 提示词 |
| 子 agent 继承 | subagent 启动 | `subagent-exec`、subagent hook | 传播同一纪律和 stage 约束 | 子 agent 读不到状态则降级为通用纪律 | 子 agent 提示词 |
| 用户关闭 | `lancet off` 或配置关闭 | skill、状态文件 | 更新 `~/.loopx` 持久状态 | 重复关闭幂等 | 关闭结果 |

### 3.4 功能模块

| 模块 | 职责 | 关键功能 | 依赖 | 备注 |
|---|---|---|---|---|
| `skills/lancet/` | 正式合同 | 规则、开关、边界、示例 | 现有 skill 体系 | 新增 bundled skill |
| Codex hook | 运行时注入 | 读取状态、按阶段注入 | `~/.loopx` | 仅 Codex |
| 状态文件 | 会话与默认值 | on/off/status、持久化 | `~/.loopx` | 用户级 |
| `subagent-exec` 集成 | 子 agent 传播 | brief/review package 注入 | `lancet` skill | 让子 agent 不漂 |
| `review` / `final-review` / `fix` 集成 | over-engineering 检查 | 查可删减、查原生能力、查复用 | `lancet` skill | reviewer 同标准 |

### 3.5 新增/调整功能说明

按产品面拆分：

- 维护面：新增 `lancet` skill、resolver、治理测试。
- 安装面：Codex 安装路径启用，Claude/其他 agent 不自动注入。
- 运行面：Codex hook 读取 `~/.loopx` 状态并注入阶段性纪律。
- 评审面：`review`、`final-review`、`fix` 的 reviewer 侧增加 over-engineering 检查。

### 3.6 专项设计检查

| 辅助 skill | 触发原因 | 检查内容 | 设计结论 |
|---|---|---|---|
| architecture-designer | 跨 hook、状态、安装和多 agent 边界 | 边界、失败模式、回滚、兼容性 | 采用 Codex-only + `~/.loopx` + 双轨激活 |
| cli-developer | `on/off/status`、环境变量、配置文件、输出行为 | 配置来源、非交互、错误输出 | 保留显式开关与默认启用 |

## 四、详细设计

### 4.1 lancet 实现层 support lens 详细设计

#### 4.1.1 需求内容

- 入口：
  - `exec`
  - `subagent-exec`
  - `review`
  - `final-review`
  - `fix`
  - `lancet on/off/status`
- 操作人/调用方：
  - Codex 用户
  - 主 agent
  - subagent
  - reviewer
- 前置条件：
  - 已安装 loopx 的 Codex surface
  - `~/.loopx` 可写
- 输出结果：
  - 实现层/评审层注入最小正确变更纪律
  - 状态可查可关

#### 4.1.2 方案设计

- 核心逻辑：
  - skill 定义正式规则
  - hook 读取 `~/.loopx` 的 lancet 状态
  - 只在实现/评审层注入 distilled rules
- 状态流转：
  - `off` -> `on`
  - `on` -> `off`
  - `status` 仅读取
- 数据变更：
  - 写入用户级状态文件
- 计算公式：
  - 不涉及
- 幂等设计：
  - 重复 `on`/`off` 不改变最终状态
- 权限/越权控制：
  - 仅当前用户可读写其 `~/.loopx`
- 异常处理：
  - 状态缺失、解析失败、hook 失败时静默退化
- 补偿/重试：
  - 下次 hook 或命令再次读取即可恢复
- 日志与审计：
  - 状态变化可由 `status` 查看；不做强制审计日志

#### 4.1.3 流程步骤

1. 用户在 Codex 中进入实现/评审流程。
2. 相关 workflow skill 触发 lancet 纪律。
3. Codex hook 读取 `~/.loopx` 状态。
4. Hook 注入阶段性 distilled rules。
5. subagent 与 reviewer 复用同一纪律。

#### 4.1.4 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| 正常启用 | 注入实现层纪律 | 行为更收敛 | 无 |
| 规划层调用 | 只给轻提示，不注入完整纪律 | 不打断思考 | 无 |
| 非 Codex 平台 | 不自动启用 | 无感 | 无 |
| 状态文件缺失 | 退化为默认值或不注入 | 继续执行 | 无 |
| 重复开启/关闭 | 幂等 | 状态不抖动 | 无 |
| 并发子 agent 读取 | 读同一状态文件 | 一致 | 无 |
| 回滚/旧行为 | 关闭后恢复原行为 | 纪律消失 | 无 |

#### 4.1.5 不变行为

| 行为/表面 | 保持不变的原因 | 验证方式 |
|---|---|---|
| `clarify` / `spec` 的完整思考 | 规划层不能被过早收紧 | 设计评审与文档检查 |
| 非 Codex 自动注入 | 用户只想在 Codex 中用 | 安装测试 |
| 现有 workflow hook 的基本输出 | 不应破坏现有状态提示 | 回归测试 |

### 4.2 Codex hook 详细设计

#### 4.2.1 需求内容

- 入口：Codex lifecycle hook
- 操作人/调用方：Codex runtime
- 前置条件：Codex 安装面已启用 hook
- 输出结果：向上下文写入 lancet distilled rules

#### 4.2.2 方案设计

- 核心逻辑：按当前 stage 选择注入片段。
- 状态流转：读取 `~/.loopx`，再结合当前 workflow/skill signal。
- 数据变更：无。
- 幂等设计：同一阶段重复触发输出相同纪律块。
- 异常处理：失败静默退化。

#### 4.2.3 流程步骤

1. hook 启动。
2. 检查是否 Codex 场景。
3. 读取 lancet 状态。
4. 按阶段输出相应纪律块。

#### 4.2.4 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| 读取成功 | 注入 | 正常收敛 | 无 |
| 读取失败 | 退化 | 无中断 | 无 |
| 非 Codex | 不注入 | 无感 | 无 |

#### 4.2.5 不变行为

| 行为/表面 | 保持不变的原因 | 验证方式 |
|---|---|---|
| hook 不阻塞会话 | 这是现有 hook 纪律 | 失败静默测试 |

### 4.3 子 agent 继承详细设计

#### 4.3.1 需求内容

- 入口：`subagent-exec`
- 操作人/调用方：主 agent 派生的 subagent
- 前置条件：主 agent 已启用 lancet
- 输出结果：subagent 继承同一纪律

#### 4.3.2 方案设计

- 核心逻辑：task brief 和 subagent prompt 中显式携带 lancet 纪律。
- 状态流转：主 agent 写入，subagent 读取。
- 幂等设计：重复 brief 不改变语义。
- 异常处理：读不到状态时回落到通用纪律块。

#### 4.3.3 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| 子 agent 正常启动 | 继承纪律 | 更少漂移 | 无 |
| 状态缺失 | 通用纪律降级 | 仍可执行 | 无 |
| 多 subagent 并行 | 同一纪律块 | 一致 | 无 |

### 4.4 review / final-review / fix 详细设计

#### 4.4.1 需求内容

- 入口：`review`、`final-review`、`fix`
- 操作人/调用方：reviewer / 相关 workflow skill
- 前置条件：实现层产物存在
- 输出结果：过度实现检查与最小正确变更建议

#### 4.4.2 方案设计

- 核心逻辑：reviewer 增加一组专门检查项：
  - 是否已有现成能力可复用
  - 是否可用 stdlib / native feature
  - 是否存在可删减的抽象或文件
  - 是否过度实现
- 幂等设计：重复 review 不改变源码。
- 异常处理：无法判断时记录为风险，不强行裁决。

#### 4.4.3 边界条件

| 场景 | 处理方式 | 用户/调用方感知 | 监控/告警 |
|---|---|---|---|
| 明显 over-engineering | 退回修改 | review 失败 | 无 |
| 已经极简 | 通过 | 无额外动作 | 无 |
| 安全/验证/可访问性 | 不得删减 | 维持现有要求 | 无 |

#### 4.4.4 不变行为

| 行为/表面 | 保持不变的原因 | 验证方式 |
|---|---|---|
| review 仍优先正确性和风险 | lancet 只是增量纪律，不替代 review | review 流程测试 |

## 五、存储类设计

### 5.1 库表设计

不涉及。该需求不引入数据库。

### 5.2 数据迁移/初始化

- DDL：不涉及
- DML：不涉及
- 数据回填：不涉及
- 老数据兼容：已有 `.loopx` 内容保持不变，新状态文件按需创建
- 新老系统读写关系：旧 workflow state 继续可读；lancet 只新增用户级状态

### 5.3 缓存设计

不涉及。hook 直接读取状态文件，不引入缓存。

## 六、其他组件设计

### 6.1 消息设计

不涉及。

### 6.2 配置设计

| 配置项 | 环境 | 默认值 | 是否动态生效 | 说明 | 风险 |
|---|---|---|---|---|---|
| `LOOPX_LANCET` | 用户/进程 | `1` | 是 | 默认启用/关闭开关 | 环境与配置不一致 |
| `~/.loopx/lancet/config.json` | 用户 | `{"enabled":true}` | 是 | 用户级默认配置 | 配置文件损坏 |
| `~/.loopx/lancet/session.json` | 用户会话 | `active` | 是 | 会话级临时状态 | 并发写入 |

### 6.3 定时任务/批处理

不涉及。

### 6.4 技术组件

- 分布式锁：不涉及
- 唯一 ID：不涉及
- 加解密/验签：不涉及
- 字典转换：stage / mode 名称映射
- Excel/文件处理：不涉及
- 用户信息透传：Codex hook 透传 lancet 状态
- 限流/熔断：不涉及

## 七、接口设计

### 7.1 接口设计原则

- 扩展命令必须有明确的幂等语义。
- hook 输出必须稳定、短小、可预测。
- 配置和状态优先级必须明确。

### 7.2 接口清单

| 接口 | 调用方 | 服务方 | 权限/认证 | 幂等 | 文档地址 | 备注 |
|---|---|---|---|---|---|---|
| `$lancet on` | 用户 | skill/runtime | 本地用户 | 是 | 本文 | 启用 |
| `$lancet off` | 用户 | skill/runtime | 本地用户 | 是 | 本文 | 关闭 |
| `$lancet status` | 用户 | skill/runtime | 本地用户 | 是 | 本文 | 查看状态 |

### 7.3 接口明细

#### 7.3.1 `$lancet on`

- 路径/方法：skill invocation
- 请求头：不涉及
- 请求参数：无
- 响应参数：当前状态、默认状态、Codex-only 提示
- 错误码：状态不可写时返回可读错误

#### 7.3.2 `$lancet off`

- 路径/方法：skill invocation
- 请求头：不涉及
- 请求参数：无
- 响应参数：关闭确认
- 错误码：状态不可写时返回可读错误

#### 7.3.3 `$lancet status`

- 路径/方法：skill invocation
- 请求头：不涉及
- 请求参数：无
- 响应参数：当前默认值、会话值、Codex-only 生效范围
- 错误码：状态损坏时返回修复提示

## 八、系统发布

- 发布方式：随 loopx 版本发布 bundled skill 更新。
- 灰度策略：先 Codex-only，后续如需扩展再单独提案。
- 回滚方式：关闭 `lancet` 默认值或移除 Codex hook 注入。
- 兼容性：现有 workflow 不变；其他 agent 不自动受影响。

## 九、系统监控与维护

- 监控项：hook 是否成功读取状态、Codex-only 安装是否完整、review 是否仍能触发 over-engineering 检查。
- 告警：不做强告警；失败静默退化，必要时通过 `doctor` 或 `status` 排查。
- 维护策略：状态文件损坏时允许重建；文档与治理测试保持同步。

## 十、排期与规划

### Planning Handoff

`plan-to-exec` 可以决定：

- `skills/lancet/` 的具体文件拆分
- Codex hook 的精简规则文本
- `subagent-exec`、`review`、`fix` 里如何引用 lancet 纪律
- 具体测试命令与治理断言

必须返回 `spec` 或 `clarify` 的内容：

- 是否改变 Codex-only 范围
- 是否把 lancet 扩展到其他 agent
- 是否把规划层也纳入完整纪律
- 是否新增新的 workflow state machine

## 十一、QA

- 验证 `lancet on/off/status` 的幂等性。
- 验证 Codex-only 自动注入，Claude/其他 agent 不自动启用。
- 验证 subagent 继承同一纪律。
- 验证 review 能捕捉 over-engineering。
- 验证规划层只保留轻提示。


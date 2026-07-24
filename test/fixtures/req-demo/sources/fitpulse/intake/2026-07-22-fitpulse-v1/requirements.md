# FitPulse v1 Requirements Contract

| 项 | 内容 |
|----|------|
| Source | `REQUIREMENTS.md` (repo root) |
| Product | FitPulse |
| Version | v1 |
| Form | macOS 本地桌面应用 |
| Platform | 仅 macOS 13 Ventura 及以上 |
| UI language | 中文 |
| Status | complete — ready for handoff |
| Handoff | `needs_spec` |

## Intent

用户需要在 Mac 上快速记录日常运动，并回顾「这个月练了多少」「最近趋势如何」。

v1 目标：

1. 记录运动事件（名称 + 关键指标）
2. 维护运动名称库（预设 + 自定义）
3. 以月度热力图展示活跃度；格子强度按当日总时长（分钟）
4. 以趋势曲线展示变化；横轴为时间，纵轴可选指标
5. 数据仅存本机，无账号、无云同步

## Scope

### In scope

- 运动事件 CRUD（字段与校验见 source §3.1 / Domain rules）
- 运动名称库：预设种子、自定义增删改、归档/取消归档（source §3.2）
- 月度热力图与日明细（source §3.3）
- 趋势曲线：范围、纵轴、名称过滤（source §3.4）
- 页面：今日、热力图、趋势、名称库、历史（今日与历史分立；导航形态不限）
- 本机 SQLite 持久化；重启保留；离线可用
- 中文 UI；写入失败明确提示

### Confirmed decisions

| ID | Decision | Source |
|----|----------|--------|
| D-01 | 桌面框架：Tauri 2（不引入第二套桌面壳） | source §6 |
| D-02 | 前端框架：React | clarify Round 1；用户「嗯」 |
| D-03 | 界面语言：中文 | source |
| D-04 | 平台：仅 macOS 13+ | source |
| D-05 | 无账号、无云同步、无遥测 | source §1 / §5 / §8 |
| D-06 | 本地存储：SQLite | clarify Round 2；用户「嗯」 |
| D-07 | 「今日」与「历史」分立页面；导航形态不限 | clarify Round 3；用户「嗯」 |
| D-08 | 非目标按 Round 4 锁定（见 Non-goals） | clarify Round 4；用户「嗯按上述推荐锁定」 |
| D-09 | 验收合同采纳 AC-01…13 与 TC-01…13 | clarify Round 5；用户「嗯」 |

### Pending decisions

None material. Remaining choices (具体 SQL 插件、图表库、导航控件形态、精确 UI 布局) 为实现/设计细节，交由 `spec`。

## Non-goals

Confirmed binding for v1 (clarify Round 4):

- 账号、登录、多用户、云同步、分享、社区
- GPS 轨迹、地图、手环手表接入、HealthKit
- 通知提醒、成就徽章、训练计划、AI 教练
- 自定义热力分档、曲线任意自定义日期区间
- 多语言
- 非 macOS 版本
- 应用内数据导出/导入、备份恢复 UI（OS 级备份应用数据目录不在讨论范围）

## Constraints

- Tauri 2 only for desktop shell；frontend React；charts/heatmap in frontend
- Suggested layout: `src-tauri/` + `src/`
- SQLite in app local data directory；restart retains data；core features offline
- ~1000 events: heatmap / 近30日 curve switch feels instant（aggregate target < 300ms）
- Write failures must surface explicit Chinese errors；no silent data loss
- Local calendar-day bucketing by event `started_at` in system timezone；edit that crosses days rebuckets on save

## Domain rules (from source, binding)

### Event fields

| Field | Required | Rules |
|-------|----------|-------|
| 运动名称 | yes | 必须来自名称库未归档项 |
| 开始时间 | yes | 日期时间；新建默认当前时刻 |
| 时长 | yes | 正整数分钟，`1`–`1440` |
| 距离 | no | 非负，km，最多 2 位小数；未填为空 |
| 卡路里 | no | 非负整数 kcal，上限 `100000`；未填为空 |
| 备注 | no | trim 后最长 500；空则不存内容 |

### Name library

- Presets on first launch (immutable physically): `跑步`、`力量训练`、`骑行`、`游泳`、`步行`、`瑜伽`、`其他`
- Custom create: trim length 1–40；case-insensitive unique across all incl. archived；cannot collide with presets
- Rename: custom only；uniqueness same；history shows current label
- Archive / unarchive: preset and custom；archived excluded from create/edit pickers；history still shows label
- Delete: custom only and only when unreferenced； else archive with reason

### Heatmap

- One calendar month；prev/next；future months allowed (all empty)
- Week starts Monday
- Intensity = sum of duration minutes that local day
- Bands: 0 无；1–29 低；30–59 中；60–119 高；≥120 最高
- Title `YYYY年M月` + month total minutes
- Day click → list or「当日无运动记录」

### Trend

- Ranges: 近7天 / 近30天（default）/ 本月； metrics: 次数 / 时长（default）/ 距离 / 卡路里
- Name filter: 全部 or one name including archived
- Missing days plot 0； no day skipping； empty range shows axes +「所选范围内暂无运动数据」
- Unfilled distance/calories count as 0 in daily aggregates

## Acceptance Criteria

Canonical package confirmed Round 5.

- **AC-01** WHEN 用户新增合法自定义运动名称并保存成功，THEN 该名称出现在名称库且可在新建事件中选择，AND 使用该名称可成功创建一条事件。
- **AC-02** WHEN 用户保存事件时名称为空/已归档，或时长 `<1` 或 `>1440`，或距离/卡路里/备注违反字段规则，THEN 保存被阻止，AND 显示对应中文错误说明，AND 数据不写入。
- **AC-03** WHEN 同一本地日存在两条事件时长分别为 A、B 分钟，THEN 热力图该日总时长为 A+B，AND 档位按分档表计算。
- **AC-04** WHEN 使用固定样例数据并在趋势图切换纵轴「时长」与「次数」，THEN 每日点值分别等于当日时长合计与当日事件条数（样例见 TC-04）。
- **AC-05** WHEN 某名称被归档，THEN 新建/编辑表单可选列表不再包含该名称，AND 既有历史事件仍显示该名称的当前标签。
- **AC-06** WHEN 自定义名称已被至少一条事件引用，THEN 删除操作被拒绝并说明原因，AND 用户仍可归档该名称。
- **AC-07** WHEN 用户删除一条事件，THEN 必须先出现二次确认（文案含运动名与开始时间），AND 确认后事件永久删除且不可恢复，AND 今日列表、历史、热力图、趋势同步不再包含该事件。
- **AC-08** WHEN 用户创建名称与事件后完全退出并重新启动应用，THEN 名称库与事件数据完整保留且界面可读。
- **AC-09** WHEN 用户重命名自定义名称，THEN 名称库显示新标签，AND 所有关联历史事件展示新标签，AND 若新名与全库（含归档）不区分大小写冲突则拒绝保存。
- **AC-10** WHEN 用户编辑事件开始时间导致本地日历日变化并保存，THEN 热力图与趋势按新日历日重新归桶，AND 原日期聚合不再计入该事件时长。
- **AC-11** WHEN 趋势名称过滤选择某一已归档名称，THEN 曲线仅聚合该名称的事件，AND 横轴日期连续不跳日。
- **AC-12** WHEN 首次启动或对应列表无数据，THEN 预设七个名称已写入，AND 今日显示「今天还没有运动记录」，AND 历史显示「暂无运动记录，先去打卡吧」，AND 热力/曲线为空态且不报错。
- **AC-13** WHEN 用户尝试物理删除预设名称，THEN 操作不可用或被拒绝，AND 预设名称仍存在（可归档）。

## Acceptance Scenarios

- **TC-01** (AC-01) 新增自定义名「攀岩」，新建事件选择「攀岩」、时长 45，保存成功；今日与历史可见该事件。
- **TC-02a** (AC-02) 时长填 `0` → 保存失败并中文提示；库中无新事件。
- **TC-02b** (AC-02) 名称为已归档项（若 UI 仍可强制提交）或空 → 保存失败并提示。
- **TC-02c** (AC-02) 备注 501 字 → 保存失败并提示。
- **TC-03** (AC-03) 同日本地日写入 20 分钟与 40 分钟两条 → 该日合计 60 → 档位「高」。
- **TC-04** (AC-04) 固定样例：本地日 D1 两条（30 分、30 分）；D2 一条（60 分）；其余日无数据。近 30 天、过滤全部：纵轴「次数」D1=2、D2=1、其余 0；纵轴「时长」D1=60、D2=60、其余 0。
- **TC-05** (AC-05) 归档「跑步」后，新建表单不可选「跑步」；既有「跑步」事件在历史仍显示「跑步」。
- **TC-06** (AC-06) 自定义名已被引用时点删除 → 拒绝并提示只能归档；归档成功后仍不可删。
- **TC-07a** (AC-07) 删除流程出现确认且含名称与开始时间；取消则事件仍在。
- **TC-07b** (AC-07) 确认删除后，今日/历史/热力/趋势均不再包含该事件。
- **TC-08** (AC-08) 写入后杀进程重启 → 数据仍在。
- **TC-09** (AC-09) 自定义「Hiit」改名为「HIIT」成功且事件跟随；再改名为已存在的「跑步」失败。
- **TC-10** (AC-10) 事件从本日 22:00 改到昨日 22:00 保存 → 本日热力减少该时长，昨日增加。
- **TC-11** (AC-11) 归档名「游泳」下有历史事件；趋势过滤「游泳」→ 仅计这些事件；无事件日为 0。
- **TC-12** (AC-12) 清空数据目录后首次启动 → 七个预设存在；今日/历史文案正确；热力/曲线不报错。
- **TC-13** (AC-13) 对「跑步」执行删除 → 不可删除；归档后名称库仍可看到归档态「跑步」。

## Open Questions

None material for clarify. Spec should fix: SQLite schema/migrations, Tauri command surface, aggregation query ownership, chart library, navigation chrome, and verification approach for `<300ms` aggregate target.

## Residual Risks

- 不提供应用内导出：用户重装/清数据目录可能导致不可恢复丢失（已接受为 v1）
- 性能目标依赖实现与测量方式，需在 spec 定义验证手段
- 时区以系统本地为准；用户旅行跨时区时的历史展示边界未单独产品化（沿用 source：按保存时系统本地日历日归桶）

## Important user wording

- Round 1–3, 5: 「嗯」
- Round 4: 「嗯按上述推荐锁定」

## Handoff Recommendation

`needs_spec` — greenfield 产品行为与验收已闭合，但 SQLite 数据模型、Tauri 宿主/前端边界、聚合职责与页面设计仍需设计规格后再进入实现规划。

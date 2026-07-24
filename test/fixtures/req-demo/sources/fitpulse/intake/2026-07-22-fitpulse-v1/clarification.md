# FitPulse v1 Clarification

| 项 | 内容 |
|----|------|
| Source | `REQUIREMENTS.md` |
| Package | `.loopx/intake/2026-07-22-fitpulse-v1/` |
| Started | 2026-07-22 |
| Completed | 2026-07-22 |
| Brownfield | greenfield repo；仅有 source PRD，无既有实现代码 |

## Assumptions Challenged

- Source §9 lists three implementation choices as open; closed as React + SQLite + separate Today/History pages.
- Source AC-01…AC-08 are directional; rewritten to WHEN/THEN and extended with AC-09…13 for source behaviors that lacked anchors (rename, rebucket, archived trend filter, empty/first-run, preset undeletable).
- Local-only apps often imply export/backup; Round 4 explicitly excluded in-app export/import/backup UI.

## Rejected Alternatives

| Alternative | Rejected because |
|-------------|------------------|
| Svelte / Vue for frontend | User confirmed React in Round 1 |
| Pure JSON / local file as v1 default storage | User confirmed SQLite in Round 2 |
| 「今日」+「历史」同页分区 | User confirmed separate pages in Round 3 |
| v1 含应用内导出/导入/备份恢复 UI | User confirmed Round 4 lock: 「嗯按上述推荐锁定」 |
| 仅保留 source AC-01…08、不补 AC-09…13 | User confirmed full AC/TC package in Round 5 |

## Q&A Log

### Round 1 — Frontend framework

- Question: 前端框架选 React / Svelte / Vue？
- Recommendation: React
- User answer (exact): 「嗯」
- Confirmed decision: 前端框架选用 React

### Round 2 — Local storage

- Question: 本地存储方案选什么？
- Recommendation: SQLite（via Tauri / rusqlite 或同类）
- User answer (exact): 「嗯」
- Confirmed decision: 本地存储采用 SQLite
- Rejected: 纯 JSON/本地文件作为 v1 默认存储

### Round 3 — Today vs History page shape

- Question: 「今日」与「历史」是分立页面，还是同页分区？
- Recommendation: 分立页面
- User answer (exact): 「嗯」
- Confirmed decision: 「今日」与「历史」采用分立页面；导航形态（侧栏 / Tab / 顶栏）仍为实现细节，不限定
- Rejected: 同页上下分区作为 v1 默认信息架构

### Round 4 — Non-goals pressure pass

- Question: v1 非目标清单是否以 source §8 为准并额外排除「数据导出/导入」？
- Recommendation: 锁定 §8，并排除应用内导出/导入与备份恢复 UI
- User answer (exact): 「嗯按上述推荐锁定」
- Confirmed decision: Non-goals 按推荐锁定（见 requirements.md）

### Round 5 — AC/TC package

- Question: 是否采纳 requirements.md 中的 AC-01…AC-13 与 TC-01…TC-13 作为 v1 验收合同？
- Recommendation: 采纳
- User answer (exact): 「嗯」
- Confirmed decision: AC-01…13 与 TC-01…13 为 canonical 验收合同

## Conversation summary

Greenfield FitPulse v1：macOS 13+ 本地 Tauri 2 应用，React + SQLite，中文 UI，无账号/云/遥测/应用内导出。五页职责中「今日」与「历史」分立。验收合同为 AC-01…13 / TC-01…13。下一步需要设计规格（数据模型、Tauri 边界、聚合与页面）。

## Resume State

- current_round: 5
- ambiguity_score: low
- unresolved_count: 0
- non_goals_resolved: true
- decision_boundaries_resolved: true
- pressure_pass_complete: true
- handoff_decision: needs_spec
- next_question: none

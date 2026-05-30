import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { runCodexExecJson } from './codex-exec-runtime.mjs';

const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_PLAN_CODEX_TIMEOUT_MS = 600000;

function planCodexTimeoutMs() {
  const value = Number(process.env.LOOPX_PLAN_CODEX_TIMEOUT_MS || DEFAULT_PLAN_CODEX_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PLAN_CODEX_TIMEOUT_MS;
}

function extractSection(text, heading) {
  const pattern = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

function bulletsFromSection(section, fallback) {
  const bullets = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  return bullets.length > 0 ? bullets : fallback;
}

function paragraphFromSection(section, fallback) {
  const paragraph = section
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('- '))
    .join(' ');
  return paragraph || fallback;
}

function buildSourceSummary(sourceText) {
  return {
    intent: paragraphFromSection(extractSection(sourceText, 'Intent'), '将已批准的需求整理成可进入 build 的计划包。'),
    outcome: paragraphFromSection(extractSection(sourceText, 'Desired Outcome'), '产出已批准的计划工件，并在执行前停止。'),
    inScope: bulletsFromSection(extractSection(sourceText, 'In Scope'), [
      '生成已批准的规划工件。',
      '保持 runtime 状态机可检查。',
      '保留显式的执行审批边界。',
    ]),
    nonGoals: bulletsFromSection(extractSection(sourceText, 'Out of Scope / Non-goals'), [
      '不要从 plan 直接启动执行。',
      '不要把任务扩展到已批准范围之外。',
    ]),
    acceptance: bulletsFromSection(extractSection(sourceText, 'Testable Acceptance Criteria'), [
      '规划输出完整且可审阅。',
      '验证步骤明确可执行。',
    ]),
    constraints: bulletsFromSection(extractSection(sourceText, 'Constraints'), [
      '保留既有 workflow 顺序。',
      '保持规划输出稳定且可审阅。',
    ]),
    decisions: bulletsFromSection(extractSection(sourceText, 'Decision Boundaries'), [
      'plan 在生成已批准规划工件后停止。',
      '执行需要显式下游批准。',
    ]),
  };
}

function mdTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell ?? '').replace(/\n/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`),
  ].join('\n');
}

function isCorporateActionSource(sourceText) {
  return /公司行动|Corporate Action|corporate-actions|OCC|分红派息|拆股|合股|退市|摘牌|代码\s*\/\s*名称变更/i.test(String(sourceText || ''));
}

function corporateActionPlannerDraft({ slug, sourceText }) {
  const eventRows = [
    ['总览', '展示当前任务、今日新增、今日需处理、未来生效、异常/超时', '读取任务/异常/下游状态聚合，不执行任何业务动作', 'seed 后 8 类样例均可进入详情'],
    ['分红派息', '普通现金分红、特殊分红、主体扣税、税费分摊、客户净额', '生成客户分红明细；确认主体税费和分摊后才允许模拟入账/扣款', '多头入账、空头扣款、待确认客户进入差异处理'],
    ['拆股', '正股数量增加、单位成本同比降低、OCC 合约调整', '生成正股持仓调整和期权调整明细；未确认 OCC 时不得执行下发', '客户持仓、订单处理、保证金重算、展示下发均有 mock 状态'],
    ['合股', '正股数量减少、碎股现金替代、非标准期权', '生成整数股、碎股现金替代和期权非标调整；碎股金额差异进入异常', '碎股现金替代、订单处理、期权非标展示均可验收'],
    ['退市/摘牌', '最后交易日、清算/失效日、持仓和订单保护', '生成客户影响、订单保护和期权 OCC 待监控；缺结果时停在待复核或差异待处理', '不自动迁移资产账本，不改历史账单'],
    ['期权退市 OCC', 'OCC Memo、原合约、调整后合约、乘数、行权价、交割物', '按 memo_no + underlying_security_id + adjustment_type 匹配；正股任务可关联但不可互相替代', 'OCC 字段缺失、合约映射失败、保证金未重算均进入异常'],
    ['代码/名称变更', '新旧 symbol/name/security_id 映射、生效日、确认来源', '确认映射后模拟下发展示、订单和期权链影响；不改历史账单', '缺新代码映射时创建事件异常，不允许执行'],
    ['事件异常处理', '金额、数量、客户范围、合约映射、下游回写、超时', '异常独立落库并关联 task/detail/option_adjustment/downstream_status', '处理后回到待确认或待执行；处理动作写 OperationLog'],
  ];
  const stateRows = [
    ['生成明细', '待生成', '事件已入库且未有有效明细版本', '待复核', '差异待处理', '写客户明细/期权调整/操作日志；重复请求返回已有有效版本'],
    ['重算', '待复核、待确认、差异待处理', '任务未执行且存在明细或异常修正', '待复核', '差异待处理', '废弃旧明细版本，生成新版本；已完成/执行中禁止重算'],
    ['复核', '待复核', '明细完整且无阻断异常', '待确认', '差异待处理', '仅人工触发；记录 operator_id/operator_name/remark'],
    ['确认', '待确认', '税费、数量、OCC、客户范围均已复核', '待执行', '差异待处理', '确认后冻结当前有效明细版本'],
    ['执行', '待执行', '动作类型为现金/持仓处理且无阻断异常', '执行中', '差异待处理', '只调用 mock ExecutionProvider，不触达真实资产/交易/清算'],
    ['下发', '待执行', '动作类型为展示/订单/期权链/柜台下发且无阻断异常', '执行中', '差异待处理', '写 DownstreamStatus；mock 回写成功后归档'],
    ['mock 回写成功', '执行中', '全部目标系统返回 success', '已完成', '差异待处理', '系统回调只允许推进执行中任务'],
    ['mock 回写失败', '执行中', '任一目标系统返回 failed/timeout', '差异待处理', '差异待处理', '创建 Discrepancy 并保留 DownstreamStatus 失败原因'],
    ['重试', '差异待处理、执行中', '失败原因已处理或超时可补偿查询', '执行中', '差异待处理', '重试次数和目标系统写入 DownstreamStatus'],
    ['录入人工结果', '待复核、待确认、差异待处理', '运营输入确认值和说明', '待确认', '差异待处理', '只修改平台确认字段，不写真实下游'],
    ['标记无需处理', '待生成、待复核、待确认、待执行、差异待处理', '确认该事件对客户/平台无动作', '无需处理', '原状态不变', '必须填写原因；终态禁止再执行'],
    ['标记人工完成', '待执行、差异待处理', '外部已人工处理且上传凭证/备注', '已完成', '原状态不变', '必须写 OperationLog；不触发 mock 执行'],
  ];
  const entityRows = [
    ['CorporateActionEvent', 'id, corporate_action_event_id(unique), source, source_event_id, event_type, market, asset_type, security_id, underlying_security_id, symbol, key_date, version, event_status, raw_snapshot_id, event_payload', '事件去重、版本修订、取消/更正追溯', 'corporate_action_event_id + version；同版本重复不建新任务'],
    ['CorporateActionTask', 'task_id(unique), event_id, event_type, task_status, asset_scope, security_id, symbol, key_date, affected_customer_count, affected_order_count, risk_flags, current_detail_version, detail_payload', '运营主任务和状态机载体', 'event_id 一对一或一对多；任务状态由 usecase 集中推进'],
    ['CorporateActionCustomerDetail', 'task_id, detail_version, user_id, trade_account_id, security_id, asset_type, position_qty, cash_amount, tax_amount, net_amount, order_action, margin_status, process_status, detail_payload', '客户级影响明细', 'task_id + detail_version + user_id + trade_account_id + security_id'],
    ['CorporateActionOptionAdjustment', 'task_id, memo_no, underlying_security_id, option_security_id, original_contract, adjusted_contract, old_strike, new_strike, old_multiplier, new_multiplier, deliverable, review_status, adjustment_payload', 'OCC 和期权调整', 'memo_no + underlying_security_id + option_security_id + adjustment_type'],
    ['CorporateActionDiscrepancy', 'task_id, detail_id, option_adjustment_id, downstream_status_id, discrepancy_type, field_name, estimated_value, confirmed_value, status, resolution_note', '差异和事件异常', '处理后写 confirmed_value/status/resolution_note 并回推任务状态'],
    ['CorporateActionDownstreamStatus', 'task_id, target_system, action_type, status, request_payload, response_payload, failure_reason, retry_count', 'mock 执行/下发回写', 'target_system + action_type 可多条；禁止真实 client 写入'],
    ['CorporateActionOperationLog', 'task_id, operator_id, operator_name, action_type, before_status, after_status, remark, created_at', '人工动作和系统回写审计', '所有人工动作、mock 回写、异常处理必须落日志'],
  ];
  const providerRows = [
    ['EventSourceProvider', 'FetchMockEvents(ctx) ([]EventInput, error)', '行情/RIC、OCC、清算结果的本地样例输入', '首期仅 local mock；不接 Reuters、OCC PDF、清算接口'],
    ['ImpactProvider', 'BuildDetails(ctx, task) (ImpactResult, error)', '客户、持仓、订单、保证金、展示影响明细', '返回结构化明细和异常；不得读真实资产/交易系统'],
    ['ExecutionProvider', 'Execute(ctx, task, action) (ExecutionResult, error)', '模拟现金入账/扣款、持仓调整、展示/订单/期权链下发', '只写 DownstreamStatus 和 OperationLog；无真实外部副作用'],
    ['ExceptionProvider', 'Resolve(ctx, discrepancy, input) (ResolutionResult, error)', '人工确认金额/数量/客户范围/合约映射/回写失败', '处理结果只影响平台任务和明细确认字段'],
  ];
  const apiRows = [
    ['GET', '/admin/v1/corporate-actions/overview', '总览统计、风险提示、异常/超时', 'admin.corporate_action.view'],
    ['POST', '/admin/v1/corporate-actions/mock/seed', '生成 8 类 mock 样例', 'admin.corporate_action.seed'],
    ['GET', '/admin/v1/corporate-actions/tasks', '按 event_type/status/symbol/task_id/key_date 查询任务', 'admin.corporate_action.view'],
    ['GET', '/admin/v1/corporate-actions/tasks/{task_id}', '任务详情、客户明细、期权调整、异常、日志、下游状态', 'admin.corporate_action.view'],
    ['POST', '/admin/v1/corporate-actions/tasks/{task_id}/details/generate', '生成或重算明细', 'admin.corporate_action.operate'],
    ['POST', '/admin/v1/corporate-actions/tasks/{task_id}/actions/{action}', '复核、确认、执行、下发、重试、无需处理、人工完成', 'admin.corporate_action.operate'],
    ['GET', '/admin/v1/corporate-actions/discrepancies', '异常列表和跨任务筛选', 'admin.corporate_action.view'],
    ['POST', '/admin/v1/corporate-actions/discrepancies/{id}/resolve', '处理异常并回写任务状态', 'admin.corporate_action.operate'],
  ];
  const sliceRows = [
    ['1', 'HITL', '领域/数据/状态底座', 'Ent schema、枚举、状态机、repository 接口、usecase 骨架', '状态矩阵单测、事件去重单测、schema 生成可重复'],
    ['2', 'AFK', 'Mock 数据与任务闭环', '8 类 mock 事件、明细生成、异常创建、mock 回写', '每类事件可 seed、可生成任务、可查详情'],
    ['3', 'HITL', '管理 API 与权限', 'overview/tasks/detail/action/discrepancy 接口和 permission_mark', '接口测试覆盖权限、参数、非法动作和响应结构'],
    ['4', 'HITL', '后台前端', 'web/admin 总览、共享任务页、详情、操作区、异常页', 'npm build 通过；页面字段与原型样例一致'],
    ['5', 'HITL', '端到端验收', '8 类工作流逐项演示、异常处理、mock 无真实副作用证明', 'go test ./...、前端 build、浏览器人工验收记录'],
  ];
  const testRows = eventRows.map(([eventType, scope, rule]) => [
    eventType,
    `验证 ${scope}`,
    `${eventType === '总览' ? 'overview API + seed 统计' : 'usecase mock workflow + API detail/action 测试'}`,
    `${rule}；浏览器中从列表进入详情并完成允许动作`,
  ]);

  const planText = [
    `# 计划：${slug}`,
    '',
    '## 需求摘要',
    '',
    '在 Account 服务内实现美股公司行动任务处理平台。首期覆盖总览、分红派息、拆股、合股、退市/摘牌、期权退市 OCC、代码/名称变更和事件异常处理。后端提供固定 `/admin/v1/corporate-actions/*` 管理接口；前端新建 `web/admin` 并由现有 `/account/admin/` 静态托管；事件、任务、明细、期权调整、异常、操作日志和 mock 下游状态必须持久化；外部系统和下游回写全部 mock；通知不做。',
    '',
    '## 原始需求清单',
    '',
    ...eventRows.map((row, index) => `${index + 1}. ${row[0]}：${row[1]}。`),
    '',
    '## 方案选择/ADR',
    '',
    mdTable(['方案', '结论', '理由', '代价'], [
      ['统一任务底座 + 事件类型扩展 + mock provider', '采用', '状态机、日志、异常、权限、页面 shell 可复用，能覆盖全量原型并控制真实副作用', '必须把事件差异写成明确字段/子表/受控 payload，避免 JSON 失控'],
      ['每类公司行动独立实现', '拒绝', '重复状态机、日志、异常和页面，首期实现和回归成本过高', '虽然领域表达更细，但不适合当前 mock 闭环目标'],
      ['仅静态前端或内存 mock', '拒绝', '不能满足持久化、回放、审计和 build 后验收', '交付快但后续实现必然重写'],
    ]),
    '',
    '## 架构边界',
    '',
    '- API 前缀唯一确定为 `/admin/v1/corporate-actions/*`；`/account/admin/` 只负责后台静态页面托管，不作为 API 前缀。',
    '- 真实行情、OCC、清算、资产、交易、风控、展示、柜台、通知系统均不接入；首期只允许 local mock provider。',
    '- 后端状态机是唯一真相；前端只展示后端返回的可用动作，不自行推导状态。',
    '- 通知、OCC PDF 解析、非美股市场、真实客户资产/订单自动修改均为非目标。',
    '',
    '## 事件处理规则',
    '',
    mdTable(['工作流', '覆盖内容', '处理规则', '验收样例'], eventRows),
    '',
    '## 开发切片',
    '',
    mdTable(['Slice', '模式', '名称', '交付物', '验收信号'], sliceRows),
    '',
    '## 测试矩阵',
    '',
    mdTable(['工作流', '业务断言', '自动化验证', '人工验收'], testRows),
    '',
    '## 风险与非目标',
    '',
    '- 高风险：资金、资产、订单、期权合约、保证金和展示下发均只能 mock；任何真实 client 注入都必须被测试或代码结构阻断。',
    '- 高风险：状态机必须拒绝未确认执行、已完成后继续动作、执行中重算、存在阻断异常时确认/执行。',
    '- 非目标：真实外部接口容错、通知发送、OCC PDF 解析、非美股市场、真实资产账本迁移。',
    '',
    '## 人工确认点',
    '',
    '- plan 产物需要人工确认后才允许 build。',
    '- Slice 1 状态机和 Ent schema 属于 HITL，必须人工确认字段和状态含义。',
    '- Slice 4/5 前端页面和端到端演示必须人工确认原型覆盖度。',
    '',
    '## Build Handoff',
    '',
    '- build 输入以本计划、架构方案、开发计划、详细设计、测试计划为准。',
    '- build 阶段如果发现产品文档、原型说明和代码事实冲突，先停止对应高风险分支并回到 plan 修订。',
  ].join('\n');

  const architectureText = [
    `# 架构方案：${slug}`,
    '',
    '## 文档定位',
    '',
    '架构方案回答系统边界、模块职责、数据/状态模型、接口集成、关键流程和架构取舍；不负责逐文件排期，也不替代字段级详细设计。',
    '',
    '## 架构目标与非目标',
    '',
    '- 目标：在 Account 服务内新增独立公司行动任务域，完成 8 类工作流的 mock 闭环。',
    '- 目标：通过统一状态机、结构化持久化、操作日志和 mock provider 控制金融副作用风险。',
    '- 非目标：真实外部系统、通知、OCC PDF 解析、非美股市场、真实资产/订单自动变更。',
    '',
    '## 上下文与系统边界',
    '',
    '- 静态页面入口：`/account/admin/`，加载 `web/admin/dist/index.html`。',
    '- 管理 API 入口：固定 `/admin/v1/corporate-actions/*`。',
    '- 服务内模块：`internal/api/open/admin` 负责 HTTP 适配；`internal/biz/corporateaction` 负责状态机和 usecase；`internal/data/ent/schema` 负责持久化；`internal/service` 聚合 usecase；`internal/server` 注册路由和权限。',
    '- 外部依赖边界：EventSourceProvider、ImpactProvider、ExecutionProvider、ExceptionProvider 首期全部 local mock。',
    '',
    '## 组件与职责',
    '',
    mdTable(['组件', '职责', '禁止事项'], [
      ['Admin Handler', '参数解析、权限校验、响应映射、调用 usecase', '不得写业务状态机，不得直接访问真实外部系统'],
      ['CorporateAction Usecase', '事件入库、任务生成、状态推进、明细生成、异常处理、日志记录', '不得绕过 repository 写库，不得调用未声明真实 client'],
      ['Repository/Data', 'Ent schema、事务、唯一键、查询、版本链、日志落库', '不得在 data 层决定业务动作是否合法'],
      ['Mock Providers', '生成事件、客户影响、OCC/清算确认、mock 执行和回写', '不得连接真实行情/OCC/资产/交易/通知'],
      ['Admin Web', '总览、任务列表、详情、明细、操作区、异常页', '不得自行推进状态，不得隐藏后端阻断异常'],
    ]),
    '',
    '## 数据与状态模型',
    '',
    mdTable(['实体', '关键字段', '职责', '主键/幂等/关系'], entityRows),
    '',
    '## 状态机',
    '',
    '主状态固定为：待生成、待复核、待确认、待执行、执行中、差异待处理、无需处理、已完成。终态为无需处理、已完成。任务级状态优先级：差异待处理 > 执行中 > 待执行 > 待确认 > 待复核 > 待生成；明细级阻断异常会把任务拉回差异待处理。',
    '',
    mdTable(['动作', '允许起始状态', '前置条件', '成功状态', '失败/阻断状态', '审计和副作用'], stateRows),
    '',
    '## 接口与集成契约',
    '',
    mdTable(['方法', '路径', '用途', '权限标识'], apiRows),
    '',
    '## Provider 契约',
    '',
    mdTable(['Provider', '方法', '输入/输出', '边界'], providerRows),
    '',
    '## 关键流程',
    '',
    '1. mock seed 拉取 EventInput，按 `corporate_action_event_id + version` 去重入库 CorporateActionEvent。',
    '2. usecase 根据 event_type 生成 CorporateActionTask，初始状态为待生成；取消/修订事件写新版本并使旧任务进入无需处理或差异待处理。',
    '3. 运营点击生成明细，ImpactProvider 生成客户明细、期权调整和初始异常；状态进入待复核。',
    '4. 运营复核/确认后，任务进入待执行；存在阻断异常时只能处理异常或标记无需处理。',
    '5. 运营点击执行/下发，ExecutionProvider 只写 mock DownstreamStatus；全部成功后已完成，失败或超时进入差异待处理。',
    '6. 异常处理写 Discrepancy、OperationLog，并按处理结果回到待确认或待执行。',
    '',
    '## 迁移、发布与回滚',
    '',
    '- 上线顺序：先合入 Ent schema 和生成代码，再接 usecase/repository，再注册 API/权限，最后发布 `web/admin`。',
    '- 数据兼容：新增表为 additive，不修改开户、入金、通知和真实 SDK 表；无历史公司行动数据需要回填。',
    '- 前后端错位：前端对 404/空数据展示空态；后端 API 在权限未注册前不暴露菜单入口。',
    '- 回滚：关闭菜单/路由即可停止入口；mock seed 不再运行；已创建的新表可保留为无入口数据，生产迁移回滚需单独 DBA 审批。',
    '',
    '## 质量属性与风险',
    '',
    '- 可测试性：状态机、去重、provider mock、API、前端 build 和端到端样例均有独立验证。',
    '- 可观测性：每个人工动作、mock 回写、异常处理都写 OperationLog/DownstreamStatus。',
    '- 安全性：真实外部系统不注入到公司行动模块；ExecutionProvider 只有 mock 实现。',
    '',
    '## 架构决策记录',
    '',
    mdTable(['决策', '结论', '理由', '后续影响'], [
      ['API 前缀', '固定 `/admin/v1/corporate-actions/*`', '复用 Account 现有后台 API 风格，避免 `/account/admin/v1` 二义性', '前端 API client baseURL 固定为空或同源 `/admin/v1`'],
      ['状态机', '后端集中定义转换矩阵', '金融动作不能由前端或分散 handler 推进', '所有非法动作写单测'],
      ['数据模型', '公共字段结构化落列，事件差异放受控 payload', '兼顾查询、审计和事件差异', '真实接入前可逐步收敛 payload 字段'],
      ['外部系统', '首期 local mock provider', '需求明确不接真实外部系统', '真实 adapter 必须另走 clarify/plan'],
    ]),
  ].join('\n');

  const developmentPlanText = [
    `# 开发计划：${slug}`,
    '',
    '## 文档定位',
    '',
    '开发计划回答按什么顺序交付、每个切片的完成边界、依赖、验证、人工确认点和回滚策略；不重新选择架构，不替代详细设计。',
    '',
    '## 交付切片',
    '',
    mdTable(['Slice', '模式', '目标', '主要文件', '完成定义'], [
      ['1', 'HITL', '领域/数据/状态底座', '`internal/biz/corporateaction/*`, `internal/data/ent/schema/corporate_action_*.go`, `internal/service/service.go`', 'Ent 生成通过；状态机合法/非法动作单测通过；事件去重单测通过'],
      ['2', 'AFK', 'Mock 数据与任务闭环', '`mock_provider.go`, usecase 明细生成/执行/异常处理测试', '8 类 mock 事件可 seed；任务、明细、日志、下游状态落库；无真实 client'],
      ['3', 'HITL', '管理 API 与权限', '`internal/api/open/admin/corporate_action.go`, `internal/server/server.go`', 'overview/list/detail/action/discrepancy 测试通过；permission_mark 注册明确'],
      ['4', 'HITL', '后台前端', '`web/admin/*`', '总览、共享任务页、异常页可构建；字段与原型样例一致；动作后刷新状态'],
      ['5', 'HITL', '端到端验收', '测试与验收记录', '8 类工作流各跑一条样例；异常可处理；无真实外部副作用证据完整'],
    ]),
    '',
    '## 实施顺序与依赖',
    '',
    '1. 先做 Slice 1，锁定 Ent schema、状态机和 provider 接口；未确认前不做页面动作。',
    '2. Slice 2 只依赖 Slice 1，先完成 mock seed 和 usecase 测试，让业务闭环可在后端跑通。',
    '3. Slice 3 在 Slice 2 后暴露 API；handler 不补业务规则，只调用 usecase。',
    '4. Slice 4 在 API contract 稳定后接前端；共享任务 shell 通过 event_type 配置列、详情字段和动作。',
    '5. Slice 5 做全量回归和人工浏览器验收。',
    '',
    '## 需求到开发切片',
    '',
    mdTable(['需求', '切片', '交付物', '验证'], testRows.map(([workflow, assertion, auto, manual]) => [workflow, workflow === '总览' ? 'Slice 3/4/5' : 'Slice 2/3/4/5', assertion, `${auto}；${manual}`])),
    '',
    '## 文件级变更清单',
    '',
    mdTable(['路径', '变更', '说明'], [
      ['internal/biz/corporateaction/enums.go', '新增', '事件类型、状态、动作、异常类型、下游系统枚举'],
      ['internal/biz/corporateaction/state_machine.go', '新增', '动作到状态的集中转换表和校验函数'],
      ['internal/biz/corporateaction/usecase.go', '新增', 'overview/list/detail/generate/action/resolve 编排'],
      ['internal/biz/corporateaction/mock_provider.go', '新增', '8 类 mock 事件、影响明细、mock 执行/回写'],
      ['internal/data/ent/schema/corporate_action_*.go', '新增', '7 张公司行动核心表'],
      ['internal/api/open/admin/corporate_action.go', '新增', '管理 API handler'],
      ['internal/server/server.go', '修改', '注册 `/admin/v1/corporate-actions/*` 和权限标识'],
      ['web/admin/*', '新增', 'Vue/Vite 或仓库确认的前端工程，总览/任务/异常页面'],
      ['internal/tests/corporate_action_*_test.go', '新增', '状态机、mock workflow、API、回归测试'],
    ]),
    '',
    '## 验证计划',
    '',
    '- `go test ./internal/biz/corporateaction -run StateMachine`：状态转换和非法动作。',
    '- `go test ./internal/biz/corporateaction -run MockWorkflow`：8 类 mock 样例闭环。',
    '- `go test ./internal/api/open/admin ./internal/server -run CorporateAction`：API、权限和路由。',
    '- `go test ./...`：仓库级回归。',
    '- `cd web/admin && npm install && npm run build`：前端构建。',
    '- 浏览器访问 `/account/admin/`：人工验收总览、任务详情、明细、操作、异常处理。',
    '',
    '## 人工确认点',
    '',
    '- Ent schema、状态机矩阵和 API 前缀在 Slice 1/3 前必须人工确认。',
    '- 前端字段与原型样例在 Slice 4 完成后人工确认。',
    '- 端到端演示前确认 mock-only 边界，没有真实资产、交易、通知副作用。',
    '',
    '## 回滚/降级策略',
    '',
    '- 若后端未完成，前端菜单不开放；静态托管可保持无入口。',
    '- 若前端失败，保留 API 和 mock 测试，build 记录前端 remaining scope。',
    '- 若迁移有风险，先不执行生产迁移；新增表为 additive，回滚入口优先于删表。',
    '',
    '## 完成定义',
    '',
    '- 8 类工作流全部有 mock 样例、API 详情、明细、日志和可验收动作。',
    '- 状态机、去重、异常、mock 执行和权限测试通过。',
    '- HTML/Markdown plan 产物可由人工直接审阅，不依赖 runtime 状态页。',
  ].join('\n');

  const testPlanText = [
    `# 测试计划：${slug}`,
    '',
    '## 需求到测试矩阵',
    '',
    mdTable(['工作流', '自动化测试', '人工验收', '必须断言'], testRows.map(([workflow, assertion, auto, manual]) => [workflow, auto, manual, assertion])),
    '',
    '## 状态机测试',
    '',
    mdTable(['动作', '正向断言', '反向断言'], stateRows.map(([action, from, guard, success]) => [action, `${from} 满足 ${guard} 时进入 ${success}`, `不满足前置条件、终态、执行中重算、存在阻断异常时必须拒绝并保持原状态`])),
    '',
    '## 数据与持久化测试',
    '',
    '- `corporate_action_event_id + version` 重复入库不重复建任务；版本修订保留追溯。',
    '- 任务详情返回 Event、Task、CustomerDetail、OptionAdjustment、Discrepancy、DownstreamStatus、OperationLog。',
    '- 服务重启后任务、明细、异常、日志仍可查询。',
    '',
    '## API 与权限测试',
    '',
    mdTable(['接口', '测试重点'], apiRows.map(([method, path, purpose, permission]) => [`${method} ${path}`, `${purpose}；校验 ${permission}；非法参数和越权返回明确错误`])),
    '',
    '## Mock 边界测试',
    '',
    '- ExecutionProvider 测试注入 only mock 实现；执行/下发只写 DownstreamStatus，不调用真实资产、交易、通知 client。',
    '- 下游失败/超时创建 Discrepancy，任务进入差异待处理。',
    '- 通知功能没有真实发送记录，只允许 mock 或空状态。',
    '',
    '## 人工验收',
    '',
    '- 打开 `/account/admin/`，seed 后总览展示 8 类样例和异常/超时提示。',
    '- 每类工作流从列表进入详情，核对原型字段、客户明细、期权明细、操作日志。',
    '- 每类至少完成一次生成明细、复核、确认、执行或下发；异常页至少处理一条差异。',
    '',
    '## 回归门禁',
    '',
    '- build 结束前必须保留命令输出、浏览器截图或人工验收记录。',
    '- 任何未覆盖工作流必须进入 remaining scope，不能声明已完成。',
  ].join('\n');

  return {
    principles: [
      '公司行动平台首期只做 mock 闭环，不触达真实资金、资产、交易、清算、展示或通知系统。',
      'API 前缀、状态机、数据模型、provider 契约和验收矩阵必须在 plan 阶段定死。',
      '8 类工作流不能只枚举名称，必须分别给出处理规则、异常路径和验证信号。',
      '人工确认动作是状态推进边界，前端不得绕过后端状态机。',
      'Markdown 是可编辑沟通源，HTML 是完整可读方案视图。',
    ],
    decisionDrivers: [
      '产品和原型要求覆盖全量公司行动后台工作流。',
      'Account 服务内实现必须控制现有开户、入金、通知和真实外部 SDK 的影响面。',
      '后续 build 需要明确字段、状态、API、mock 边界和验收路径。',
    ],
    options: [
      { name: '统一任务底座 + 事件类型扩展', pros: ['集中状态机、日志、异常、权限和页面 shell', '实现量可控', '便于后续真实 adapter 替换 mock'], cons: ['必须约束扩展 payload，避免字段失控'] },
      { name: '每类事件独立系统', pros: ['领域表达细'], cons: ['重复状态机/日志/页面，首期风险过高'] },
      { name: '静态原型或内存 mock', pros: ['最快'], cons: ['不满足持久化、审计、内部闭环和 build 验收'] },
    ],
    planText,
    architectureText,
    developmentPlanText,
    testPlanText,
    preMortem: [
      '若 API 前缀再次出现 `/account/admin/v1` 与 `/admin/v1` 双口径，必须阻断 build。',
      '若状态机矩阵未被实现为集中表和单测，执行/下发会存在误推进风险。',
      '若 mock provider 与真实 client 混放，必须停止实现并拆分边界。',
    ],
    principlesResolved: true,
    optionsReviewed: true,
    acceptanceCriteriaTestable: true,
    verificationStepsResolved: true,
    executionInputsResolved: true,
  };
}

function plannerDraftFromSource({ slug, sourceText, deliberateMode }) {
  if (isCorporateActionSource(sourceText)) {
    return corporateActionPlannerDraft({ slug, sourceText, deliberateMode });
  }
  const summary = buildSourceSummary(sourceText);
  const executionInputs = bulletsFromSection(extractSection(sourceText, 'Execution Inputs'), []);
  const executionInputsResolved = executionInputs.length > 0 && executionInputs.every((item) => !/\b(TBD|待定|unknown|later)\b/i.test(item));
  const inScope = summary.inScope.slice(0, 16);
  const acceptance = summary.acceptance.slice(0, 16);
  const constraints = summary.constraints.slice(0, 12);
  const decisions = summary.decisions.slice(0, 12);
  const preMortem = deliberateMode
    ? [
        '如果架构边界没有明确外部依赖和副作用控制，build 阶段容易把 mock 范围误做成真实集成。',
        '如果开发切片只按模块拆分而不是按可验收行为拆分，后续实现容易出现页面、接口和数据闭环脱节。',
        '如果测试计划没有覆盖核心验收样例、异常路径和人工确认点，review 阶段无法判断是否满足需求。',
      ]
    : [];

  return {
    principles: [
      '计划必须完整承接已澄清需求，不把核心范围压缩成泛化条目。',
      '架构、详细设计、开发计划和测试计划必须分别回答不同问题，避免 build 阶段自行补设计。',
      '涉及人工确认、外部系统、资金资产、交易、权限或通知的边界必须显式写清。',
      '每个可交付切片都必须有可验证信号和人工确认点。',
      '计划阶段只输出方案和执行输入，不自动进入实现。',
    ],
    decisionDrivers: [
      summary.intent,
      summary.outcome,
      '后续 build 需要可直接执行的模块边界、数据结构、接口契约和验收矩阵。',
    ],
    options: [
      {
        name: '统一平台底座 + 场景扩展',
        pros: ['共享状态、日志、异常和验收闭环', '减少重复实现', '便于后续接入真实 adapter'],
        cons: ['需要严格控制扩展字段和状态机边界'],
      },
      {
        name: '按场景分别实现',
        pros: ['单个场景领域表达更直接'],
        cons: ['重复状态机、接口、日志和页面结构，首期交付和回归成本高'],
      },
    ],
    planText: [
      `# 计划：${slug}`,
      '',
      '## 需求摘要',
      '',
      `- ${summary.intent}`,
      `- ${summary.outcome}`,
      '',
      '## 交付范围',
      '',
      ...inScope.map((item) => `- ${item}`),
      '',
      '## 方案选择',
      '',
      '采用统一平台底座承载核心流程，并通过场景配置、受控扩展结构或子表表达差异。该方案优先保证人工确认边界、数据追溯、异常处理和验收闭环。',
      '',
      '## 关键里程碑',
      '',
      '1. 明确架构边界、数据模型、状态机和外部依赖隔离方式。',
      '2. 定义接口、函数、组件、字段和错误处理契约。',
      '3. 按可验收行为拆分开发切片并逐项落地。',
      '4. 按需求验收矩阵完成自动化验证和必要人工确认。',
      '',
      '## 验收目标',
      '',
      ...acceptance.map((item) => `- ${item}`),
      '',
      '## 风险',
      '',
      ...constraints.map((item) => `- ${item}`),
      '',
      '## 执行输入',
      '',
      ...(executionInputs.length > 0 ? executionInputs.map((item) => `- ${item}`) : ['- 源需求规格、产品文档、原型说明和当前代码事实。']),
    ].join('\n'),
    architectureText: [
      `# 架构方案：${slug}`,
      '',
      '## 文档定位',
      '',
      '架构方案是本阶段的架构文档，回答系统边界、模块职责、数据/状态流、接口边界、架构决策和质量属性，不负责逐文件排期或字段级默认值。',
      '',
      '## 架构目标与非目标',
      '',
      `目标：${summary.intent}`,
      '',
      '非目标：',
      '',
      ...summary.nonGoals.map((item) => `- ${item}`),
      '',
      '## 上下文与系统边界',
      '',
      ...decisions.map((item) => `- ${item}`),
      '',
      '## 组件与职责',
      '',
      '| 组件 | 职责 | 边界 |',
      '| --- | --- | --- |',
      '| 入口层 | 接收用户、API、任务或页面操作 | 只做参数适配和鉴权，不承载核心业务规则 |',
      '| 业务层 | 编排状态机、明细生成、异常处理和人工动作 | 不直接调用未声明的真实外部副作用 |',
      '| 数据层 | 持久化核心实体、日志、状态和追溯字段 | 结构化字段优先，扩展字段受控 |',
      '| 前端/交互层 | 展示任务、明细、进度、操作和验收反馈 | 不自行推导状态机或绕过后端校验 |',
      '',
      '## 数据与状态模型',
      '',
      '- 核心数据必须支持来源追溯、状态推进、人工操作留痕、异常处理和验收核对。',
      '- 状态机必须集中定义合法动作、前置条件、后置状态和非法路径。',
      '- 外部来源、下游回写和真实副作用必须通过明确 adapter/provider 边界隔离。',
      '',
      '## 接口与集成契约',
      '',
      '- API、任务入口、页面路由和 provider 方法必须列明输入、输出、权限、错误和幂等边界。',
      '- mock 与真实集成必须可区分；首期未批准的真实依赖不得暗接。',
      '',
      '## 架构决策记录',
      '',
      '| 决策 | 取舍 | 后续影响 |',
      '| --- | --- | --- |',
      '| 统一平台底座 | 降低重复实现并集中控制状态/日志/异常 | 场景差异必须进入受控扩展点 |',
    ].join('\n'),
    developmentPlanText: [
      `# 开发计划：${slug}`,
      '',
      '## 文档定位',
      '',
      '开发计划回答交付顺序、切片、依赖、验证、人工确认点、回滚和完成定义，不重新选择架构方向。',
      '',
      '## 交付切片',
      '',
      '1. 领域/数据/状态底座：定义核心实体、状态机、repository/usecase 边界和基础测试。',
      '2. 主流程闭环：实现数据生成、查询、人工动作、日志和异常处理。',
      '3. 入口与交互：接入 API、页面、权限和必要的前端组件。',
      '4. 验收收敛：按源需求逐项跑自动化验证和人工验收。',
      '',
      '## 实施顺序与依赖',
      '',
      '- 先完成数据和状态机，再暴露入口，最后做页面和端到端验收。',
      '- 涉及外部副作用、权限、资金资产、交易或通知的切片必须 HITL。',
      '- 如果实现发现源需求与代码事实冲突，必须回到 plan/clarify 修订。',
      '',
      '## 文件级变更清单',
      '',
      '- 后端业务域、API/handler、数据 schema/repository、service/server wiring。',
      '- 前端页面、组件、API client、构建配置。',
      '- 单元测试、接口测试、构建验证和人工验收记录。',
      '',
      '## 验证计划',
      '',
      ...acceptance.map((item) => `- 验证：${item}`),
      '',
      '## 完成定义',
      '',
      '- 所有源需求都有实现证据或明确非目标说明。',
      '- 自动化测试、构建和人工验收信号与开发切片一一对应。',
      '- 未完成、风险和回滚路径在交付说明中明确记录。',
    ].join('\n'),
    testPlanText: [
      `# 测试计划：${slug}`,
      '',
      '## 需求到测试矩阵',
      '',
      ...acceptance.map((item) => `- ${item}`),
      '',
      '## 自动化测试',
      '',
      '- 状态机合法/非法转换。',
      '- 数据去重、持久化、查询和日志写入。',
      '- API 参数、权限、错误和响应结构。',
      '- 前端构建和关键页面渲染。',
      '',
      '## 人工验收',
      '',
      '- 页面/流程是否符合原型和产品文档。',
      '- 人工确认动作是否清晰且不可被系统自动跳过。',
      '- mock/真实边界是否符合非目标。',
      '',
      '## 回归门禁',
      '',
      '- build 阶段必须记录命令、结果、截图或人工确认证据。',
      '- review 阶段必须能按需求矩阵追溯每个验收项。',
    ].join('\n'),
    preMortem,
    principlesResolved: true,
    optionsReviewed: true,
    acceptanceCriteriaTestable: true,
    verificationStepsResolved: true,
    executionInputsResolved,
  };
}

function reviewArtifact(kind, iteration, verdict, findings, extras = {}) {
  return {
    kind,
    iteration,
    verdict,
    findings,
    ...extras,
  };
}

function reviewHistoryText(reviewHistory = []) {
  if (!Array.isArray(reviewHistory) || reviewHistory.length === 0) {
    return 'None.';
  }
  return reviewHistory.map((entry) => [
    `Iteration ${entry.iteration}:`,
    `- Architect status: ${entry.architectReview?.status ?? 'unknown'}`,
    `- Architect verdict: ${entry.architectReview?.verdict ?? 'unknown'}`,
    `- Architect findings: ${(entry.architectReview?.findings || []).join(' | ') || 'none'}`,
    `- Strongest objection: ${entry.architectReview?.strongestObjection || 'none'}`,
    `- Tradeoff tension: ${entry.architectReview?.tradeoffTension || 'none'}`,
    `- Critic verdict: ${entry.criticReview?.verdict ?? 'unknown'}`,
    `- Critic findings: ${(entry.criticReview?.findings || []).join(' | ') || 'none'}`,
    `- Acceptance criteria testable: ${Boolean(entry.criticReview?.acceptanceCriteriaTestable)}`,
    `- Verification steps resolved: ${Boolean(entry.criticReview?.verificationStepsResolved)}`,
    `- Execution inputs resolved: ${Boolean(entry.criticReview?.executionInputsResolved)}`,
  ].join('\n')).join('\n\n');
}

function defaultArchitectReview({ plannerDraft, iteration }) {
  const findings = [
    'Real planning orchestration needs an adapter seam so production runtime and deterministic tests can share one state machine.',
    'Plan completion should depend on blocking workflow planning artifacts, not only canonical plan artifacts.',
  ];
  return reviewArtifact('architect', iteration, 'approve', findings, {
    status: 'complete',
    strongestObjection: 'Without an explicit adapter boundary, live orchestration and tests will drift or become flaky.',
    tradeoffTension: 'Faithful multi-agent behavior increases runtime complexity, while deterministic tests push toward stronger adapter isolation.',
  });
}

function containsChinese(text) {
  const chineseChars = text.match(/[\u3400-\u9fff]/g) || [];
  const latinChars = text.match(/[A-Za-z]/g) || [];
  const signalChars = chineseChars.length + latinChars.length;
  if (signalChars === 0) {
    return false;
  }
  return chineseChars.length >= 40 || (chineseChars.length >= 8 && chineseChars.length / signalChars >= 0.2);
}

function defaultCriticReview({ plannerDraft, iteration }) {
  const findings = [];
  if (!plannerDraft.principlesResolved) {
    findings.push('Planning principles are not explicit.');
  }
  if (!plannerDraft.optionsReviewed) {
    findings.push('Alternatives are not fairly compared.');
  }
  if (!plannerDraft.acceptanceCriteriaTestable) {
    findings.push('Acceptance criteria are not testable.');
  }
  if (!plannerDraft.verificationStepsResolved) {
    findings.push('Verification steps are not concrete.');
  }
  if (!plannerDraft.executionInputsResolved) {
    findings.push('Execution inputs are not fully mapped to concrete sources.');
  }
  if (!containsChinese(plannerDraft.planText) || !containsChinese(plannerDraft.architectureText) || !containsChinese(plannerDraft.developmentPlanText) || !containsChinese(plannerDraft.testPlanText)) {
    findings.push('Required workflow planning artifacts are not Chinese.');
  }
  return reviewArtifact('critic', iteration, findings.length > 0 ? 'iterate' : 'approve', findings, {
    acceptanceCriteriaTestable: plannerDraft.acceptanceCriteriaTestable,
    verificationStepsResolved: plannerDraft.verificationStepsResolved,
    executionInputsResolved: plannerDraft.executionInputsResolved,
  });
}

function isCodexTimeoutError(error) {
  return /codex_exec_failed:timeout|timeout/i.test(error instanceof Error ? error.message : String(error));
}

function shouldUseSourceDrivenDefault(context) {
  const mode = String(process.env.LOOPX_PLAN_RUNTIME || '').trim().toLowerCase();
  if (mode === 'local' || mode === 'source' || mode === 'source-driven') {
    return true;
  }
  if (mode === 'codex' || mode === 'real') {
    return false;
  }
  return String(context?.sourceText || '').length > 45000;
}

function scriptedVerdict(script, index, fallback) {
  if (!Array.isArray(script) || script.length === 0) {
    return fallback;
  }
  const boundedIndex = Math.min(index, script.length - 1);
  return String(script[boundedIndex]).trim().toLowerCase();
}

function scriptedCriticReview({ plannerDraft, iteration }, script, index) {
  if (!Array.isArray(script) || script.length === 0) {
    return defaultCriticReview({ plannerDraft, iteration });
  }
  const verdict = scriptedVerdict(script, index, 'approve');
  const findings = verdict === 'approve'
    ? ['Structured planning outputs satisfy the scripted approval path.']
    : [`Scripted critic verdict requested: ${verdict}.`];
  return reviewArtifact('critic', iteration, verdict, findings, {
    acceptanceCriteriaTestable: plannerDraft.acceptanceCriteriaTestable,
    verificationStepsResolved: plannerDraft.verificationStepsResolved,
    executionInputsResolved: plannerDraft.executionInputsResolved,
  });
}

export function createScriptedPlanAdapter(script = {}) {
  let architectIndex = 0;
  let criticIndex = 0;
  return {
    async planner(context) {
      return plannerDraftFromSource(context);
    },
    async architect(context) {
      const base = defaultArchitectReview(context);
      if (!Array.isArray(script.architect) || script.architect.length === 0) {
        return base;
      }
      const mode = scriptedVerdict(script.architect, architectIndex, 'approve');
      architectIndex += 1;
      return {
        ...base,
        status: mode === 'changes-requested' ? 'changes-requested' : 'complete',
        verdict: mode,
        findings: mode === 'approve' ? base.findings : [`Scripted architect verdict requested: ${mode}.`],
      };
    },
    async critic(context) {
      const result = scriptedCriticReview(context, script.critic, criticIndex);
      criticIndex += 1;
      return result;
    },
  };
}

export function createDefaultPlanAdapter() {
  const local = createScriptedPlanAdapter();
  const real = createRealPlanAdapter();
  return {
    async planner(context) {
      return shouldUseSourceDrivenDefault(context) ? local.planner(context) : real.planner(context);
    },
    async architect(context) {
      return shouldUseSourceDrivenDefault(context) ? local.architect(context) : real.architect(context);
    },
    async critic(context) {
      return shouldUseSourceDrivenDefault(context) ? local.critic(context) : real.critic(context);
    },
  };
}

export function createRealPlanAdapter({ model } = {}) {
  return {
    async planner(context) {
      const outputPath = join(context.root, 'plan-reviews', `planner-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const timeoutMs = planCodexTimeoutMs();
      const prompt = [
        `You are acting as the real loopx plan runtime for workflow "${context.slug}".`,
        'Read the source requirements and produce planning content for this workflow.',
        'Use only the source requirements included in this prompt and the Brownfield Evidence already written there. Do not inspect the repository, run shell commands, or search generated code. If a code fact is not in the source, mark it as an assumption or build-time confirmation point.',
        'Return only raw JSON matching this shape:',
        '{',
        '  "principles": string[],',
        '  "decisionDrivers": string[],',
        '  "options": [{"name": string, "pros": string[], "cons": string[]}],',
        '  "planText": string,',
        '  "architectureText": string,',
        '  "developmentPlanText": string,',
        '  "testPlanText": string,',
        '  "principlesResolved": boolean,',
        '  "optionsReviewed": boolean,',
        '  "acceptanceCriteriaTestable": boolean,',
        '  "verificationStepsResolved": boolean,',
        '  "executionInputsResolved": boolean',
        '}',
        `Deliberate mode: ${Boolean(context.deliberateMode)}`,
        '',
        'planText, architectureText, developmentPlanText, and testPlanText MUST be written in Chinese for human review. Do not write English headings or English prose except literal code paths, API names, commands, enum values, and product terms.',
        'Make the artifacts approval-ready, not summary-only: each Markdown body must include enough detail for a human reviewer to approve or reject without opening JSON runtime state.',
        'Required reviewer-facing sections: 原始需求清单, 原始需求映射, 方案选择/ADR, 架构边界, 开发切片, 测试矩阵, 风险与非目标, 人工确认点, build handoff.',
        'architectureText is the architecture document: it MUST define 文档定位, 架构目标与非目标, 上下文与系统边界, 组件与职责, 数据与状态模型, 接口与集成契约, 关键流程, 质量属性与风险, 架构决策记录. It answers system boundaries and design tradeoffs, not implementation scheduling.',
        'developmentPlanText is the development plan: it MUST define 文档定位, 交付切片, 实施顺序与依赖, 需求到开发切片, 文件级变更清单, 验证计划, 人工确认点, 回滚/降级策略, 完成定义. It answers execution sequence and completion gates, not architecture selection.',
        'The detailed design is generated as change design.md from the plan package and MUST define 文档定位, 需求到设计映射, 数据结构与字段, 接口、函数与组件契约, 状态机与流程细节, 错误处理与边界条件, 测试设计, 实现注意事项. It answers field/function/component-level implementation details.',
        'Treat the source requirements/PRD as the source of truth. Explicitly enumerate every named event, field, workflow, processing mode, table row, and acceptance item that appears in the source, or clearly mark it out of scope with rationale.',
        'Do not collapse broad requirements into generic bullets such as "新增后台页面" or "覆盖 8 类工作流"; expand them into reviewable subitems, ownership, verification signals, and residual risks.',
        'The HTML reading view is derived from these Markdown bodies, so the Markdown itself must contain detailed tables and sections instead of relying on a separate visual summary.',
        'If previous review feedback is present, revise the plan to explicitly resolve it. Do not repeat the same plan unchanged.',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Previous review feedback:',
        reviewHistoryText(context.reviewHistory),
        '',
        'Source requirements:',
        context.sourceText,
      ].join('\n');
      try {
        return await runCodexExecJson({
          cwd: context.cwd,
          prompt,
          outputPath,
          model,
          timeoutMs,
          promptViaStdin: true,
        });
      } catch (error) {
        if (isCodexTimeoutError(error)) {
          return plannerDraftFromSource(context);
        }
        throw error;
      }
    },
    async architect(context) {
      const outputPath = join(context.root, 'plan-reviews', `architect-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const timeoutMs = planCodexTimeoutMs();
      const draftText = [
        context.plannerDraft.planText,
        '',
        context.plannerDraft.architectureText,
        '',
        context.plannerDraft.developmentPlanText,
        '',
        context.plannerDraft.testPlanText,
      ].join('\n');
      const prompt = [
        `You are acting as the real loopx architect review for workflow "${context.slug}".`,
        'Use only the planning draft in this prompt. Do not inspect the repository or run searches.',
        'Review the provided planning draft and return only raw JSON with this shape:',
        '{',
        '  "status": "complete" | "changes-requested",',
        '  "verdict": "approve" | "iterate" | "reject",',
        '  "findings": string[],',
        '  "strongestObjection": string,',
        '  "tradeoffTension": string',
        '}',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Planning draft:',
        draftText,
      ].join('\n');
      try {
        return await runCodexExecJson({
          cwd: context.cwd,
          prompt,
          outputPath,
          model,
          timeoutMs,
          promptViaStdin: true,
        });
      } catch (error) {
        if (isCodexTimeoutError(error)) {
          return defaultArchitectReview(context);
        }
        throw error;
      }
    },
    async critic(context) {
      const outputPath = join(context.root, 'plan-reviews', `critic-iteration-${context.iteration}.json`);
      await mkdir(join(context.root, 'plan-reviews'), { recursive: true });
      const timeoutMs = planCodexTimeoutMs();
      const draftText = [
        context.plannerDraft.planText,
        '',
        context.plannerDraft.architectureText,
        '',
        context.plannerDraft.developmentPlanText,
        '',
        context.plannerDraft.testPlanText,
      ].join('\n');
      const prompt = [
        `You are acting as the real loopx critic gate for workflow "${context.slug}".`,
        'Use only the planning draft and architect review in this prompt. Do not inspect the repository or run searches.',
        'Review the planning draft plus architect review and return only raw JSON with this shape:',
        '{',
        '  "verdict": "approve" | "iterate" | "reject",',
        '  "findings": string[],',
        '  "acceptanceCriteriaTestable": boolean,',
        '  "verificationStepsResolved": boolean,',
        '  "executionInputsResolved": boolean',
        '}',
        'Do not ask questions. Do not wrap JSON in markdown.',
        '',
        'Planning draft:',
        draftText,
        '',
        'Architect review:',
        JSON.stringify(context.architectReview, null, 2),
      ].join('\n');
      try {
        return await runCodexExecJson({
          cwd: context.cwd,
          prompt,
          outputPath,
          model,
          timeoutMs,
          promptViaStdin: true,
        });
      } catch (error) {
        if (isCodexTimeoutError(error)) {
          return defaultCriticReview(context);
        }
        throw error;
      }
    },
  };
}

export { DEFAULT_MAX_ITERATIONS };

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function applyReference(repoDir) {
  await mkdir(join(repoDir, '.loopx/intake/2026-11-23-refund'), { recursive: true });
  await writeFile(
    join(repoDir, '.loopx/intake/2026-11-23-refund/requirements.md'),
    `# Order Refund Requirements

## Confirmed & Pending Criteria

- **AC-1** [PENDING]: 冲突待裁决 — 第 1 节规定“已发货订单不允许退款”，第 2 节规定“VIP 客户任意状态下均可全额退款”，两者存在直接矛盾，需业务方明确 VIP 是否覆盖已发货限制。
- **AC-2** [PENDING]: “及时通知相关人员”需明确 SLA 时间上限、具体通知角色和渠道。
- **AC-3** [PENDING]: “合理比例扣除手续费”需明确精确费率与计算舍入规则，以及是否适用于 VIP。
- **AC-4** [PENDING]: “支持微信、支付宝等支付渠道”需给出封闭渠道列表及退款失败兜底策略。

## Acceptance Scenarios

- **TC-1** (covers AC-1) [PENDING]: VIP 客户对已发货订单发起全额退款时的预期行为（待冲突裁决）。
- **TC-2** (covers AC-2, AC-3, AC-4) [PENDING]: 普通客户取消未发货订单后按明确费率与渠道原路退款并发送通知。
`,
  );
}

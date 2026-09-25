import type { ProductionTaskId } from './productionProgress.js';

/** Host phase graph. Retries are separate execution receipts, never a cyclic edge. */
export interface ProductionTaskContract {
  dependencies: ProductionTaskId[];
  requirementIds: string[];
  access: 'read-only' | 'workspace-write' | 'host-validation';
  scope: string;
  gate: string;
}
export interface ProductionEvidence {
  sourceHash: string;
  assetsHash?: string;
  assets?: Array<{ id: string; status: string; relativePath?: string; sha256?: string }>;
  build?: { id: string; sourceHash: string; artifactHash: string; reportHash?: string };
  buildUnavailable?: string;
}
export interface ProductionExecution {
  id: string;
  taskId: ProductionTaskId;
  /** IDs of earlier receipts in the same attempt, including rejected reviews for repairs. */
  dependencies: string[];
  status: 'running' | 'completed' | 'needs-repair' | 'failed' | 'interrupted';
  startedAt: string;
  finishedAt: string | null;
  reused: boolean;
  detail: string;
  input?: ProductionEvidence;
  output?: ProductionEvidence;
  turn?: { threadId: string; turnId: string };
}
export function productionContracts(core: boolean, visual: boolean, requirementIds: string[]): Record<ProductionTaskId, ProductionTaskContract> {
  const make = (dependencies: ProductionTaskId[], access: ProductionTaskContract['access'], scope: string, gate: string): ProductionTaskContract =>
    ({ dependencies, requirementIds: [...requirementIds], access, scope, gate });
  return {
    planner: make([], 'read-only', '读取已选方案、参考与当前工程', '完成工程检查；不可修改需求与验收规则'),
    'core-loop': make(['planner'], 'workspace-write', '已选方案的最小玩法及对应输入验证', '真实输入完成玩法闭环、暂停与重开'),
    'visual-sample': make(core ? ['core-loop'] : ['planner'], 'workspace-write', '已选风格与一个代表性场景', '当前构建的宿主检查与独立画面审查均通过'),
    implementer: make(visual ? ['visual-sample'] : core ? ['core-loop'] : ['planner'], 'workspace-write', '实现已选需求；保留用户资料与验收约束', '完成实现回合并保存工程版本；后续必须独立评审'),
    reviewer: make(['implementer'], 'read-only', '只读检查当前工程及绑定证据', '明确通过或列出可复核问题'),
    repair: make(['implementer'], 'workspace-write', '仅修复当前失败项，仍受累计修复预算限制', '完成修复后重新评审与交付检查'),
    delivery: make(['implementer'], 'host-validation', '评审通过或修复完成后冻结构建，运行输入检查并保存证据', '版本一致、必需检查通过，再复核最新宿主证据'),
  };
}

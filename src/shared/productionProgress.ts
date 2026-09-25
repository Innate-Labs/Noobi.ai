import type { ProductionBudget, ProductionCounters, ProductionFailure } from './productionPolicy.js';
export type ProductionTaskId = 'planner' | 'core-loop' | 'visual-sample' | 'implementer' | 'reviewer' | 'repair' | 'delivery';
export type ProductionTaskStatus = 'pending' | 'running' | 'completed' | 'needs-repair' | 'failed' | 'interrupted' | 'not-needed';
export interface ProductionTask {
  id: ProductionTaskId;
  title: string;
  status: ProductionTaskStatus;
  attempts: number;
  reused: boolean;
  detail: string;
  updatedAt: string;
}
export interface ProductionAttempt {
  failure?: ProductionFailure | null;
  budgetUsed?: ProductionCounters;
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  error: string | null;
  tasks: ProductionTask[];
}
export interface ProductionProgress {
  budget?: ProductionBudget;
  failure?: ProductionFailure | null;
  projectId: string;
  planRunId: string;
  planVersionId: string;
  planTitle: string;
  revision: number;
  updatedAt: string;
  status: ProductionAttempt['status'];
  tasks: ProductionTask[];
  attempts: ProductionAttempt[];
  recoveryNote: string;
}
export interface ProductionSession { projectId: string; planRunId: string; attemptId: string }
export interface SavedProductionTurn { threadId: string; turnId: string; status: string; text: string }
export interface ProductionRecovery {
  planner: SavedProductionTurn;
  implementation?: SavedProductionTurn;
  sourceHash: string;
}
export interface ProductionTaskUpdate {
  id: ProductionTaskId;
  status: ProductionTaskStatus;
  detail?: string;
  reused?: boolean;
  turn?: SavedProductionTurn;
  sourceHash?: string;
}
export const PRODUCTION_TASK_TITLES: Record<ProductionTaskId, string> = {
  planner: '检查工程与制定执行计划', 'core-loop': '验证核心玩法', 'visual-sample': '验证画面样板',
  implementer: '实现方案内容', reviewer: '独立评审', repair: '修复发现的问题', delivery: '交付验证',
};

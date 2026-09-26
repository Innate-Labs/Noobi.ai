export type ProductionBudgetKind = 'turns' | 'repairs' | 'reconnects';
export type ProductionCounters = Record<ProductionBudgetKind, number>;
export const DEFAULT_PRODUCTION_LIMITS: ProductionCounters = { turns: 40, repairs: 6, reconnects: 6 };
export const PRODUCTION_BUDGET_EXTENSION: ProductionCounters = { turns: 20, repairs: 3, reconnects: 3 };
export const BUDGET_LABELS: Record<ProductionBudgetKind, string> = { turns: '模型回合', repairs: '修复回合', reconnects: '网络重连' };
export type ProductionFailureCategory = 'resource' | 'network' | 'account' | 'provider' | 'build' | 'quality' | 'timeout' | 'budget' | 'no-progress' | 'interrupted' | 'unknown';
export interface ProductionFailure { category: ProductionFailureCategory; message: string; action: string; at: string }
export const FAILURE_LABELS: Record<ProductionFailureCategory, string> = {
  resource: '运行资源故障', network: '网络连接', account: '账户或配置', provider: '外部服务', build: '编译或构建', quality: '玩法或画面检查',
  timeout: '执行超时', budget: '执行预算用尽', 'no-progress': '重复失败且无进展', interrupted: '制作中断', unknown: '未归类故障',
};
export interface ProductionBudget {
  used: ProductionCounters;
  limits: ProductionCounters;
  trackingSince: string;
  priorUsageUnknown: boolean;
  grants: Array<{ at: string; added: ProductionCounters }>;
}

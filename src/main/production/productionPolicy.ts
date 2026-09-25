import { createHash } from 'node:crypto';
import type { ProductionFailure, ProductionFailureCategory } from '../../shared/productionPolicy.js';
import { classifyDeliveryFailure, isResourceFailure } from './deliveryFailure.js';
import { modelConnectionFailure } from '../modelConnection.js';

export class ProductionBudgetError extends Error { constructor(message: string) { super(message); this.name = 'ProductionBudgetError'; } }
export class ProductionNoProgressError extends Error { constructor(message: string) { super(message); this.name = 'ProductionNoProgressError'; } }

/** Diagnostic classification is conservative; it never authorizes a retry. */
export function productionFailure(message: string, stage?: string): ProductionFailure {
  let category: ProductionFailureCategory = 'unknown';
  if (/执行预算用尽/u.test(message)) category = 'budget';
  else if (/没有进展|重复失败且无进展/u.test(message)) category = 'no-progress';
  else if (/应用退出中断|was stopped|用户停止/u.test(message)) category = 'interrupted';
  else if (isResourceFailure(message)) category = 'resource';
  else if (classifyDeliveryFailure(message) === 'external-blocked' || /unauthorized|forbidden|authentication|usage.?limit|billing|model.{0,60}not supported/iu.test(message)) category = 'account';
  else if (modelConnectionFailure(message)) category = 'network';
  else if (/HTTP\s*429|rate.?limit|too many requests|外部服务阻塞|素材服务|provider|供应商/iu.test(message)) category = 'provider';
  else if (/timed out|timeout|超时/iu.test(message)) category = 'timeout';
  else if (/parse error|compile|compilation|编译|构建失败|导出失败|SCRIPT ERROR/iu.test(message)) category = 'build';
  else if (['reviewer', 'repair', 'core-loop', 'visual-sample'].includes(stage ?? '') || /未通过|Repair limit reached/u.test(message)) category = 'quality';
  const action: Record<ProductionFailureCategory, string> = {
    resource: '先检查内存、磁盘与游戏资源分配；保留工程和原预算，处理原因后继续。',
    network: '检查网络或代理后继续；自动重连次数受累计预算限制。',
    account: '检查登录、额度、模型权限或服务配置后继续。',
    provider: '检查素材服务状态与限流信息后继续，保留已有素材记录。',
    build: '根据编译或构建错误修复工程，再继续验证。',
    quality: '查看当前验收问题，修复玩法或画面后重新验证。',
    timeout: '检查当前任务是否卡住，缩小修改范围后继续。',
    budget: '检查已有结果后可手动增加执行预算；增加预算不会自动开始制作。',
    'no-progress': '工程和问题重复出现，已停止重复修复。请修改工程或调整方案后重新验证；增加预算不会清除此阻塞。',
    interrupted: '已保留完成记录，点击继续制作可重新核对。',
    unknown: '查看原始错误并处理后继续，不自动重试未归类故障。',
  };
  return { category, message: message.slice(0, 8000), action: action[category], at: new Date().toISOString() };
}

export function repairInputKey(sourceHash: string, findings: readonly string[]): string {
  const normalized = [...new Set(findings.map(text => text.replace(/(?:REVIEWER_RECHECK:|AUTHORITATIVE_HOST:)\s*/gu, '').trim().replace(/\s+/gu, ' ')))].sort();
  return createHash('sha256').update(JSON.stringify([sourceHash, normalized])).digest('hex');
}

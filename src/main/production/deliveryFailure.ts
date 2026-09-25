/** External provider failures cannot be repaired by changing game code. Keep
 * transient congestion distinct from account/entitlement blockers. */
export function classifyDeliveryFailure(message: string): 'external-blocked' | 'transient' | 'repairable' {
  if (/(?:status_code:\s*(?:1004|1008|1039|2049|2056|2153)|HTTP\s*(?:401|402|403)\b|没有.{0,20}(?:使用资格|权限)|(?:invalid|missing) api.?key|insufficient (?:quota|balance)|余额不足|额度不足|套餐|鉴权失败)/iu.test(message)) {
    return 'external-blocked';
  }
  if (/(?:HTTP\s*(?:429|502|503|504)\b|rate.?limit|too many requests|ETIMEDOUT|ECONNRESET)/iu.test(message)) return 'transient';
  return 'repairable';
}

export class ExternalDeliveryBlockedError extends Error {
  constructor(findings: readonly string[]) {
    super(`外部服务阻塞：${findings.join('；')}。已保留工程；修复账户或服务配置后可继续，未消耗代码修复轮次。`);
    this.name = 'ExternalDeliveryBlockedError';
  }
}

/** Resource exhaustion needs diagnosis before any more code-repair budget is spent.
 * The message alone cannot distinguish host pressure from a game's allocation bug. */
export function isResourceFailure(message: string): boolean {
  return /failed to allocate memory|out of memory|heap out of memory|\bENOMEM\b|\bENOSPC\b|no space left on device|无法分配内存|内存分配失败/iu.test(message);
}
export function assertRepairResources(findings: readonly string[]): void {
  const failure = findings.find(isResourceFailure);
  if (failure) throw new Error(`运行资源故障：${failure}。已暂停代码修复；先检查内存、磁盘和游戏资源分配，保留原预算后再继续。`);
}

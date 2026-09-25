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

import type { ProductionFailureCategory } from '../../shared/productionPolicy.js';

/** Diagnostic only. Do not use this classifier to authorize automatic reconnects:
 * a failed token request does not establish either expired credentials or replay safety. */
export function modelExecutionFailure(message: string): { category: ProductionFailureCategory; action: string } | null {
  const remoteCompact = /error running remote compact task/iu.test(message);
  const tokenRequest = /(?:error sending request|request failed)[\s\S]{0,400}(?:https:\/\/auth\.openai\.com\/|oauth\/token)|token refresh failed|failed to refresh (?:access |auth |refresh )?token|(?:oauth|refresh.?token)[\s\S]{0,120}(?:invalid_grant|expired|revoked)/iu.test(message);
  if (!remoteCompact && !tokenRequest) return null;
  if (/invalid_grant|refresh_token_(?:expired|reused|invalidated)|(?:token|credentials)[\s\S]{0,40}(?:expired|revoked)|unauthori[sz]ed|forbidden|(?:HTTP|status(?: code)?)\s*[:=]?\s*(?:401|403)\b/iu.test(message)) {
    return { category: 'account', action: '模型服务明确拒绝了认证，请检查登录状态或授权；保留工程，不通过修改游戏代码处理。继续仍受原预算限制。' };
  }
  if (/error sending request|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|tls handshake|proxy connection|(?:HTTP|status(?: code)?)\s*[:=]?\s*(?:408|502|503|504)\b/iu.test(message)) {
    return { category: 'network', action: '模型服务请求未能完成，请检查网络、代理或服务可用性；当前证据不能认定登录失效。保留工程和原预算，不启动游戏代码修复或自动重放。' };
  }
  if (/HTTP\s*429|rate.?limit|too many requests/iu.test(message)) {
    return { category: 'provider', action: '模型服务限流，请等待服务恢复后检查已有结果；不消耗新的代码修复次数，继续仍受原预算限制。' };
  }
  return { category: 'unknown', action: '模型远程执行失败，原因尚未确认。请核对原始服务错误与连接状态；保留工程，不把它判为游戏质量失败或自动重试。' };
}

export function assertRepairExecution(findings: readonly string[]): void {
  const failure = findings.find(message => modelExecutionFailure(message) !== null);
  if (failure) throw new Error(`模型执行故障，停止进入游戏代码修复：${failure}`);
}

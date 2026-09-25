/** Classify only model transport failures, never tool output or account failures. */
export function modelConnectionFailure(error: unknown): string | null {
  const value = record(error);
  const message = typeof error === 'string' ? error : typeof value?.message === 'string' ? value.message : '';
  const info = value?.codexErrorInfo;
  if (isPermanentModelFailure(error)) return null;
  const transport = record(info);
  const transportNames = ['httpConnectionFailed', 'responseStreamConnectionFailed',
    'responseStreamDisconnected', 'responseTooManyFailedAttempts'];
  const knownTransport = typeof info === 'string' ? transportNames.includes(info)
    : transportNames.some(name => transport && name in transport);
  return knownTransport || /reconnecting|waiting for network|tls handshake|stream disconnected|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|proxy connection failed|HTTP CONNECT failed|(?:HTTP|status(?: code)?)\s*[:=]?\s*(?:408|502|503|504)\b/iu.test(message)
    ? message || '模型服务连接暂时不可用' : null;
}

export function isPermanentModelFailure(error: unknown): boolean {
  const value = record(error);
  const text = typeof error === 'string' ? error : typeof value?.message === 'string' ? value.message : '';
  const info = value?.codexErrorInfo;
  if (/unauthori[sz]ed|forbidden|invalid.?api.?key|authentication|quota|usage.?limit|rate.?limit|insufficient|credits|billing|model.{0,60}not supported|鉴权|额度|余额|(?:HTTP|status(?: code)?)\s*[:=]?\s*(?:400|401|402|403|404|407|429)\b/iu.test(text)) return true;
  if (typeof info === 'string' && /usageLimit|unauthorized|badRequest|contextWindowExceeded/iu.test(info)) return true;
  return Object.values(record(info) ?? {}).some(entry => {
    const status = record(entry)?.httpStatusCode;
    return typeof status === 'number' && status >= 400 && status < 500 && status !== 408;
  });
}

export function connectionRetryDelay(attempt: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.min(4, Math.max(0, attempt - 1)));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

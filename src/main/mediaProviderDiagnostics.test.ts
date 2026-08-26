import { describe, expect, it } from 'vitest';

import { configuredMediaProviderDiagnostic } from './mediaProviderDiagnostics.js';

describe('configuredMediaProviderDiagnostic', () => {
  it('states explicitly that configuration validation does not call the provider API', () => {
    const message = configuredMediaProviderDiagnostic('OpenAI Images');
    expect(message).toContain('本地配置完整（未调用 API）');
    expect(message).not.toContain('API 有效');
    expect(message).not.toContain('连接成功');
  });
});

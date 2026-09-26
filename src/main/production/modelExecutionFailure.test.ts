import { describe, expect, it } from 'vitest';
import { modelConnectionFailure } from '../modelConnection.js';
import { assertRepairExecution, modelExecutionFailure } from './modelExecutionFailure.js';
import { productionFailure } from './productionPolicy.js';

const original = 'Core loop turn ended with status failed: Error running remote compact task: error sending request for url (https://auth.openai.com/oauth/token)';
describe('model execution diagnostics without retry authorization', () => {
  it.each([
    [original, 'network'],
    ['Error running remote compact task: HTTP 503', 'network'],
    ['Error running remote compact task: HTTP 401 unauthorized', 'account'],
    ['Token refresh failed: invalid_grant', 'account'],
    ['refresh_token_expired', 'account'],
    ['Error running remote compact task: HTTP 429', 'provider'],
    ['Error running remote compact task: unexpected response', 'unknown'],
    ['Token refresh failed', 'unknown'],
  ])('keeps execution failures out of code repair: %s', (message, category) => {
    expect(modelExecutionFailure(message)?.category).toBe(category);
    for (const stage of ['core-loop', 'visual-sample', 'repair', 'reviewer']) {
      expect(productionFailure(message, stage)).toMatchObject({ category, message });
    }
    expect(() => assertRepairExecution([message])).toThrow(message);
  });
  it('does not add token-request replay to the automatic reconnect policy', () => {
    expect(modelConnectionFailure(original)).toBeNull();
    expect(productionFailure(original, 'core-loop').action).toContain('不能认定登录失效');
  });
  it.each(['SCRIPT ERROR: invalid player token', 'Missing win condition', 'Shader compilation failed',
    'Game fetch error sending request for url (http://127.0.0.1/level.json)', 'Token counter should refresh after pickup'])('leaves game findings repairable: %s', message => {
    expect(modelExecutionFailure(message)).toBeNull();
    expect(() => assertRepairExecution([message])).not.toThrow();
  });
  it('keeps budget and resource limits ahead of diagnostic service context', () => {
    expect(productionFailure(`执行预算用尽: ${original}`).category).toBe('budget');
    expect(productionFailure(`Failed to allocate memory: ${original}`).category).toBe('resource');
  });
});

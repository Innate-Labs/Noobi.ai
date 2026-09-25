import { describe, expect, it } from 'vitest';
import { productionFailure, repairInputKey } from './productionPolicy.js';
describe('production failure diagnostics', () => {
  it.each([
    ['Failed to allocate memory', 'resource'], ['ENOSPC', 'resource'], ['ENOMEM', 'resource'],
    ['HTTP 401 unauthorized', 'account'], ['余额不足', 'account'], ['HTTP 429 too many requests', 'provider'],
    ['素材服务不可用', 'provider'], ['TLS handshake failed', 'network'], ['ECONNRESET', 'network'],
    ['Script Parse Error', 'build'], ['编译失败', 'build'], ['turn timed out', 'timeout'],
    ['执行预算用尽', 'budget'], ['修复没有进展', 'no-progress'], ['用户停止', 'interrupted'],
    ['Repair limit reached', 'quality'], ['Unexpected object', 'unknown'],
  ])('classifies %s without hiding the original cause', (message, category) => {
    const failure = productionFailure(message); expect(failure.category).toBe(category);
    expect(failure.message).toBe(message); expect(failure.action.length).toBeGreaterThan(10);
  });
  it('uses stage context for unexplained review failures without turning every host failure into a quality claim', () => {
    expect(productionFailure('Failed to allocate memory', 'visual-sample').category).toBe('resource');
    expect(productionFailure('failed check', 'reviewer').category).toBe('quality');
    expect(productionFailure('failed check', 'delivery').category).toBe('unknown');
  });
  it('normalizes finding order and authority labels while keeping changed source and changed requirements distinct', () => {
    expect(repairInputKey('hash', ['a', 'b'])).toBe(repairInputKey('hash', ['b', 'AUTHORITATIVE_HOST: a', 'a']));
    expect(repairInputKey('changed', ['a'])).not.toBe(repairInputKey('hash', ['a']));
    expect(repairInputKey('hash', ['a2'])).not.toBe(repairInputKey('hash', ['a']));
  });
});

import { describe, expect, it } from 'vitest';
import { classifyDeliveryFailure } from './deliveryFailure.js';
describe('external failure classification', () => {
  it.each(['MiniMax status_code: 2153 当前账户没有 Music API 使用资格', 'HTTP 401', 'HTTP 403', '余额不足'])(
    'stops code repair for %s', (message) => expect(classifyDeliveryFailure(message)).toBe('external-blocked'));
  it.each(['HTTP 429', 'HTTP 503', 'ECONNRESET'])(
    'keeps transient failures distinct: %s', (message) => expect(classifyDeliveryFailure(message)).toBe('transient'));
  it.each(['SCRIPT ERROR: null node', 'file permissions on res://images', '素材引用路径错误'])(
    'does not misclassify repairable code: %s', (message) => expect(classifyDeliveryFailure(message)).toBe('repairable'));
});

import { describe, expect, it } from 'vitest';
import {
  RunLivenessHarness,
  runLivenessPolicyFromEnv,
} from './runLivenessHarness.js';

describe('RunLivenessHarness', () => {
  const policy = {
    noticeAfterMs: 90_000,
    noticeEveryMs: 60_000,
    timeoutAfterMs: 240_000,
  };

  it('reports periodic notices before a hard idle timeout', () => {
    const harness = new RunLivenessHarness(policy, 1_000);
    expect(harness.inspect(90_999).kind).toBe('healthy');
    expect(harness.inspect(91_000)).toEqual({
      kind: 'notice',
      idleMs: 90_000,
    });
    expect(harness.inspect(120_000).kind).toBe('healthy');
    expect(harness.inspect(151_000).kind).toBe('notice');
  });

  it('resets the idle window when runtime output arrives', () => {
    const harness = new RunLivenessHarness(policy, 0);
    expect(harness.inspect(100_000).kind).toBe('notice');
    harness.touch(110_000);
    expect(harness.inspect(190_000).kind).toBe('healthy');
  });

  it('enters a terminal timeout state after the idle budget', () => {
    const harness = new RunLivenessHarness(policy, 10_000);
    expect(harness.inspect(250_000)).toEqual({
      kind: 'timeout',
      idleMs: 240_000,
    });
    expect(harness.inspect(251_000).kind).toBe('timeout');
  });

  it('supports a longer idle budget for a known long-running tool', () => {
    const harness = new RunLivenessHarness(policy, 0);
    expect(harness.inspect(240_000, 720_000).kind).not.toBe('timeout');
    expect(harness.inspect(720_000, 720_000)).toEqual({
      kind: 'timeout',
      idleMs: 720_000,
    });
  });

  it('bounds environment overrides', () => {
    expect(
      runLivenessPolicyFromEnv({
        GAMEAGENT_AGENT_IDLE_TIMEOUT_MS: '1000',
        GAMEAGENT_AGENT_IDLE_NOTICE_MS: '99999999',
      }),
    ).toMatchObject({ timeoutAfterMs: 60_000, noticeAfterMs: 45_000 });
  });
});

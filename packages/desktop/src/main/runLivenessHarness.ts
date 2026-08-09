export type RunLivenessState =
  | { kind: 'healthy'; idleMs: number }
  | { kind: 'notice'; idleMs: number }
  | { kind: 'timeout'; idleMs: number };

export interface RunLivenessPolicy {
  noticeAfterMs: number;
  noticeEveryMs: number;
  timeoutAfterMs: number;
}

const DEFAULT_POLICY: RunLivenessPolicy = {
  noticeAfterMs: 90_000,
  noticeEveryMs: 60_000,
  timeoutAfterMs: 240_000,
};

function bounded(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function runLivenessPolicyFromEnv(
  env: NodeJS.ProcessEnv,
): RunLivenessPolicy {
  const timeoutAfterMs = bounded(
    Number(env['GAMEAGENT_AGENT_IDLE_TIMEOUT_MS']),
    DEFAULT_POLICY.timeoutAfterMs,
    60_000,
    30 * 60_000,
  );
  const noticeAfterMs = Math.min(
    timeoutAfterMs - 15_000,
    bounded(
      Number(env['GAMEAGENT_AGENT_IDLE_NOTICE_MS']),
      DEFAULT_POLICY.noticeAfterMs,
      30_000,
      10 * 60_000,
    ),
  );
  return {
    timeoutAfterMs,
    noticeAfterMs,
    noticeEveryMs: bounded(
      Number(env['GAMEAGENT_AGENT_IDLE_NOTICE_EVERY_MS']),
      DEFAULT_POLICY.noticeEveryMs,
      30_000,
      5 * 60_000,
    ),
  };
}

/**
 * Pure liveness state machine used by AgentRunner. It never owns timers or
 * processes, which keeps timeout decisions deterministic and testable.
 */
export class RunLivenessHarness {
  private lastActivityAt: number;
  private lastNoticeAt: number | null = null;
  private timedOut = false;

  constructor(
    private readonly policy: RunLivenessPolicy,
    startedAt = Date.now(),
  ) {
    this.lastActivityAt = startedAt;
  }

  touch(at = Date.now()): void {
    this.lastActivityAt = at;
    this.lastNoticeAt = null;
  }

  inspect(
    at = Date.now(),
    timeoutAfterMs = this.policy.timeoutAfterMs,
  ): RunLivenessState {
    const idleMs = Math.max(0, at - this.lastActivityAt);
    if (this.timedOut || idleMs >= timeoutAfterMs) {
      this.timedOut = true;
      return { kind: 'timeout', idleMs };
    }
    if (
      idleMs >= this.policy.noticeAfterMs &&
      (this.lastNoticeAt === null ||
        at - this.lastNoticeAt >= this.policy.noticeEveryMs)
    ) {
      this.lastNoticeAt = at;
      return { kind: 'notice', idleMs };
    }
    return { kind: 'healthy', idleMs };
  }
}

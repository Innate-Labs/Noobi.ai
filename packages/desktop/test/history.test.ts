import { describe, expect, it } from 'vitest';
import { mergeAgentEvents } from '../src/renderer/history.js';
import type { AgentEvent } from '../src/shared/types.js';

describe('mergeAgentEvents', () => {
  it('历史载入期间保留实时事件、按 ID 去重并按时间排序', () => {
    const history = [event('shared', 1, '旧值'), event('history', 2, '历史')];
    const live = [event('shared', 1, '实时值'), event('live', 3, '实时')];
    const merged = mergeAgentEvents(history, live);

    expect(merged.map((item) => item.id)).toEqual([
      'shared',
      'history',
      'live',
    ]);
    expect(merged[0]?.message).toBe('实时值');
  });

  it('界面最多保留最近 500 条', () => {
    const merged = mergeAgentEvents(
      Array.from({ length: 520 }, (_, index) =>
        event(`event-${index}`, index, String(index)),
      ),
    );
    expect(merged).toHaveLength(500);
    expect(merged[0]?.id).toBe('event-20');
  });
});

function event(id: string, second: number, message: string): AgentEvent {
  return {
    id,
    projectId: 'project',
    type: 'assistant',
    stage: 'code',
    title: 'Agent 回复',
    message,
    timestamp: new Date(Date.UTC(2026, 7, 7, 0, 0, second)).toISOString(),
  };
}

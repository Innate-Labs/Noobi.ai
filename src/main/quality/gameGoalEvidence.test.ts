import { describe, expect, it } from 'vitest';
import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import { gameQualitySpec } from '../production/gameQualitySpec.js';
import { gameGoalFindings } from './gameGoalEvidence.js';

const spec = gameQualitySpec({ name: '横版游戏', idea: '跳跃收集并获胜', engine: 'godot', targetFrameRate: 60 });
function report(states: Array<{ action: string; state: string; collected?: number; lives?: number }>): GameplayExperienceReport {
  return { journey: states.map((s, i) => ({ id: String(i), action: s.action })),
    runtimeEvidence: states.map((s, i) => ({ stepId: String(i), packet: { state: s } })),
  } as unknown as GameplayExperienceReport;
}
describe('goal coverage is independent of basic-check score', () => {
  it('leaves missing runtime evidence unverified rather than crashing or passing', () => {
    expect(gameGoalFindings({ version: 1, verdict: 'repair', score: 0, checkedAt: new Date().toISOString(),
      reportPath: 'artifacts/playtest/latest/report.json', checks: [] }, spec)).toHaveLength(3);
  });
  it('rejects a movement-only diagnostic even if its basic checks pass', () => {
    expect(gameGoalFindings(report([{ action: 'start', state: 'playing', lives: 3 },
      { action: 'move', state: 'playing', lives: 3 }, { action: 'restart', state: 'playing', lives: 3 }]), spec)).toHaveLength(3);
  });
  it('requires a real negative path plus victory before a fresh restart', () => {
    const samples = [{ action: 'start', state: 'playing', lives: 3 }, { action: 'primary', state: 'playing', lives: 2 },
      { action: 'primary', state: 'won', collected: 3 }, { action: 'restart', state: 'playing', collected: 0 }];
    expect(gameGoalFindings(report(samples), spec)).toEqual([]);
    expect(gameGoalFindings(report(samples.slice(0, 3)), spec)).toHaveLength(1);
    expect(gameGoalFindings(report([...samples.slice(0, 3), { action: 'restart', state: 'playing', collected: 3 }]), spec)).toHaveLength(1);
  });
});

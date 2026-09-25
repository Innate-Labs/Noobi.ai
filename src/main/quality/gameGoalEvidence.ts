import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import type { GameplayExperienceReport as SharedReport } from '../../shared/contracts.js';
import type { GameQualitySpec } from '../production/gameQualitySpec.js';

/** Separate from the six basic runtime checks. A short movement diagnostic
 * must never satisfy a full-game delivery contract. */
export function gameGoalFindings(report: SharedReport & Partial<Pick<GameplayExperienceReport, 'journey' | 'runtimeEvidence'>>, spec: GameQualitySpec): string[] {
  if (spec.genre === 'generic') return [];
  const evidence = report.runtimeEvidence ?? [];
  const steps = new Map((report.journey ?? []).map((step) => [step.id, step]));
  const gameplay = evidence.filter((e) => e.packet && steps.has(e.stepId));
  const state = (e: (typeof evidence)[number]) => String(e.packet?.state.state ?? e.packet?.state.phase ?? '');
  const winIndex = gameplay.findIndex((e) => ['won', 'victory'].includes(state(e)));
  const findings: string[] = [];
  if (winIndex < 0) findings.push('缺少真实输入到达胜利状态的运行证据；移动与跳跃检查不能代替完整通关。');
  const restarted = winIndex >= 0 && gameplay.slice(winIndex + 1).some((e) =>
    steps.get(e.stepId)?.action === 'restart' && ['ready', 'playing'].includes(state(e))
    && (e.packet?.state.collected === undefined || e.packet.state.collected === 0));
  if (!restarted) findings.push('缺少胜利后重新开始并清空关卡进度的运行证据。');
  const initial = gameplay.find((e) => state(e) === 'playing')?.packet?.state;
  const negative = gameplay.some((e) => ['lost', 'defeat'].includes(state(e))
    || ['damage', 'invalid', 'miss'].includes(String(e.packet?.state.last_event ?? ''))
    || ['lives', 'player_health'].some((key) => typeof initial?.[key] === 'number'
      && typeof e.packet?.state[key] === 'number' && Number(e.packet.state[key]) < Number(initial[key])));
  if (!negative) findings.push('缺少失败、受伤或无效操作的运行证据；必须验证规则约束确实生效。');
  return findings.map((finding) => `GOAL_COVERAGE: ${finding} 状态与截图必须对应，禁止直接设分或调用胜利函数完成测试。`);
}

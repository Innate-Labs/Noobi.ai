import { assertRepairResources } from './deliveryFailure.js';
import { assertRepairExecution } from './modelExecutionFailure.js';
export interface CoreLoopValidation { ok: boolean; findings: string[] }

/** A real scheduling barrier: full production cannot start until the host has
 * played the current core loop. Evidence is always refreshed on resume.
 * This establishes mechanics, not art quality or meaningful level choices. */
export async function runCoreLoopMilestone(options: {
  validate(): Promise<CoreLoopValidation>;
  implement(attempt: number, findings: string[]): Promise<void>;
  fingerprint?(): Promise<string>;
  progress(state: 'checking' | 'repair' | 'passed', message: string): void;
  assertActive(): void;
}): Promise<void> {
  options.assertActive();
  options.progress('checking', '先验证当前核心玩法；未通过前不进入完整素材与内容制作。');
  let result = await options.validate();
  options.assertActive();
  for (let attempt = 1; !result.ok && attempt <= 2; attempt++) {
    assertRepairResources(result.findings);
    assertRepairExecution(result.findings);
    const before = await options.fingerprint?.();
    const failures = JSON.stringify([...result.findings].sort());
    options.assertActive();
    options.progress('repair', `核心玩法修复 ${attempt}/2：${result.findings.join('；')}`);
    await options.implement(attempt, result.findings);
    options.assertActive();
    result = await options.validate();
    options.assertActive();
    if (!result.ok && before !== undefined && await options.fingerprint?.() === before
      && JSON.stringify([...result.findings].sort()) === failures) {
      throw new Error(`核心玩法修复没有进展，停止扩展素材与内容：${result.findings.join('；')}`);
    }
  }
  if (!result.ok) throw new Error(`核心玩法未通过两次有界修复，完整制作尚未开始：${result.findings.join('；')}`);
  options.progress('passed', '当前构建的完整操作流程已通过宿主检查，可以进入完整制作。美术、路线设计和最终交付仍需验收。');
}

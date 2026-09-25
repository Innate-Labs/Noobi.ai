export interface VisualSampleValidation {
  ok: boolean; findings: string[];
  /** Immutable source/artifact identity for the reviewed sample. */
  sourceHash?: string; buildId?: string; artifactHash?: string; evidencePath?: string;
}

/** One initial sample pass and at most one repair. Failure prevents content
 * production; retrying a run always refreshes evidence instead of trusting a flag. */
export async function runVisualSampleMilestone(options: {
  validate(): Promise<VisualSampleValidation>;
  review(evidence: VisualSampleValidation): Promise<{ ok: boolean; findings: string[] }>;
  implement(attempt: number, findings: string[]): Promise<void>;
  accept(evidence: VisualSampleValidation): Promise<void>;
  fingerprint(): Promise<string>;
  assertActive(): void;
  progress(state: 'checking' | 'repair' | 'passed', message: string): void;
}): Promise<void> {
  options.assertActive();
  options.progress('checking', '核对运行中的视觉样板：素材绑定、尺寸、字体与动作截图。');
  let lastFailure: string | undefined;
  for (let attempt = 0; attempt <= 2; attempt++) {
    options.assertActive();
    let result = await options.validate();
    options.assertActive();
    if (result.ok && result.findings.length === 0) {
      if (!result.sourceHash || !result.buildId || !result.artifactHash || !result.evidencePath) {
        result = { ...result, ok: false, findings: ['视觉样板缺少完整构建及截图报告标识。'] };
      } else {
        const review = await options.review(result);
        options.assertActive();
        result = { ...result, ok: review.ok && review.findings.length === 0, findings: review.findings };
      }
    }
    if (result.ok && result.findings.length === 0) {
      if (await options.fingerprint() !== result.sourceHash) throw new Error('视觉样板审查期间源码已变化，请重新验证。');
      options.assertActive();
      await options.accept(result);
      options.progress('passed', '视觉样板已通过装配检查与截图审查，并保存此构建；可以扩展内容，交付前仍需回归。');
      return;
    }
    const failure = JSON.stringify([await options.fingerprint(), [...result.findings].sort()]);
    options.assertActive();
    if (failure === lastFailure) throw new Error(`视觉样板修复没有进展：${result.findings.join('；')}`);
    if (attempt === 2) throw new Error(`视觉样板未通过有界修复，停止内容扩展：${result.findings.join('；')}`);
    lastFailure = failure;
    options.progress('repair', `视觉样板制作 ${attempt + 1}/2：${result.findings.join('；')}`);
    await options.implement(attempt + 1, result.findings);
  }
}

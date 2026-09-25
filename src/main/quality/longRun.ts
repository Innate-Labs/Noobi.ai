export interface LongRunPolicy {
  version: 1; durationSeconds: number; width: number; height: number; graphicsPreset: string;
  targetFps: 30 | 60 | 120; maxLongFrameRatio: number; maxRendererGrowthMiB: number;
  initial: LongRunInput[]; cycle: LongRunInput[];
}
export type LongRunInput = { key: string; holdMs: number } | { waitMs: number };
export function parseLongRunPolicy(value: unknown): LongRunPolicy {
  const p = value as LongRunPolicy;
  if (!p || p.version !== 1 || !Number.isInteger(p.durationSeconds) || p.durationSeconds < 10 || p.durationSeconds > 14400
    || !Number.isInteger(p.width) || p.width < 640 || p.width > 3840 || !Number.isInteger(p.height) || p.height < 360 || p.height > 2160
    || typeof p.graphicsPreset !== 'string' || !p.graphicsPreset.trim() || p.graphicsPreset.length > 100
    || ![30,60,120].includes(p.targetFps) || !Number.isFinite(p.maxLongFrameRatio) || p.maxLongFrameRatio < 0 || p.maxLongFrameRatio > 1
    || !Number.isFinite(p.maxRendererGrowthMiB) || p.maxRendererGrowthMiB < 0 || p.maxRendererGrowthMiB > 4096) throw Error('Invalid long-run policy');
  for (const steps of [p.initial,p.cycle]) {
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 64) throw Error('Long-run inputs require 1–64 steps');
    for (const s of steps) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) throw Error('Invalid long-run input');
      if ('key' in s) {
        if (typeof s.key !== 'string' || !/^(?:[a-zA-Z0-9]|Enter|Escape|Space|Tab|Up|Down|Left|Right|Shift)$/u.test(s.key)
          || !Number.isInteger(s.holdMs) || s.holdMs < 20 || s.holdMs > 10000 || Object.keys(s).length !== 2) throw Error('Invalid held key');
      } else if (!Number.isInteger(s.waitMs) || s.waitMs < 20 || s.waitMs > 10000 || Object.keys(s).length !== 1) throw Error('Invalid wait');
    }
  }
  return structuredClone(p);
}
export function frameDistribution(intervals: number[], targetFps: number) {
  const values=intervals.filter(n=>Number.isFinite(n) && n>0 && n<=60000).sort((a,b)=>a-b);
  const percentile=(p:number)=>values.length ? values[Math.min(values.length-1,Math.ceil(values.length*p)-1)]! : null;
  const longFrames=values.filter(n=>n>Math.max(50,2000/targetFps)).length;
  return {samples:values.length,p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),maxMs:values.at(-1)??null,
    longFrames,longFrameRatio:values.length?longFrames/values.length:null,measurement:'browser requestAnimationFrame intervals; not GPU timings or engine FPS'};
}

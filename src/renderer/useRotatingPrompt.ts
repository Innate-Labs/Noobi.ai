import { useEffect, useMemo, useState } from 'react';

export const ROTATING_GAME_PROMPTS = [
  '制作一个可以探索天空遗迹、驯服机械生物的 3D 冒险游戏……',
  '制作一个拥有角色卡牌、组合技能和华丽出牌动效的策略游戏……',
  '制作一个驾驶悬浮赛车穿越霓虹峡谷、挑战计时纪录的竞速游戏……',
  '制作一个守护废墟基地、抵挡不断进化敌人的生存射击游戏……',
  '制作一个会根据玩家选择改变城市与结局的像素 RPG……',
  '制作一个双人合作解谜游戏，让两名玩家分别操控时间与重力……',
] as const;

export const EASTER_EGG_PROMPTS = [
  '✦ 让 Noobi 偷走最终 Boss 的键盘，并把所有报错变成金币……',
  '✦ 制作一个 Noobi 在编译器迷宫里收集橡果、躲避红色报错的隐藏游戏……',
  '✦ 做一个按下神秘按钮后会下起橡果雨，而且 Noobi 会跳舞的小游戏……',
] as const;

export const EASTER_EGG_CHANCE = 0.02;

export type PromptAnimationPhase = 'typing' | 'holding' | 'deleting';

export interface RotatingPromptSelection {
  text: string;
  isEasterEgg: boolean;
  nextNormalIndex: number;
}

export interface PromptAnimationState {
  selection: RotatingPromptSelection;
  phase: PromptAnimationPhase;
  visibleCount: number;
}

interface UseRotatingPromptOptions {
  paused?: boolean;
  random?: () => number;
}

const TYPE_INTERVAL_MS = 46;
const HOLD_INTERVAL_MS = 1_700;
const DELETE_INTERVAL_MS = 22;
const BETWEEN_PROMPTS_MS = 320;

export function useRotatingPrompt({
  paused = false,
  random = Math.random,
}: UseRotatingPromptOptions = {}): { text: string; isEasterEgg: boolean } {
  const reducedMotion = useReducedMotion();
  const documentVisible = useDocumentVisible();
  const [state, setState] = useState<PromptAnimationState>(createPromptAnimationState);
  const characters = useMemo(() => splitGraphemes(state.selection.text), [state.selection.text]);

  useEffect(() => {
    if (paused || reducedMotion || !documentVisible) return undefined;
    const timer = window.setTimeout(() => {
      setState(advancePromptAnimation(state, random));
    }, promptAnimationDelay(state));
    return () => window.clearTimeout(timer);
  }, [documentVisible, paused, random, reducedMotion, state]);

  return {
    text: reducedMotion
      ? state.selection.text
      : characters.slice(0, state.visibleCount).join(''),
    isEasterEgg: state.selection.isEasterEgg,
  };
}

export function createPromptAnimationState(): PromptAnimationState {
  return {
    selection: {
      text: ROTATING_GAME_PROMPTS[0],
      isEasterEgg: false,
      nextNormalIndex: 1,
    },
    phase: 'typing',
    visibleCount: 0,
  };
}

export function advancePromptAnimation(
  state: PromptAnimationState,
  random: () => number = Math.random,
): PromptAnimationState {
  const length = splitGraphemes(state.selection.text).length;
  if (state.phase === 'typing') {
    return state.visibleCount < length
      ? { ...state, visibleCount: state.visibleCount + 1 }
      : { ...state, phase: 'holding' };
  }
  if (state.phase === 'holding') return { ...state, phase: 'deleting' };
  if (state.visibleCount > 0) return { ...state, visibleCount: state.visibleCount - 1 };
  return {
    selection: chooseRotatingPrompt(state.selection.nextNormalIndex, random),
    phase: 'typing',
    visibleCount: 0,
  };
}

export function promptAnimationDelay(state: PromptAnimationState): number {
  if (state.phase === 'holding') return HOLD_INTERVAL_MS;
  if (state.phase === 'deleting') {
    return state.visibleCount > 0 ? DELETE_INTERVAL_MS : BETWEEN_PROMPTS_MS;
  }
  return TYPE_INTERVAL_MS;
}

export function chooseRotatingPrompt(
  normalIndex: number,
  random: () => number = Math.random,
): RotatingPromptSelection {
  const index = positiveModulo(Math.trunc(normalIndex), ROTATING_GAME_PROMPTS.length);
  if (normalizedRandom(random()) < EASTER_EGG_CHANCE) {
    const eggIndex = Math.floor(normalizedRandom(random()) * EASTER_EGG_PROMPTS.length);
    return {
      text: EASTER_EGG_PROMPTS[eggIndex]!,
      isEasterEgg: true,
      nextNormalIndex: index,
    };
  }
  return {
    text: ROTATING_GAME_PROMPTS[index]!,
    isEasterEgg: false,
    nextNormalIndex: (index + 1) % ROTATING_GAME_PROMPTS.length,
  };
}

export function splitGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

function normalizedRandom(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999_999_999, Math.max(0, value));
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

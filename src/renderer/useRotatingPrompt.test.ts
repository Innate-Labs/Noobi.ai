import { describe, expect, it } from 'vitest';

import {
  EASTER_EGG_CHANCE,
  EASTER_EGG_PROMPTS,
  ROTATING_GAME_PROMPTS,
  advancePromptAnimation,
  chooseRotatingPrompt,
  createPromptAnimationState,
  promptAnimationDelay,
  splitGraphemes,
  type PromptAnimationState,
} from './useRotatingPrompt';

describe('rotating game prompt', () => {
  it('cycles ordinary prompts without repeating the current index', () => {
    const first = chooseRotatingPrompt(0, () => EASTER_EGG_CHANCE);
    const second = chooseRotatingPrompt(first.nextNormalIndex, () => 0.5);

    expect(first).toMatchObject({
      text: ROTATING_GAME_PROMPTS[0],
      isEasterEgg: false,
      nextNormalIndex: 1,
    });
    expect(second.text).toBe(ROTATING_GAME_PROMPTS[1]);
  });

  it('uses an exact lower-than-two-percent Easter-egg threshold', () => {
    const rolls = [EASTER_EGG_CHANCE - Number.EPSILON, 0.999];
    const egg = chooseRotatingPrompt(3, () => rolls.shift() ?? 0.5);
    const ordinary = chooseRotatingPrompt(3, () => EASTER_EGG_CHANCE);

    expect(egg.isEasterEgg).toBe(true);
    expect(EASTER_EGG_PROMPTS).toContain(egg.text);
    expect(egg.nextNormalIndex).toBe(3);
    expect(ordinary.isEasterEgg).toBe(false);
  });

  it('types, holds, deletes, then chooses the next prompt', () => {
    let state = createPromptAnimationState();
    const length = splitGraphemes(state.selection.text).length;
    for (let index = 0; index < length; index += 1) {
      state = advancePromptAnimation(state, () => 0.5);
    }
    expect(state.visibleCount).toBe(length);
    expect(state.phase).toBe('typing');

    state = advancePromptAnimation(state, () => 0.5);
    expect(state.phase).toBe('holding');
    expect(promptAnimationDelay(state)).toBeGreaterThan(1_000);

    state = advancePromptAnimation(state, () => 0.5);
    expect(state.phase).toBe('deleting');
    for (let index = 0; index < length; index += 1) {
      state = advancePromptAnimation(state, () => 0.5);
    }
    expect(state.visibleCount).toBe(0);

    state = advancePromptAnimation(state, () => 0.5);
    expect(state.selection.text).toBe(ROTATING_GAME_PROMPTS[1]);
    expect(state.phase).toBe('typing');
  });

  it('uses a longer pause for a completed prompt than for a typing frame', () => {
    const typing: PromptAnimationState = {
      selection: chooseRotatingPrompt(0, () => 0.5),
      phase: 'typing',
      visibleCount: 1,
    };
    const holding = { ...typing, phase: 'holding' as const };
    const deleting = { ...typing, phase: 'deleting' as const };

    expect(promptAnimationDelay(holding)).toBeGreaterThan(promptAnimationDelay(typing));
    expect(promptAnimationDelay(deleting)).toBeLessThan(promptAnimationDelay(typing));
  });

  it('keeps combined emoji together as one visible character', () => {
    expect(splitGraphemes('Noobi 👨‍💻 🐿️')).toEqual(['N', 'o', 'o', 'b', 'i', ' ', '👨‍💻', ' ', '🐿️']);
  });
});

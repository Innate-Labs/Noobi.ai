import { expect, it } from 'vitest';
import { gameQualitySpec, supportsCoreLoop } from './gameQualitySpec.js';
it('gates real-time 3D core play before asset expansion without forcing movement onto card games', () => {
  const make = (idea: string, dimension: '2d' | '3d') => gameQualitySpec({ name: 'Fixture', idea, engine: 'godot', targetFrameRate: 60 }, dimension);
  expect(supportsCoreLoop(make('森林探索', '3d'))).toBe(true);
  expect(supportsCoreLoop(make('platformer', '2d'))).toBe(true);
  expect(supportsCoreLoop(make('card game', '3d'))).toBe(false);
  expect(supportsCoreLoop(make('文字解谜', '2d'))).toBe(false);
});

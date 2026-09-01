import { describe, expect, it } from 'vitest';

import { NEW_GAME_NAME } from './projectNaming';

describe('new project naming', () => {
  it('does not copy the opening words of the game prompt into the task name', () => {
    expect(NEW_GAME_NAME).toBe('New Game');
  });
});

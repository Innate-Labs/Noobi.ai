import { describe, expect, it } from 'vitest';

import type { NoobiCrewMember } from '../../shared/contracts';
import {
  assignNoobiCrewRole,
  toggleNoobiCrewMember,
} from './NoobiCrewPicker';

const baseCrew: readonly NoobiCrewMember[] = [
  { packId: 'classic', role: 'planner' },
  { packId: 'twilight', role: 'artist' },
  { packId: 'hellokitty', role: 'engineer' },
];

describe('NoobiCrewPicker helpers', () => {
  it('adds a unique pack in the first unfilled role', () => {
    expect(toggleNoobiCrewMember(baseCrew, 'mosslight')).toEqual([
      ...baseCrew,
      { packId: 'mosslight', role: 'tester' },
    ]);
  });

  it('enforces the two-to-four member limits', () => {
    const minimum = baseCrew.slice(0, 2);
    expect(toggleNoobiCrewMember(minimum, 'classic')).toEqual(minimum);

    const maximum = toggleNoobiCrewMember(baseCrew, 'mosslight');
    expect(toggleNoobiCrewMember(maximum, 'starforge')).toEqual(maximum);
  });

  it('removes a selected member when the crew remains valid', () => {
    expect(toggleNoobiCrewMember(baseCrew, 'twilight')).toEqual([
      { packId: 'classic', role: 'planner' },
      { packId: 'hellokitty', role: 'engineer' },
    ]);
  });

  it('swaps occupied roles instead of producing duplicate assignments', () => {
    expect(assignNoobiCrewRole(baseCrew, 'hellokitty', 'planner')).toEqual([
      { packId: 'classic', role: 'engineer' },
      { packId: 'twilight', role: 'artist' },
      { packId: 'hellokitty', role: 'planner' },
    ]);
  });
});

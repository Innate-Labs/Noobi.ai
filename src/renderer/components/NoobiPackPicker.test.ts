import { describe, expect, it, vi } from 'vitest';

import { NOOBI_PACK_IDS } from '../../shared/contracts';
import {
  NOOBI_PACK_OPTIONS,
  noobiPackGridColumnCount,
} from './NoobiPackPicker';

describe('NoobiPackPicker', () => {
  it('offers exactly every supported Noobi production pack', () => {
    expect(NOOBI_PACK_OPTIONS.map((option) => option.id)).toEqual([...NOOBI_PACK_IDS]);
  });

  it('derives keyboard navigation columns from the rendered grid', () => {
    vi.stubGlobal('getComputedStyle', vi.fn(() => ({
      gridTemplateColumns: '280px 280px',
    } as CSSStyleDeclaration)));

    expect(noobiPackGridColumnCount({} as HTMLElement)).toBe(2);
    vi.unstubAllGlobals();
  });

  it('falls back to one navigation column before the grid is mounted', () => {
    expect(noobiPackGridColumnCount(null)).toBe(1);
  });
});

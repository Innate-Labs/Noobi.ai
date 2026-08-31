import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { NOOBI_PACK_IDS } from '../../shared/contracts';
import {
  NOOBI_PACK_OPTIONS,
  NoobiPackPicker,
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

  it('renders exactly one selected character without binding it to a scene preview', () => {
    const markup = renderToStaticMarkup(createElement(NoobiPackPicker, {
      value: 'twilight',
      mode: 'global',
      presentation: 'character',
      onChange: vi.fn(),
    }));

    expect(markup).toContain('aria-label="选择默认 Noobi 角色"');
    expect(markup.match(/data-pack-kind="character"/gu)).toHaveLength(NOOBI_PACK_IDS.length);
    expect(markup.match(/aria-checked="true"/gu)).toHaveLength(1);
    expect(markup).toContain('小马宝莉·暮光闪闪');
    expect(markup).not.toContain('noobi-pack-scene-image');
  });
});

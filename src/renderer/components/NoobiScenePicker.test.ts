import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { NOOBI_SCENE_IDS } from '../../shared/contracts';
import {
  NOOBI_SCENE_OPTIONS,
  NoobiScenePicker,
} from './NoobiScenePicker';

describe('NoobiScenePicker', () => {
  it('offers exactly every supported running background', () => {
    expect(NOOBI_SCENE_OPTIONS.map((option) => option.id)).toEqual([...NOOBI_SCENE_IDS]);
  });

  it('presents the fishing GIF as a selected dynamic four-person scene', () => {
    const markup = renderToStaticMarkup(createElement(NoobiScenePicker, {
      value: 'fishing',
      onChange: vi.fn(),
    }));

    expect(markup).toContain('aria-label="选择运行背景"');
    expect(markup).toContain('data-scene-id="fishing"');
    expect(markup).toContain('data-motion="animated"');
    expect(markup).toMatch(
      /<button[^>]*aria-checked="true"[^>]*data-scene-id="fishing"[^>]*data-motion="animated"/u,
    );
    expect(markup).toContain('POND RETREAT');
    expect(markup).toContain('荷塘钓鱼');
    expect(markup).toContain('动态循环');
    expect(markup).toContain('固定四人');
  });

  it('keeps the collaboration scene available as the static crew-aware option', () => {
    const markup = renderToStaticMarkup(createElement(NoobiScenePicker, {
      value: 'collaboration',
      busy: true,
      onChange: vi.fn(),
    }));

    expect(markup).toContain('data-scene-id="collaboration"');
    expect(markup).toContain('data-motion="static"');
    expect(markup).toContain('按编队渲染');
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/disabled=""/gu)).toHaveLength(NOOBI_SCENE_OPTIONS.length);
  });
});

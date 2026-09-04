import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LaunchTransition } from './LaunchTransition';

describe('LaunchTransition', () => {
  it('renders the branded New Game handoff with two walking frames', () => {
    const markup = renderToStaticMarkup(createElement(LaunchTransition, { phase: 'running' }));

    expect(markup).toContain('正在建立 New Game');
    expect(markup).toContain('鸭嘴兽正把创意送进制作工作台');
    expect(markup).toContain('launch-transition-runner');
    expect(markup.match(/<img/gu)).toHaveLength(2);
  });
});

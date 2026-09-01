import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { RuntimeStatus } from '../../shared/contracts';
import { ProjectRail, projectContextMenuPosition } from './ProjectRail';

describe('ProjectRail context menu', () => {
  it('keeps the rename action inside the visible window', () => {
    expect(projectContextMenuPosition(1_000, 700, 1_024, 720)).toEqual({ x: 848, y: 656 });
    expect(projectContextMenuPosition(-20, -10, 1_024, 720)).toEqual({ x: 8, y: 8 });
  });

  it('renders the dashboard rail in its compact form with an expand control', () => {
    const markup = renderToStaticMarkup(createElement(ProjectRail, {
      projects: [],
      runtime: { state: 'ready' } as RuntimeStatus,
      open: false,
      collapsed: true,
      renameRequestToken: 0,
      variant: 'dashboard',
      onClose: () => undefined,
      onToggleCollapse: () => undefined,
      onHome: () => undefined,
      onSelect: () => undefined,
      onCreate: () => undefined,
      onRename: async () => undefined,
      onSettings: () => undefined,
    }));

    expect(markup).toContain('mode-dashboard is-collapsed');
    expect(markup).toContain('class="brand" type="button" aria-label="展开首页侧栏"');
    expect(markup).not.toContain('class="rail-collapse"');
    expect(markup).toContain('brand-monogram');
    expect(markup).toContain('class="compact-create" type="button" title="首页"');
    expect(markup).toContain('lucide-house');
    expect(markup).not.toContain('lucide-plus');
  });

  it('renders the workbench monogram as a static brand mark', () => {
    const markup = renderToStaticMarkup(createElement(ProjectRail, {
      projects: [],
      runtime: { state: 'ready' } as RuntimeStatus,
      open: false,
      collapsed: false,
      renameRequestToken: 0,
      variant: 'workbench',
      onClose: () => undefined,
      onToggleCollapse: () => undefined,
      onHome: () => undefined,
      onSelect: () => undefined,
      onCreate: () => undefined,
      onRename: async () => undefined,
      onSettings: () => undefined,
    }));

    expect(markup).toContain('class="brand is-static"');
    expect(markup).not.toContain('aria-label="返回首页"');
  });
});

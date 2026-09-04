import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { AppSettings, ModelOption, ProjectRecord } from '../../shared/contracts';
import { Composer, composerActionMode } from './Composer';

const project = {
  id: 'project-1',
  name: '测试游戏',
  idea: '制作一个游戏',
  root: '/tmp/project-1',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  status: 'running',
  stage: 'code',
  engine: 'web',
  targetFrameRate: 60,
  noobiPackOverrideId: null,
  noobiCrewOverride: null,
  model: 'gpt-5.6-sol',
  threadId: '01a05d3b-5555-79f0-8551-6f6a0fc27ddf',
  toolsetVersion: 8,
  activeTurnId: 'turn-1',
  lastError: null,
} as ProjectRecord;

const models = [{
  id: 'gpt-5.6-sol',
  model: 'gpt-5.6-sol',
  displayName: 'GPT-5.6-Sol',
  description: '游戏制作模型',
  isDefault: true,
  defaultEffort: 'medium',
  efforts: ['medium', 'high'],
}] satisfies ModelOption[];

const settings = {
  defaultModel: 'gpt-5.6-sol',
  defaultEffort: 'medium',
} as AppSettings;

describe('Composer', () => {
  it('uses stop, send, and resume states without an intermediate loading state', () => {
    expect(composerActionMode(true, '', true)).toBe('stop');
    expect(composerActionMode(true, '降低敌人速度', true)).toBe('send');
    expect(composerActionMode(false, '', true)).toBe('resume');
    expect(composerActionMode(false, '', false)).toBe('send');
  });

  it('stays compact and editable while the current game generation is running', () => {
    const markup = renderToStaticMarkup(createElement(Composer, {
      project,
      models,
      settings,
      imageGenerationAvailable: true,
      onRun: vi.fn(),
      onStop: vi.fn(),
    }));

    expect(markup).toContain('asset-requirement is-chip');
    expect(markup).toContain('aria-label="暂停当前制作"');
    expect(markup).toContain('正在制作，可先输入下一条要求');
    expect(markup.match(/<textarea[^>]*disabled/gu)).toBeNull();
  });

  it('shows resume after a newly created game is stopped before a thread id exists', () => {
    const markup = renderToStaticMarkup(createElement(Composer, {
      project: { ...project, status: 'stopped', threadId: null, activeTurnId: null },
      models,
      settings,
      imageGenerationAvailable: true,
      onRun: vi.fn(),
      onStop: vi.fn(),
    }));

    expect(markup).toContain('aria-label="继续制作"');
    expect(markup).not.toContain('aria-label="发送制作要求"');
  });
});

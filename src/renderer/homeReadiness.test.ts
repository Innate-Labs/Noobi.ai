import { describe, expect, it } from 'vitest';

import type { RuntimeStatus } from '../shared/contracts';
import {
  completedReadinessCount,
  homeReadinessChecklist,
} from './homeReadiness';

const READY_RUNTIME: RuntimeStatus = {
  state: 'ready',
  binaryPath: '/Applications/Codex.app/Contents/Resources/codex',
  version: '0.148.0',
  codexHome: '/tmp/codex-home',
  account: {
    type: 'chatgpt',
    email: 'creator@example.com',
    planType: 'plus',
  },
  models: [],
  capabilities: {
    namespaceTools: true,
    imageGeneration: true,
    externalImageGeneration: false,
    webSearch: true,
  },
  error: null,
};

describe('home readiness checklist', () => {
  it('marks every requirement ready when runtime, account, and images are available', () => {
    const items = homeReadinessChecklist(READY_RUNTIME, true);

    expect(items.map((item) => item.id)).toEqual(['runtime', 'account', 'images']);
    expect(items.every((item) => item.ready)).toBe(true);
    expect(completedReadinessCount(items)).toBe(3);
  });

  it('gives each missing requirement a direct settings destination', () => {
    const items = homeReadinessChecklist({
      ...READY_RUNTIME,
      state: 'error',
      account: null,
      error: '找不到 Codex 可执行文件',
    }, false);

    expect(items.map((item) => ({
      id: item.id,
      ready: item.ready,
      section: item.settingsSection,
    }))).toEqual([
      { id: 'runtime', ready: false, section: 'environment' },
      { id: 'account', ready: false, section: 'account' },
      { id: 'images', ready: false, section: 'media' },
    ]);
    expect(items[0]?.detail).toBe('找不到 Codex 可执行文件');
    expect(completedReadinessCount(items)).toBe(0);
  });

  it('keeps account and image readiness independent from runtime startup', () => {
    const items = homeReadinessChecklist({
      ...READY_RUNTIME,
      state: 'starting',
      account: null,
    }, true);

    expect(items.map((item) => item.ready)).toEqual([false, false, true]);
    expect(completedReadinessCount(items)).toBe(1);
  });
});

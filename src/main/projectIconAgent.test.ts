import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generateCodexProjectIcon } from './projectIconAgent.js';
import { PROJECT_ICON_RELATIVE_PATH } from './projectIcon.js';
import type { TurnResult } from './codexAppServer.js';
import type { ProjectRecord } from '../shared/contracts.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fakeProject(): Promise<ProjectRecord> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-icon-agent-test-'));
  roots.push(root);
  return {
    id: '99999999-8888-4777-8666-555555555555',
    name: '像素钓鱼佬',
    pinned: false,
    idea: '在湖边钓鱼、升级鱼竿、收集图鉴',
    root,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    status: 'draft',
    stage: 'brief',
    engine: 'web',
    targetFrameRate: 60,
    noobiPackOverrideId: null,
    noobiCrewOverride: null,
    model: null,
    threadId: null,
    toolsetVersion: 0,
    activeTurnId: null,
    lastError: null,
    icon: null,
  };
}

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(128, 7),
]);

const SKILL = { name: 'imagegen', path: '/tmp/skills/imagegen' };

function mockRuntime(options: {
  turnStatus?: TurnResult['status'];
  writesIcon?: boolean;
  iconBytes?: Buffer;
}) {
  const calls: { prompts: string[]; skills: unknown[]; unsubscribed: string[] } = {
    prompts: [],
    skills: [],
    unsubscribed: [],
  };
  const runtime = {
    async startThread() {
      return 'thread-icon-1';
    },
    async runTurn(turnOptions: { prompt: string; skills?: unknown[]; cwd: string }) {
      calls.prompts.push(turnOptions.prompt);
      calls.skills.push(turnOptions.skills);
      if (options.writesIcon) {
        const absolute = join(turnOptions.cwd, PROJECT_ICON_RELATIVE_PATH);
        await mkdir(dirname(absolute), { recursive: true });
        await writeFile(absolute, options.iconBytes ?? PNG_BYTES);
      }
      return { status: options.turnStatus ?? 'completed', text: 'ICON_READY' } as TurnResult;
    },
    async unsubscribeThread(threadId: string) {
      calls.unsubscribed.push(threadId);
    },
  };
  return { runtime, calls };
}

describe('generateCodexProjectIcon', () => {
  it('returns the icon record when the agent saves a valid PNG', async () => {
    const project = await fakeProject();
    const { runtime, calls } = mockRuntime({ writesIcon: true });

    const icon = await generateCodexProjectIcon(project, runtime, SKILL);

    expect(icon?.source).toBe('ai');
    expect(icon?.path).toBe(PROJECT_ICON_RELATIVE_PATH);
    expect(calls.prompts[0]).toContain('像素钓鱼佬');
    expect(calls.prompts[0]).toContain('钓鱼');
    expect(calls.skills[0]).toEqual([SKILL]);
    expect(calls.unsubscribed).toEqual(['thread-icon-1']);
  });

  it('returns null when the turn fails or no PNG is written', async () => {
    const failed = await fakeProject();
    const { runtime: failedRuntime } = mockRuntime({ turnStatus: 'failed', writesIcon: true });
    expect(await generateCodexProjectIcon(failed, failedRuntime, SKILL)).toBeNull();

    const missing = await fakeProject();
    const { runtime: missingRuntime } = mockRuntime({});
    await mkdir(dirname(join(missing.root, PROJECT_ICON_RELATIVE_PATH)), { recursive: true });
    await writeFile(join(missing.root, PROJECT_ICON_RELATIVE_PATH), PNG_BYTES);
    expect(await generateCodexProjectIcon(missing, missingRuntime, SKILL)).toBeNull();

    const notPng = await fakeProject();
    const { runtime: notPngRuntime } = mockRuntime({
      writesIcon: true,
      iconBytes: Buffer.alloc(256, 1),
    });
    expect(await generateCodexProjectIcon(notPng, notPngRuntime, SKILL)).toBeNull();
  });
});

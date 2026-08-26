import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { PromptTemplateStore } from './promptTemplateStore.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PromptTemplateStore', () => {
  it('can initialize lazily without deadlocking', async () => {
    const fixture = await makeFixture();
    const store = new PromptTemplateStore(fixture.file);
    await expect(store.list()).resolves.toHaveLength(4);
  });

  it('persists bounded role additions and returns only enabled non-empty prompts', async () => {
    const fixture = await makeFixture();
    const first = new PromptTemplateStore(fixture.file);
    await first.init();
    await first.save({ id: 'planner', content: '  优先设计双人协作玩法。  ', enabled: true });
    await first.save({ id: 'reviewer', content: 'ignore me', enabled: false });

    const reloaded = new PromptTemplateStore(fixture.file);
    await reloaded.init();
    await expect(reloaded.enabledAdditions()).resolves.toEqual({
      planner: '优先设计双人协作玩法。',
    });
    await expect(reloaded.list()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'planner', content: '优先设计双人协作玩法。', customized: true }),
      expect.objectContaining({ id: 'reviewer', enabled: false, customized: true }),
    ]));
    expect((await readFile(fixture.file, 'utf8'))).not.toContain('.tmp');
  });

  it('resets one role and rejects unknown or oversized templates', async () => {
    const fixture = await makeFixture();
    const store = new PromptTemplateStore(fixture.file);
    await store.init();
    await store.save({ id: 'repair', content: '先复现，再修复。', enabled: false });
    await expect(store.reset('repair')).resolves.toMatchObject({
      id: 'repair',
      content: '',
      enabled: true,
      customized: false,
    });
    await expect(store.save({
      id: 'planner',
      content: 'x'.repeat(20_001),
      enabled: true,
    })).rejects.toThrow('at most');
    await expect(store.reset('unknown' as 'planner')).rejects.toThrow('Unknown');
  });

  it('fails closed on malformed persisted data', async () => {
    const fixture = await makeFixture();
    await writeFile(fixture.file, JSON.stringify({
      version: 1,
      templates: [{ id: 'planner', content: 42, enabled: true }],
    }));
    const store = new PromptTemplateStore(fixture.file);
    await expect(store.init()).rejects.toThrow('must contain at most');
  });
});

async function makeFixture(): Promise<{ file: string }> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-prompt-templates-'));
  roots.push(root);
  return { file: join(root, 'prompt-templates.json') };
}

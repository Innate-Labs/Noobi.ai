import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeStatus } from '../shared/contracts.js';
import {
  assertRequiredImageGenerationSkillToggleAllowed,
  resolveRequiredImageGenerationSkill,
} from './imageGenerationSkillPolicy.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('required ImageGen skill policy', () => {
  it('requires the live app-private ImageGen skill to be enabled', async () => {
    const fixture = await createFixture();
    const listSkills = vi.fn().mockResolvedValue([{
      name: 'imagegen',
      description: 'Generate images.',
      path: fixture.skillPath,
      scope: 'system',
      enabled: false,
      cwd: null,
    }]);

    await expect(resolveRequiredImageGenerationSkill(
      { listSkills } as never,
      fixture.status,
    )).resolves.toBeNull();
    expect(listSkills).toHaveBeenCalledWith({ forceReload: true });

    listSkills.mockResolvedValueOnce([{
      name: 'imagegen',
      description: 'Generate images.',
      path: fixture.skillPath,
      scope: 'system',
      enabled: true,
      cwd: null,
    }]);
    await expect(resolveRequiredImageGenerationSkill(
      { listSkills } as never,
      fixture.status,
    )).resolves.toEqual({ name: 'imagegen', path: fixture.skillPath });
  });

  it('does not accept an enabled ImageGen skill from outside the app-private Codex home', async () => {
    const fixture = await createFixture();
    const otherRoot = await mkdtemp(join(tmpdir(), 'noobi-other-imagegen-'));
    roots.push(otherRoot);
    const otherSkill = join(otherRoot, 'SKILL.md');
    await writeFile(otherSkill, '# other imagegen\n');

    await expect(resolveRequiredImageGenerationSkill({
      listSkills: vi.fn().mockResolvedValue([{
        name: 'imagegen',
        description: 'Different image skill.',
        path: otherSkill,
        scope: 'user',
        enabled: true,
        cwd: null,
      }]),
    } as never, fixture.status)).resolves.toBeNull();
  });

  it('blocks disabling the app-private required skill but allows other toggles', async () => {
    const fixture = await createFixture();
    await expect(assertRequiredImageGenerationSkillToggleAllowed(
      fixture.status.codexHome,
      { name: 'imagegen', path: fixture.skillPath },
      false,
    )).rejects.toThrow('宿主必需 Skill');
    await expect(assertRequiredImageGenerationSkillToggleAllowed(
      fixture.status.codexHome,
      { name: 'other', path: fixture.skillPath },
      false,
    )).resolves.toBeUndefined();
    await expect(assertRequiredImageGenerationSkillToggleAllowed(
      fixture.status.codexHome,
      { name: 'imagegen', path: fixture.skillPath },
      true,
    )).resolves.toBeUndefined();
  });
});

async function createFixture(): Promise<{ status: RuntimeStatus; skillPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-imagegen-policy-'));
  roots.push(root);
  const skillPath = join(root, 'skills', '.system', 'imagegen', 'SKILL.md');
  await mkdir(join(root, 'skills', '.system', 'imagegen'), { recursive: true });
  await writeFile(skillPath, '# imagegen\n');
  const [canonicalRoot, canonicalSkillPath] = await Promise.all([
    realpath(root),
    realpath(skillPath),
  ]);
  return {
    skillPath: canonicalSkillPath,
    status: {
      state: 'ready',
      binaryPath: '/tmp/codex',
      version: '0.148.0',
      codexHome: canonicalRoot,
      account: null,
      models: [],
      error: null,
      capabilities: {
        namespaceTools: true,
        imageGeneration: true,
        externalImageGeneration: false,
        webSearch: true,
      },
    },
  };
}

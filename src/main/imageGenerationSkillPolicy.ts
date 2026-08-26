import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

import type { RuntimeStatus } from '../shared/contracts.js';
import type { CodexAppServer, CodexSkillSummary } from './codexAppServer.js';

type SkillRuntime = Pick<CodexAppServer, 'listSkills'>;

export interface RequiredImageGenerationSkill {
  name: 'imagegen';
  path: string;
}

export async function resolveRequiredImageGenerationSkill(
  runtime: SkillRuntime,
  status: Pick<RuntimeStatus, 'codexHome' | 'capabilities'>,
): Promise<RequiredImageGenerationSkill | null> {
  if (!status.capabilities.imageGeneration || !status.codexHome) return null;
  try {
    const expectedPath = await expectedImageGenerationSkillPath(status.codexHome);
    const skills = await runtime.listSkills({ forceReload: true });
    for (const skill of skills) {
      if (skill.name !== 'imagegen' || !skill.enabled) continue;
      if (await sameRealPath(skill.path, expectedPath)) {
        return { name: 'imagegen', path: expectedPath };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function assertRequiredImageGenerationSkillToggleAllowed(
  codexHome: string | null,
  skill: Pick<CodexSkillSummary, 'name' | 'path'>,
  enabled: boolean,
): Promise<void> {
  if (enabled || !codexHome || skill.name !== 'imagegen') return;
  let expectedPath: string;
  try {
    expectedPath = await expectedImageGenerationSkillPath(codexHome);
  } catch {
    return;
  }
  if (await sameRealPath(skill.path, expectedPath)) {
    throw new Error('ImageGen 是 Noobi.ai 的宿主必需 Skill，不能停用');
  }
}

async function expectedImageGenerationSkillPath(codexHome: string): Promise<string> {
  const [home, skillPath] = await Promise.all([
    realpath(codexHome),
    realpath(join(codexHome, 'skills', '.system', 'imagegen', 'SKILL.md')),
  ]);
  const pathFromHome = relative(home, skillPath);
  if (
    pathFromHome === '..'
    || pathFromHome.startsWith(`..${sep}`)
    || isAbsolute(pathFromHome)
    || !(await stat(skillPath)).isFile()
  ) {
    throw new Error('Invalid host ImageGen skill path');
  }
  return skillPath;
}

async function sameRealPath(candidate: string, expected: string): Promise<boolean> {
  try {
    return await realpath(candidate) === expected;
  } catch {
    return false;
  }
}

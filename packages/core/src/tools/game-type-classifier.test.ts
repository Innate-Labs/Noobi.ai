import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scaffoldGameProject } from './game-type-classifier.js';
import { GameTypeClassifierTool } from './game-type-classifier.js';
import { Kind } from './tools.js';
import type { Config } from '../config/config.js';

describe('GameTypeClassifierTool mutation contract', () => {
  it('declares project writes and requires confirmation outside automatic modes', async () => {
    const projectRoot = path.resolve('project');
    const tool = new GameTypeClassifierTool(
      { getTargetDir: () => projectRoot } as Config,
      {
        apiKey: 'test-key',
        baseUrl: 'https://example.invalid',
        modelName: 'test-model',
      },
    );
    const invocation = tool.build({ game_description: '平台跳跃游戏' });

    expect(tool.kind).toBe(Kind.Edit);
    expect(invocation.toolLocations()).toEqual([{ path: projectRoot }]);
    await expect(
      invocation.shouldConfirmExecute(new AbortController().signal),
    ).resolves.toMatchObject({
      type: 'info',
      title: expect.stringContaining('脚手架'),
      prompt: expect.stringContaining(projectRoot),
    });
  });
});

describe('scaffoldGameProject', () => {
  let root: string;
  let projectRoot: string;
  let templatesDir: string;
  let docsDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'noobi-scaffold-'));
    projectRoot = path.join(root, '含 空格的项目');
    templatesDir = path.join(root, '模板');
    docsDir = path.join(root, '文档');
    await Promise.all([
      fs.mkdir(projectRoot, { recursive: true }),
      write(path.join(templatesDir, 'core', '.gitignore'), 'dist\n'),
      write(path.join(templatesDir, 'core', 'src', 'main.ts'), 'core'),
      write(
        path.join(templatesDir, 'core', 'src', 'gameConfig.json'),
        'core config',
      ),
      write(
        path.join(templatesDir, 'modules', 'platformer', 'src', 'player.ts'),
        'player',
      ),
      write(
        path.join(
          templatesDir,
          'modules',
          'platformer',
          'src',
          'gameConfig.json',
        ),
        'platformer config',
      ),
      write(path.join(docsDir, 'gdd', 'core.md'), 'gdd'),
      write(path.join(docsDir, 'asset_protocol.md'), 'asset'),
      write(path.join(docsDir, 'debug_protocol.md'), 'debug'),
      write(
        path.join(docsDir, 'modules', 'platformer', 'design_rules.md'),
        'rules',
      ),
    ]);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('copies the fixed template and docs without shell commands', async () => {
    const result = await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });

    expect(result).toEqual({ copiedFiles: 8, preservedFiles: 0 });
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'player.ts'), 'utf8'),
    ).resolves.toBe('player');
    await expect(
      fs.readFile(
        path.join(
          projectRoot,
          'docs',
          'modules',
          'platformer',
          'design_rules.md',
        ),
        'utf8',
      ),
    ).resolves.toBe('rules');
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'gameConfig.json'), 'utf8'),
    ).resolves.toBe('platformer config');
  });

  it('is repeatable and preserves files already edited by the user', async () => {
    await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });
    await fs.writeFile(path.join(projectRoot, 'src', 'main.ts'), 'user edit');

    const result = await scaffoldGameProject({
      projectRoot,
      templatesDir,
      docsDir,
      archetype: 'platformer',
    });

    expect(result).toEqual({ copiedFiles: 0, preservedFiles: 8 });
    await expect(
      fs.readFile(path.join(projectRoot, 'src', 'main.ts'), 'utf8'),
    ).resolves.toBe('user edit');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symlink in the scaffold corpus',
    async () => {
      const outside = path.join(root, 'outside.txt');
      await fs.writeFile(outside, 'outside');
      await fs.symlink(outside, path.join(templatesDir, 'core', 'unsafe-link'));

      await expect(
        scaffoldGameProject({
          projectRoot,
          templatesDir,
          docsDir,
          archetype: 'platformer',
        }),
      ).rejects.toThrow('不允许符号链接');
    },
  );

  it.skipIf(process.platform === 'win32')(
    'rejects a symlinked destination directory instead of writing outside the project',
    async () => {
      const outside = path.join(root, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(projectRoot, 'src'));

      await expect(
        scaffoldGameProject({
          projectRoot,
          templatesDir,
          docsDir,
          archetype: 'platformer',
        }),
      ).rejects.toThrow('不安全的脚手架目录');
      await expect(fs.readdir(outside)).resolves.toEqual([]);
    },
  );
});

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';

const mocks = vi.hoisted(() => ({
  createModelRouter: vi.fn(),
  removeBackgroundSafe: vi.fn(),
  removeBackgroundFromBuffer: vi.fn(),
}));

vi.mock('../services/assetModelRouter.js', () => ({
  createModelRouter: mocks.createModelRouter,
}));

vi.mock('../utils/backgroundRemoval.js', () => ({
  BackgroundRemovalService: class {
    removeBackgroundSafe = mocks.removeBackgroundSafe;
    removeBackgroundFromBuffer = mocks.removeBackgroundFromBuffer;
  },
}));

import { GenerateAssetsTool } from './generate-assets.js';

// Complete 1x1 PNG, including the terminal IEND chunk.
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const TRUNCATED_PNG = VALID_PNG.subarray(0, 24);

describe('GenerateAssetsTool resume behavior', () => {
  let tempRootDir: string;
  let assetsDir: string;
  let mockConfig: Config;
  let editImage: ReturnType<typeof vi.fn>;
  let generateImage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'generate-assets-tool-'),
    );
    assetsDir = path.join(tempRootDir, 'public', 'assets');
    await fs.mkdir(assetsDir, { recursive: true });

    editImage = vi.fn().mockResolvedValue('https://example.test/frame.png');
    generateImage = vi
      .fn()
      .mockResolvedValue('https://example.test/generated.png');
    mocks.createModelRouter.mockReset();
    mocks.createModelRouter.mockReturnValue({
      editImage,
      generateImage,
    });
    mocks.removeBackgroundSafe.mockReset();
    mocks.removeBackgroundSafe.mockResolvedValue(VALID_PNG);
    mocks.removeBackgroundFromBuffer.mockReset();
    mocks.removeBackgroundFromBuffer.mockResolvedValue(VALID_PNG);

    const workspaceContext = createMockWorkspaceContext(tempRootDir);
    mockConfig = {
      getProjectRoot: () => tempRootDir,
      getWorkspaceContext: () => workspaceContext,
      getOpenGameProviders: vi.fn().mockReturnValue({}),
    } as unknown as Config;
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  it('reuses valid files and repairs a missing asset pack without initializing providers', async () => {
    await Promise.all([
      fs.writeFile(path.join(assetsDir, 'title_bg.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'hero_idle_01.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'hero_walk_01.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'hero_walk_02.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'theme.mp3'), Buffer.from('audio')),
      fs.writeFile(
        path.join(assetsDir, 'asset-pack.json'),
        JSON.stringify({ images: {}, broken: null }),
      ),
    ]);

    const tool = new GenerateAssetsTool(mockConfig);
    const invocation = tool.build({
      style_anchor: 'bright cartoon game art',
      assets: [
        {
          type: 'background',
          key: 'title_bg',
          description: 'title screen',
        },
        {
          type: 'animation',
          key: 'hero',
          description: 'small hero',
          useI2V: false,
          animations: [
            { name: 'idle', frameCount: 1, action_desc: 'standing still' },
            { name: 'walk', frameCount: 2, action_desc: 'walking' },
          ],
        },
        {
          type: 'audio',
          key: 'theme',
          description: 'main theme',
          audioType: 'bgm',
        },
      ],
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(mocks.createModelRouter).not.toHaveBeenCalled();
    expect(result.returnDisplay).toContain('Generated 0 assets');
    expect(result.llmContent).toContain('title_bg (background)');
    expect(result.llmContent).toContain('hero (3 existing frames)');
    expect(result.llmContent).toContain('theme (audio)');

    const assetPack = JSON.parse(
      await fs.readFile(path.join(assetsDir, 'asset-pack.json'), 'utf8'),
    );
    expect(assetPack.backgrounds.files).toContainEqual({
      type: 'image',
      key: 'title_bg',
      url: 'assets/title_bg.png',
    });
    expect(assetPack.hero_animations.files).toHaveLength(3);
    expect(assetPack.audio.files).toContainEqual({
      type: 'audio',
      key: 'theme',
      url: 'assets/theme.mp3',
    });
  });

  it('generates only a missing animation frame when resuming', async () => {
    await Promise.all([
      fs.writeFile(path.join(assetsDir, 'hero_idle_01.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'hero_walk_01.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'hero_walk_02.png'), TRUNCATED_PNG),
    ]);

    const tool = new GenerateAssetsTool(mockConfig);
    const invocation = tool.build({
      style_anchor: 'bright cartoon game art',
      assets: [
        {
          type: 'animation',
          key: 'hero',
          description: 'small hero',
          useI2V: false,
          animations: [
            { name: 'idle', frameCount: 1, action_desc: 'standing still' },
            { name: 'walk', frameCount: 2, action_desc: 'walking' },
          ],
        },
      ],
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(mocks.createModelRouter).toHaveBeenCalledTimes(1);
    expect(generateImage).not.toHaveBeenCalled();
    expect(editImage).toHaveBeenCalledTimes(1);
    expect(await fs.readFile(path.join(assetsDir, 'hero_walk_02.png'))).toEqual(
      VALID_PNG,
    );
    expect(
      (await fs.readdir(assetsDir)).some((name) => name.endsWith('.tmp')),
    ).toBe(false);
    expect(result.returnDisplay).toContain('Generated 1 assets');
    expect(result.llmContent).toContain('hero (animation, 1 generated)');
    expect(result.llmContent).toContain('hero (2 existing frames)');

    const assetPack = JSON.parse(
      await fs.readFile(path.join(assetsDir, 'asset-pack.json'), 'utf8'),
    );
    expect(
      assetPack.hero_animations.files.map(
        (entry: { key: string }) => entry.key,
      ),
    ).toEqual(['hero_idle_01', 'hero_walk_01', 'hero_walk_02']);
  });

  it('reports an incomplete batch to both the UI and the agent', async () => {
    await Promise.all([
      fs.writeFile(path.join(assetsDir, 'hero_idle_01.png'), VALID_PNG),
      fs.writeFile(path.join(assetsDir, 'hero_walk_01.png'), VALID_PNG),
    ]);
    editImage.mockRejectedValue(new Error('provider unavailable'));

    const tool = new GenerateAssetsTool(mockConfig);
    const invocation = tool.build({
      style_anchor: 'bright cartoon game art',
      assets: [
        {
          type: 'animation',
          key: 'hero',
          description: 'small hero',
          useI2V: false,
          animations: [
            { name: 'idle', frameCount: 1, action_desc: 'standing still' },
            { name: 'walk', frameCount: 2, action_desc: 'walking' },
          ],
        },
      ],
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(result.error?.message).toContain('hero_walk_02');
    expect(result.returnDisplay).toContain('Errors: 1');
    expect(result.llmContent).toContain('Asset generation is incomplete');
    expect(result.llmContent).toContain('overwrite_existing=false');
  });
});

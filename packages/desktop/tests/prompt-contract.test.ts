import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectManager } from '../src/main/projectManager.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '../../..');

const sourcePaths = {
  customPrompt: path.join(repositoryRoot, 'agent-test', 'prompts', 'custom.md'),
  coreGddContract: path.join(
    repositoryRoot,
    'agent-test',
    'docs',
    'gdd',
    'core.md',
  ),
  classifier: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'tools',
    'game-type-classifier.ts',
  ),
  generateGdd: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'tools',
    'generate-gdd.ts',
  ),
  toolNames: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'tools',
    'tool-names.ts',
  ),
  coreConfig: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'config',
    'config.ts',
  ),
  readFileTool: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'tools',
    'read-file.ts',
  ),
  writeFileTool: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'tools',
    'write-file.ts',
  ),
  shellTool: path.join(
    repositoryRoot,
    'packages',
    'core',
    'src',
    'tools',
    'shell.ts',
  ),
} as const;

const canonicalGameTools = {
  GAME_TYPE_CLASSIFIER: 'classify_game_type',
  GENERATE_GDD: 'generate_gdd',
  GENERATE_ASSETS: 'generate_game_assets',
  GENERATE_TILEMAP: 'generate_tilemap',
} as const;

const legacyHyphenatedToolNames = [
  'classify-game-type',
  'generate-gdd',
  'generate-game-assets',
  'generate-tilemap',
] as const;

const temporaryDirectories: string[] = [];

async function loadSources() {
  const entries = await Promise.all(
    Object.entries(sourcePaths).map(async ([name, filePath]) => [
      name,
      await readFile(filePath, 'utf8'),
    ]),
  );

  return Object.fromEntries(entries) as Record<
    keyof typeof sourcePaths,
    string
  >;
}

function withoutTypeScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function parseJsonExamples(prompt: string): Array<Record<string, unknown>> {
  return [...prompt.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(
    ([, json]) => JSON.parse(json) as Record<string, unknown>,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('OpenGame prompt contract', () => {
  it('uses only registered canonical game tool names in LLM-facing prompts', async () => {
    const sources = await loadSources();

    for (const [constantName, toolName] of Object.entries(canonicalGameTools)) {
      expect(sources.toolNames).toContain(`${constantName}: '${toolName}'`);
      expect(sources.customPrompt).toContain(`\`${toolName}\``);
    }

    for (const toolClass of [
      'GameTypeClassifierTool',
      'GenerateGDDTool',
      'GenerateAssetsTool',
      'GenerateTilemapTool',
    ]) {
      expect(sources.coreConfig).toContain(
        `registerCoreTool(${toolClass}, this)`,
      );
    }

    expect(sources.classifier).toContain(
      '下一步调用真实工具名 \\`generate_gdd\\`',
    );
    expect(sources.generateGdd).toContain('调用 \\`generate_game_assets\\`');
    expect(sources.generateGdd).toContain('调用 \\`generate_tilemap\\`');

    const llmFacingPromptSources = [
      sources.customPrompt,
      withoutTypeScriptComments(sources.classifier),
      withoutTypeScriptComments(sources.generateGdd),
    ].join('\n');

    for (const legacyName of legacyHyphenatedToolNames) {
      expect(llmFacingPromptSources).not.toContain(legacyName);
    }
  });

  it('localizes every file-tool JSON example to an absolute project path', async () => {
    const sources = await loadSources();
    const projectRoot = await mkdtemp(
      path.join(tmpdir(), 'gameagent prompt contract-'),
    );
    temporaryDirectories.push(projectRoot);
    const canonicalProjectRoot = await realpath(projectRoot);

    const manager = new ProjectManager(undefined as never, {
      promptPath: sourcePaths.customPrompt,
      templatesDir: path.join(projectRoot, 'game-skill', 'templates'),
      docsDir: path.join(projectRoot, 'game-skill', 'docs'),
    });
    await manager.prepareSystemPrompt(projectRoot);

    const localizedPrompt = await readFile(
      path.join(projectRoot, '.qwen', 'system.md'),
      'utf8',
    );
    expect(localizedPrompt).not.toMatch(
      /\{(?:PROJECT_ROOT|TEMPLATES_DIR|DOCS_DIR)\}/,
    );

    const examples = parseJsonExamples(localizedPrompt);
    const writeExample = examples.find((example) => 'file_path' in example);
    const readExample = examples.find((example) => 'absolute_path' in example);

    expect(writeExample).toMatchObject({
      file_path: path.join(canonicalProjectRoot, 'GAME_DESIGN.md'),
      content: '完整 GDD 内容',
    });
    expect(readExample).toEqual({
      absolute_path: path.join(
        canonicalProjectRoot,
        'docs',
        'asset_protocol.md',
      ),
    });

    for (const example of [writeExample, readExample]) {
      const filePath = String(example?.file_path ?? example?.absolute_path);
      expect(path.isAbsolute(filePath)).toBe(true);
      expect(filePath.startsWith(`${canonicalProjectRoot}${path.sep}`)).toBe(
        true,
      );
    }

    expect(sources.readFileTool).toContain("required: ['absolute_path']");
    expect(sources.readFileTool).toContain('path.isAbsolute(filePath)');
    expect(sources.writeFileTool).toContain(
      "required: ['file_path', 'content']",
    );
    expect(sources.writeFileTool).toContain('path.isAbsolute(filePath)');

    expect(sources.generateGdd).toContain(
      "const gddPath = path.join(projectRoot, 'GAME_DESIGN.md')",
    );
    expect(sources.generateGdd).toContain(
      '\\`read_file\\` 的 \\`absolute_path\\` 参数',
    );
    expect(sources.generateGdd).toContain(
      '\\`write_file\\` 的参数名必须使用 \\`file_path\\`',
    );
  });

  it('starts the development server in the background', async () => {
    const sources = await loadSources();
    const projectRoot = await mkdtemp(
      path.join(tmpdir(), 'gameagent prompt contract-'),
    );
    temporaryDirectories.push(projectRoot);
    const canonicalProjectRoot = await realpath(projectRoot);

    const manager = new ProjectManager(undefined as never, {
      promptPath: sourcePaths.customPrompt,
      templatesDir: path.join(projectRoot, 'templates'),
      docsDir: path.join(projectRoot, 'docs-source'),
    });
    await manager.prepareSystemPrompt(projectRoot);
    const localizedPrompt = await readFile(
      path.join(projectRoot, '.qwen', 'system.md'),
      'utf8',
    );

    const devExample = parseJsonExamples(localizedPrompt).find(
      (example) => example.command === 'npm run dev',
    );
    expect(devExample).toEqual({
      command: 'npm run dev',
      is_background: true,
      directory: canonicalProjectRoot,
      description: '启动游戏开发服务器以进行视觉和交互验证',
    });

    expect(sources.shellTool).toContain(
      "required: ['command', 'is_background']",
    );
    expect(sources.generateGdd).toContain(
      '\\`run_shell_command\\` 的 \\`is_background: true\\`',
    );
  });

  it('JSON-escapes Windows paths while keeping prose paths literal', async () => {
    const projectRoot = await mkdtemp(
      path.join(tmpdir(), 'gameagent prompt windows-json-'),
    );
    temporaryDirectories.push(projectRoot);
    const canonicalProjectRoot = await realpath(projectRoot);
    const promptPath = path.join(projectRoot, 'windows-path-prompt.md');
    const templatesDir =
      'C:\\Users\\runneradmin\\Noobi.ai\\game-skill\\templates';
    const docsDir = 'D:\\游戏素材\\Noobi.ai\\docs';
    await writeFile(
      promptPath,
      [
        '模板目录：{TEMPLATES_DIR}',
        '```json',
        '{ "template_path": "{TEMPLATES_DIR}", "docs_path": "{DOCS_DIR}", "project_path": "{PROJECT_ROOT}" }',
        '```',
      ].join('\r\n'),
      'utf8',
    );

    const manager = new ProjectManager(undefined as never, {
      promptPath,
      templatesDir,
      docsDir,
    });
    await manager.prepareSystemPrompt(projectRoot);
    const localizedPrompt = await readFile(
      path.join(projectRoot, '.qwen', 'system.md'),
      'utf8',
    );

    expect(parseJsonExamples(localizedPrompt)).toContainEqual({
      template_path: templatesDir,
      docs_path: docsDir,
      project_path: canonicalProjectRoot,
    });
    expect(localizedPrompt).toContain(`模板目录：${templatesDir}`);
  });

  it('requires animations.json creation and one Phaser animation registration', async () => {
    const { customPrompt, generateGdd } = await loadSources();

    expect(customPrompt).toContain('创建并注册动画定义（不可跳过）');
    expect(customPrompt).toContain('{ "anims": [...] }');
    expect(customPrompt).toContain(
      '{ "type": "animation", "key": "animations_auto", "url": "assets/animations.json" }',
    );
    expect(customPrompt).toContain('禁止同时以 `type: "json"` 注册');
    expect(generateGdd).toContain("'assets', 'animations.json'");
    expect(generateGdd).toContain('以 \\`type: "animation"\\` 注册一次');
  });

  it('keeps Section 2 as a merge-only game config delta', async () => {
    const { customPrompt, generateGdd, coreGddContract } = await loadSources();
    const protectedBaseKeys = ['screenSize', 'debugConfig', 'renderConfig'];

    expect(customPrompt).toContain('**MERGE** `src/gameConfig.json`');
    expect(customPrompt).toContain('写回完整合并结果');
    expect(generateGdd).toContain('Section 2 增量合并');
    expect(generateGdd).toContain('gameConfig.json (MERGE, not replace)');
    expect(coreGddContract).toContain('game-specific config delta');
    expect(coreGddContract).toContain(
      'merged into the existing template file; it MUST NOT replace',
    );
    expect(coreGddContract).not.toContain('config overwrite');
    expect(coreGddContract).not.toContain(
      'Write the COMPLETE `gameConfig.json` content',
    );

    for (const key of protectedBaseKeys) {
      expect(customPrompt).toContain(key);
      expect(generateGdd).toContain(key);
      expect(coreGddContract).toContain(key);
    }
  });
});

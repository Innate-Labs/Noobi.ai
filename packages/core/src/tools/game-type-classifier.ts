import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';
import { resolveProviderConfig } from '../services/providerConfig.js';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';

export interface GameTypeClassifierParams {
  /**
   * User's game description or idea
   */
  game_description: string;
}

export interface ClassifierModelConfig {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature?: number;
  timeout?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Game archetype based on physics and perspective
 */
export type GameArchetype =
  | 'platformer'
  | 'top_down'
  | 'grid_logic'
  | 'tower_defense'
  | 'ui_heavy';

export interface ClassificationResult {
  archetype: GameArchetype;
  reasoning: string;
  physicsProfile: {
    hasGravity: boolean;
    perspective: 'side' | 'top_down' | 'none';
    movementType: 'continuous' | 'grid' | 'path' | 'ui_only';
  };
}

const GAME_ARCHETYPES: readonly GameArchetype[] = [
  'platformer',
  'top_down',
  'grid_logic',
  'tower_defense',
  'ui_heavy',
];

const PHYSICS_PROFILE_BY_ARCHETYPE: Record<
  GameArchetype,
  ClassificationResult['physicsProfile']
> = {
  platformer: {
    hasGravity: true,
    perspective: 'side',
    movementType: 'continuous',
  },
  top_down: {
    hasGravity: false,
    perspective: 'top_down',
    movementType: 'continuous',
  },
  grid_logic: {
    hasGravity: false,
    perspective: 'top_down',
    movementType: 'grid',
  },
  tower_defense: {
    hasGravity: false,
    perspective: 'top_down',
    movementType: 'path',
  },
  ui_heavy: {
    hasGravity: false,
    perspective: 'none',
    movementType: 'ui_only',
  },
};

function isGameArchetype(value: unknown): value is GameArchetype {
  return (
    typeof value === 'string' &&
    GAME_ARCHETYPES.includes(value as GameArchetype)
  );
}

class GameTypeClassifierInvocation extends BaseToolInvocation<
  GameTypeClassifierParams,
  ToolResult
> {
  /**
   * Lazily resolved on first access so a missing API key surfaces as a
   * tool-execution error (with an actionable message) instead of crashing
   * tool registration at CLI startup.
   */
  private resolvedModelConfig?: ClassifierModelConfig;

  constructor(
    private config: Config,
    params: GameTypeClassifierParams,
    /** Optional override; takes precedence over env / settings. */
    private overrideModelConfig?: ClassifierModelConfig,
  ) {
    super(params);
  }

  private get modelConfig(): ClassifierModelConfig {
    if (this.overrideModelConfig) return this.overrideModelConfig;
    if (!this.resolvedModelConfig) {
      this.resolvedModelConfig = GameTypeClassifierTool.resolveModelConfig(
        this.config,
      );
    }
    return this.resolvedModelConfig;
  }

  getDescription(): string {
    return `识别游戏类型并在项目目录创建对应脚手架。`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.config.getTargetDir() }];
  }

  override async shouldConfirmExecute(): Promise<
    ToolCallConfirmationDetails | false
  > {
    return {
      type: 'info',
      title: '确认创建游戏脚手架',
      prompt:
        `Noobi.ai 将在 ${this.config.getTargetDir()} 中复制核心模板、类型模块与契约文档。` +
        '已有普通文件会保留，符号链接和越界路径会被拒绝。',
      onConfirm: async () => undefined,
    };
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt();

      const result = await this.callClassifierModel(
        systemPrompt,
        userPrompt,
        signal,
      );

      // Parse the JSON result
      const classification = this.parseClassification(result);

      const scaffold = await scaffoldGameProject({
        projectRoot: this.config.getTargetDir(),
        templatesDir:
          process.env.GAME_TEMPLATES_DIR || path.resolve('../../templates'),
        docsDir: process.env.GAME_DOCS_DIR || path.resolve('../../docs'),
        archetype: classification.archetype,
      });

      const llmContent = this.formatLLMContent(classification, scaffold);
      const displayContent = this.formatDisplayContent(classification);

      return {
        llmContent,
        returnDisplay: displayContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        llmContent: `游戏类型识别失败：${errorMessage}`,
        returnDisplay: `**游戏类型识别失败**\n\n错误：${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  private buildSystemPrompt(): string {
    return `# 游戏类型识别器（物理优先）

你是一名游戏物理分析师。请根据游戏的物理规则和视角分类，不要只根据题材或传统 genre 名称判断。

## 分类规则

### 1. platformer（侧视角 + 重力）
**Physics**：启用 Y 轴重力，角色会下落
**Perspective**：侧视角
**Movement**：左右移动 + 跳跃
**Examples**：Mario、Angry Birds、Street Fighter、Terraria、Metal Slug
**关键问题**：没有地面时角色会下落吗？

### 2. top_down（俯视角 + 自由移动）
**Physics**：没有重力或重力可忽略，可自由八方向移动
**Perspective**：俯视角或等距视角
**Movement**：WASD 任意方向
**Examples**：Zelda、Binding of Isaac、Vampire Survivors、Hotline Miami
**关键问题**：不跳跃也能向屏幕上方移动吗？

### 3. grid_logic（网格 + 回合/静态逻辑）
**Physics**：物理很少，移动吸附到网格
**Perspective**：通常为俯视角，但被锁定在格子
**Movement**：一次移动一个格子的离散步骤
**Examples**：Sokoban、Fire Emblem、Chess、Tetris、Match-3、Snake
**关键问题**：移动是否按离散网格步骤发生？

### 4. tower_defense（路径 + 波次）
**Physics**：敌人沿预定义路径移动
**Perspective**：通常为俯视角
**Movement**：敌人寻路，玩家点击放置防御塔
**Examples**：Kingdom Rush、Bloons TD、Plants vs Zombies
**关键问题**：敌人是否沿固定路线前进，而玩家负责布置防御？

### 5. ui_heavy（UI 驱动 / 无物理）
**Physics**：几乎没有街机物理
**Perspective**：无固定空间视角，以 UI 面板为主
**Movement**：点击或触摸交互
**Examples**：Slay the Spire、视觉小说、Idle/Clicker、音游轨道
**关键问题**：核心体验是否主要由 UI 面板和状态变化构成？

## 输出格式

只能输出一个 JSON 对象，不要输出 Markdown 或 JSON 之外的解释。JSON key 与 enum 必须保持英文：

{
  "archetype": "platformer" | "top_down" | "grid_logic" | "tower_defense" | "ui_heavy",
  "reasoning": "使用中文简要解释基于物理规则选择该类型的原因",
  "physicsProfile": {
    "hasGravity": true | false,
    "perspective": "side" | "top_down" | "none",
    "movementType": "continuous" | "grid" | "path" | "ui_only"
  }
}

## 常见错误

- Terraria 有重力，应归为 platformer，不是 top_down。
- Angry Birds 有重力物理，应归为 platformer，不要因解谜题材误判。
- SimCity/Factorio 的核心建设基于网格，应归为 grid_logic。
- 赛车游戏需要看视角：带重力的侧视角归 platformer；俯视角归 top_down。
`;
  }

  private buildUserPrompt(): string {
    return `请根据物理规则与视角识别这个游戏：

"${this.params.game_description}"

请重点判断 GRAVITY、PERSPECTIVE 与 MOVEMENT TYPE。只输出 JSON。`;
  }

  private async callClassifierModel(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const payload = {
      model: this.modelConfig.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: this.modelConfig.temperature ?? 0.3, // Lower temp for classification
      max_tokens: 500,
      stream: false,
    };

    const response = await fetch(
      `${this.modelConfig.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.modelConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `API Request Failed: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;

    if (data.error) {
      throw new Error(`Model API Error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content returned from the model');
    }
    return content;
  }

  private parseClassification(result: string): ClassificationResult {
    // Try to extract JSON from the result
    let jsonStr = result.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return this.fallbackClassification(result);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('分类模型必须返回 JSON 对象');
    }

    const candidate = parsed as Record<string, unknown>;
    if (!isGameArchetype(candidate.archetype)) {
      throw new Error(
        `分类模型返回了无效 archetype：${String(candidate.archetype)}。允许值：${GAME_ARCHETYPES.join(', ')}`,
      );
    }

    const archetype = candidate.archetype;
    return {
      archetype,
      reasoning:
        typeof candidate.reasoning === 'string' && candidate.reasoning.trim()
          ? candidate.reasoning.trim()
          : '模型没有提供判断理由',
      // Physics profile is derived deterministically from the validated
      // archetype so malformed nested model output can never select an
      // incompatible template workflow.
      physicsProfile: { ...PHYSICS_PROFILE_BY_ARCHETYPE[archetype] },
    };
  }

  private fallbackClassification(result: string): ClassificationResult {
    const lowerResult = result.toLowerCase();
    for (const archetype of GAME_ARCHETYPES) {
      if (lowerResult.includes(archetype)) {
        return {
          archetype,
          reasoning: result,
          physicsProfile: { ...PHYSICS_PROFILE_BY_ARCHETYPE[archetype] },
        };
      }
    }

    return {
      archetype: 'platformer',
      reasoning: '无法解析模型结果，回退为 platformer',
      physicsProfile: { ...PHYSICS_PROFILE_BY_ARCHETYPE.platformer },
    };
  }

  private formatLLMContent(
    result: ClassificationResult,
    scaffold: GameScaffoldResult,
  ): string {
    return `<classification>
游戏类型：${result.archetype}
判断理由：${result.reasoning}

物理画像：
- Has Gravity：${result.physicsProfile.hasGravity}
- Perspective：${result.physicsProfile.perspective}
- Movement Type：${result.physicsProfile.movementType}
</classification>

<system-reminder>
游戏类型识别完成：**${result.archetype}**

## 工程脚手架已由工具完成

- 新复制 ${scaffold.copiedFiles} 个文件
- 保留 ${scaffold.preservedFiles} 个已存在文件
- 模板类型：${result.archetype}

脚手架使用受控的 Node.js 文件 API 完成，不需要执行 Bash、PowerShell 或 cmd 命令。

## 脚手架完成后：继续 Phase 2（生成 GDD）

**此时禁止读取模板源码**——模板源码只在 Phase 5（代码实现）读取，过早读取会浪费上下文。

下一步调用真实工具名 \`generate_gdd\`，参数：
- \`raw_user_requirement\`：用户游戏创意
- \`archetype\`："${result.archetype}"
</system-reminder>`;
  }

  private formatDisplayContent(result: ClassificationResult): string {
    const moduleDescriptions: Record<GameArchetype, string> = {
      platformer: '侧视角 + 重力（Mario、Angry Birds、Street Fighter）',
      top_down: '俯视角 + 自由移动（Zelda、Isaac、Vampire Survivors）',
      grid_logic: '网格 + 离散逻辑（Sokoban、Fire Emblem、Match-3）',
      tower_defense: '路径 + 波次（Kingdom Rush、Bloons TD）',
      ui_heavy: 'UI 驱动（卡牌、视觉小说、Idle Clicker）',
    };

    return `**游戏类型识别**

**Archetype**：\`${result.archetype}\`
**说明**：${moduleDescriptions[result.archetype]}

**物理分析**：
| 属性 | 值 |
|----------|-------|
| Has Gravity | ${result.physicsProfile.hasGravity ? '是' : '否'} |
| Perspective | ${result.physicsProfile.perspective} |
| Movement | ${result.physicsProfile.movementType} |

**判断理由**：${result.reasoning}

---
脚手架已准备，下一步继续生成 GDD。`;
  }
}

export interface GameScaffoldResult {
  copiedFiles: number;
  preservedFiles: number;
}

interface GameScaffoldContext {
  createdFiles: Set<string>;
  preservedFiles: Set<string>;
}

export async function scaffoldGameProject(input: {
  projectRoot: string;
  templatesDir: string;
  docsDir: string;
  archetype: GameArchetype;
}): Promise<GameScaffoldResult> {
  const projectRoot = path.resolve(input.projectRoot);
  const templatesDir = path.resolve(input.templatesDir);
  const docsDir = path.resolve(input.docsDir);
  const context: GameScaffoldContext = {
    createdFiles: new Set(),
    preservedFiles: new Set(),
  };

  await assertDirectory(projectRoot, '项目目录不存在或类型不安全');
  await copyDirectoryContents(
    path.join(templatesDir, 'core'),
    projectRoot,
    context,
    projectRoot,
  );
  await copyDirectoryContents(
    path.join(templatesDir, 'modules', input.archetype, 'src'),
    containedDestination(projectRoot, 'src'),
    context,
    projectRoot,
  );
  await copyOneFile(
    path.join(docsDir, 'gdd', 'core.md'),
    containedDestination(projectRoot, 'docs', 'gdd', 'core.md'),
    context,
    projectRoot,
  );
  await copyOneFile(
    path.join(docsDir, 'asset_protocol.md'),
    containedDestination(projectRoot, 'docs', 'asset_protocol.md'),
    context,
    projectRoot,
  );
  await copyOneFile(
    path.join(docsDir, 'debug_protocol.md'),
    containedDestination(projectRoot, 'docs', 'debug_protocol.md'),
    context,
    projectRoot,
  );
  await copyDirectoryContents(
    path.join(docsDir, 'modules', input.archetype),
    containedDestination(projectRoot, 'docs', 'modules', input.archetype),
    context,
    projectRoot,
  );
  return {
    copiedFiles: context.createdFiles.size,
    preservedFiles: context.preservedFiles.size,
  };
}

async function copyDirectoryContents(
  source: string,
  destination: string,
  context: GameScaffoldContext,
  projectRoot: string,
): Promise<void> {
  await assertDirectory(source, `脚手架目录不存在或类型不安全：${source}`);
  await ensureSafeProjectDirectory(projectRoot, destination);
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`脚手架不允许符号链接：${sourcePath}`);
    }
    if (entry.isDirectory()) {
      await copyDirectoryContents(
        sourcePath,
        destinationPath,
        context,
        projectRoot,
      );
    } else if (entry.isFile()) {
      await copyOneFile(sourcePath, destinationPath, context, projectRoot);
    } else {
      throw new Error(`脚手架包含不支持的文件类型：${sourcePath}`);
    }
  }
}

async function copyOneFile(
  source: string,
  destination: string,
  context: GameScaffoldContext,
  projectRoot: string,
): Promise<void> {
  const sourceInfo = await fs.lstat(source).catch(() => undefined);
  if (!sourceInfo?.isFile() || sourceInfo.isSymbolicLink()) {
    throw new Error(`脚手架文件不存在或类型不安全：${source}`);
  }
  await ensureSafeProjectDirectory(projectRoot, path.dirname(destination));
  const destinationInfo = await fs.lstat(destination).catch(() => undefined);
  if (destinationInfo) {
    if (!destinationInfo.isFile() || destinationInfo.isSymbolicLink()) {
      throw new Error(`项目中已有不安全的脚手架目标：${destination}`);
    }
    if (context.createdFiles.has(destination)) {
      // The archetype module intentionally overlays files created from the
      // core template during this same invocation. Files that existed before
      // scaffolding began are never overwritten.
      await fs.copyFile(source, destination);
      return;
    }
    context.preservedFiles.add(destination);
    return;
  }
  try {
    await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    context.createdFiles.add(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const racedInfo = await fs.lstat(destination);
    if (!racedInfo.isFile() || racedInfo.isSymbolicLink()) {
      throw new Error(`项目中已有不安全的脚手架目标：${destination}`);
    }
    context.preservedFiles.add(destination);
  }
}

async function ensureSafeProjectDirectory(
  projectRoot: string,
  directory: string,
): Promise<void> {
  const relative = path.relative(projectRoot, directory);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('脚手架目标超出项目目录');
  }
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      await fs.mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const info = await fs.lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`项目中已有不安全的脚手架目录：${current}`);
    }
  }
}

async function assertDirectory(
  directory: string,
  message: string,
): Promise<void> {
  const info = await fs.lstat(directory).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(message);
}

function containedDestination(root: string, ...segments: string[]): string {
  const destination = path.resolve(root, ...segments);
  const relative = path.relative(root, destination);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('脚手架目标超出项目目录');
  }
  return destination;
}

export class GameTypeClassifierTool extends BaseDeclarativeTool<
  GameTypeClassifierParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.GAME_TYPE_CLASSIFIER;

  /**
   * Resolve the classifier's reasoning-model config from
   * env / ~/.qwen settings.  Throws `MissingProviderConfigError` (with an
   * actionable message) when nothing is configured. Called lazily by the
   * invocation so tool registration doesn't crash on a fresh install.
   */
  static resolveModelConfig(config?: Config): ClassifierModelConfig {
    const providers = config?.getOpenGameProviders();
    const resolved = resolveProviderConfig('reasoning', providers);
    return {
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      modelName: resolved.model,
      temperature: 0.3,
      timeout: 15000,
    };
  }

  constructor(
    private config: Config,
    /** Optional override; if omitted the invocation resolves at execute time. */
    private modelConfig?: ClassifierModelConfig,
  ) {
    super(
      GameTypeClassifierTool.Name,
      ToolDisplayNames.GAME_TYPE_CLASSIFIER,
      `根据物理规则和视角识别游戏类型，并把对应的固定游戏模板与文档安全地复制到项目目录。返回 platformer、top_down、grid_logic、tower_defense 或 ui_heavy。`,
      Kind.Edit,
      {
        type: 'object',
        properties: {
          game_description: {
            type: 'string',
            description:
              '用户的游戏创意或描述，可包含题材、玩法机制和参考游戏。例如：“制作一个类似 Terraria 的游戏”或“推动箱子的网格解谜游戏”。',
          },
        },
        required: ['game_description'],
      },
      false,
      true,
    );
  }

  protected override validateToolParamValues(
    params: GameTypeClassifierParams,
  ): string | null {
    if (!params.game_description || params.game_description.trim() === '') {
      return 'game_description must be a non-empty string';
    }

    if (params.game_description.trim().length < 3) {
      return 'Game description is too short (minimum 3 characters)';
    }

    return null;
  }

  protected createInvocation(
    params: GameTypeClassifierParams,
  ): ToolInvocation<GameTypeClassifierParams, ToolResult> {
    return new GameTypeClassifierInvocation(
      this.config,
      params,
      this.modelConfig,
    );
  }
}

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
} from './tools.js';
import type { Config } from '../config/config.js';
//import { ToolNames, ToolDisplayNames } from './tool-names.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CopyTemplateParams {
  /**
   * Optional project name (used for package.json name if provided)
   */
  project_name?: string;
}

class CopyTemplateInvocation extends BaseToolInvocation<
  CopyTemplateParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: CopyTemplateParams,
  ) {
    super(params);
  }

  getDescription(): string {
    return 'Copying game template files to working directory...';
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    const workspaceDir = this.config.getWorkspaceContext().getDirectories()[0];

    // 1. 定位模板目录
    // 模板目录应该在 agent-test/templates/ 或运行环境的 templates/ 下
    let templateDir = '';

    // 从 process.cwd() 向上查找 templates 目录
    // 参考 generate-assets.ts 查找 node_modules 的方式
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const candidate = path.join(dir, 'templates');
      try {
        await fs.access(candidate);
        templateDir = candidate;
        break;
      } catch {
        dir = path.dirname(dir);
      }
    }

    if (!templateDir) {
      return {
        llmContent: `Error: Template directory not found. Started search from: ${process.cwd()}`,
        returnDisplay: '❌ Template Not Found',
        error: { message: 'Template directory missing' },
      };
    }

    // 2. 递归复制文件
    try {
      // 使用 fs.cp (Node 16.7+)
      await fs.cp(templateDir, workspaceDir, {
        recursive: true,
        force: false, // 不要覆盖已有文件（防止误操作）
        errorOnExist: false, // 允许部分存在
      });

      // 3. 更新 package.json (如果提供了 project_name)
      if (this.params.project_name) {
        const pkgPath = path.join(workspaceDir, 'package.json');
        try {
          const pkgData = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
          pkgData.name = this.params.project_name;
          await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2));
        } catch {
          // Ignore if package.json not found or parse error.
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error copying template: ${msg}`,
        returnDisplay: `❌ Copy Template Failed: ${msg}`,
        error: { message: msg },
      };
    }

    const instruction = `
Template files copied successfully!
Location: ${workspaceDir}

FILES COPIED:
- src/main.ts (Entry point)
- src/gameConfig.json (Config)
- src/scenes/BaseLevelScene.ts (Framework)
- src/scenes/Preloader.ts (Asset Loading)
- ... and more.

NEXT STEPS (Strict Order):
1. **Config**: Read 'src/gameConfig.json', edit values to match GDD.
2. **Assets**: Call 'generate_game_assets' (if not done).
3. **Entities**: Create 'src/entities/Player.ts' (copy pattern from _TemplateEntity.ts if exists).
4. **Levels**: Create 'src/scenes/Level1.ts' extending BaseLevelScene.
`;

    return {
      llmContent: instruction,
      returnDisplay: `✅ Template Files Copied`,
    };
  }
}

export class CopyTemplateTool extends BaseDeclarativeTool<
  CopyTemplateParams,
  ToolResult
> {
  //static readonly Name = ToolNames.COPY_TEMPLATE;
  static readonly Name = 'CopyTemplate';

  constructor(private config: Config) {
    super(
      CopyTemplateTool.Name,
      'CopyTemplate', //ToolDisplayNames.COPY_TEMPLATE,
      'Copies the pre-built game template (Phaser + Vite + TypeScript) to your working directory. Use this FIRST before writing any code - do NOT code from scratch!',
      Kind.Execute,
      {
        type: 'object',
        properties: {
          project_name: {
            type: 'string',
            description: 'Name of the game project (optional).',
          },
        },
      },
      false,
      true,
    );
  }

  protected createInvocation(
    params: CopyTemplateParams,
  ): ToolInvocation<CopyTemplateParams, ToolResult> {
    return new CopyTemplateInvocation(this.config, params);
  }
}

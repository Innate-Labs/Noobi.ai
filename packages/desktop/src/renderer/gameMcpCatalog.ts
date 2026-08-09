import type { McpServerDefinition } from '../shared/types';

export type GameMcpCategory = 'engine' | 'creation' | 'testing';
export type GameMcpPreset = Omit<McpServerDefinition, 'id'>;

export interface GameMcpCatalogItem {
  id: string;
  name: string;
  description: string;
  category: GameMcpCategory;
  publisher: string;
  repository: string;
  trust: 'official' | 'reviewed';
  license: string;
  evidence: string;
  requirement: string;
  caution?: string;
  config: GameMcpPreset;
}

const common: Pick<
  GameMcpPreset,
  'enabled' | 'cwd' | 'url' | 'timeoutMs' | 'trust' | 'env' | 'headers'
> = {
  enabled: true,
  cwd: '',
  url: '',
  timeoutMs: 120_000,
  trust: false,
  env: [],
  headers: [],
};

export const gameMcpCatalog: GameMcpCatalogItem[] = [
  {
    id: 'unity-mcp',
    name: 'Unity MCP',
    description:
      '让 Agent 在 Unity Editor 中创建场景、操作 GameObject、编写脚本并运行测试。',
    category: 'engine',
    publisher: 'CoplayDev',
    repository: 'CoplayDev/unity-mcp',
    trust: 'reviewed',
    license: 'MIT',
    evidence: '活跃维护 · Unity 2021.3–6.x · 47+ Tools',
    requirement: '需要 Unity 内安装 MCP for Unity 包，并在系统安装 uv。',
    config: {
      ...common,
      name: 'unity',
      description: '通过 MCP for Unity 控制 Unity Editor 与项目工具。',
      transport: 'stdio',
      command: 'uvx',
      args: [
        '--from',
        'mcpforunityserver',
        'mcp-for-unity',
        '--transport',
        'stdio',
      ],
    },
  },
  {
    id: 'unreal-mcp',
    name: 'Unreal Editor MCP',
    description:
      '连接 Unreal Editor 官方 MCP 服务，调用关卡、蓝图、材质、Niagara 与 Sequencer 工具集。',
    category: 'engine',
    publisher: 'Epic Games',
    repository: 'EpicGames/unreal-engine-skills-for-claude-code-plugin',
    trust: 'official',
    license: 'MIT',
    evidence: '官方维护 · Unreal Engine 5.8 · 30+ Toolsets',
    requirement:
      '需要 Unreal 5.8 的 ModelContextProtocol 与 AllToolsets 插件，并在 Editor 启动 Server。',
    config: {
      ...common,
      name: 'unreal',
      description: '连接 Unreal Editor 内置的 Model Context Protocol Server。',
      transport: 'http',
      command: '',
      args: [],
      url: 'http://localhost:8000/mcp',
    },
  },
  {
    id: 'godot-mcp',
    name: 'Godot MCP',
    description:
      '从 Agent 启动 Godot、运行项目、读取调试输出并管理场景、节点与脚本。',
    category: 'engine',
    publisher: 'Coding Solo',
    repository: 'Coding-Solo/godot-mcp',
    trust: 'reviewed',
    license: 'MIT',
    evidence: '活跃社区 · Godot 专用工具链 · 5K+ Stars',
    requirement: '需要 Godot，以及系统可用的 Node.js 18+ 与 npx。',
    config: {
      ...common,
      name: 'godot',
      description: '控制 Godot Editor、项目运行与 GDScript 调试。',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@coding-solo/godot-mcp'],
    },
  },
  {
    id: 'blender-mcp',
    name: 'Blender MCP',
    description:
      '把 Blender 的建模、场景编辑、材质和渲染能力接入 Agent，适合快速制作 3D 游戏资产。',
    category: 'creation',
    publisher: 'MCP Blender',
    repository: 'MCPBlender/blender-mcp',
    trust: 'reviewed',
    license: 'MIT',
    evidence: '成熟社区 · Blender Add-on · 本地 STDIO',
    requirement: '需要系统安装 uv，并在 Blender 安装、启动配套 Add-on。',
    caution: '该 Server 可在 Blender 内执行 Python；仅用于可信项目与资产。',
    config: {
      ...common,
      name: 'blender',
      description: '通过 Blender Add-on 创建与编辑 3D 游戏资产。',
      transport: 'stdio',
      command: 'uvx',
      args: ['blender-mcp'],
      env: [{ name: 'DISABLE_TELEMETRY', value: 'true' }],
    },
  },
  {
    id: 'playwright-mcp',
    name: 'Playwright MCP',
    description:
      '用可访问性树驱动浏览器，测试 Web 游戏、编辑器工具、登录流程与发布页面。',
    category: 'testing',
    publisher: 'Microsoft',
    repository: 'microsoft/playwright-mcp',
    trust: 'official',
    license: 'Apache-2.0',
    evidence: '官方维护 · 结构化浏览器自动化 · 隔离会话',
    requirement: '需要系统可用的 Node.js 18+ 与 npx；首次运行可能下载浏览器。',
    config: {
      ...common,
      name: 'playwright',
      description: '使用 Playwright MCP 自动化测试 Web 游戏与网页流程。',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--isolated'],
    },
  },
];

export const gameMcpCategoryLabels: Record<'all' | GameMcpCategory, string> = {
  all: '全部',
  engine: '游戏引擎',
  creation: '3D 制作',
  testing: '自动化测试',
};

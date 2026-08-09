export type GameSkillCategory = 'unity' | 'unreal' | 'godot' | 'web' | 'craft';

export interface GameSkillCatalogItem {
  id: string;
  name: string;
  description: string;
  category: GameSkillCategory;
  publisher: string;
  repository: string;
  ref: string;
  path: string;
  trust: 'official' | 'reviewed';
  license: string;
  evidence: string;
  requirement?: string;
}

export const gameSkillCatalog: GameSkillCatalogItem[] = [
  {
    id: 'unity-cli',
    name: 'Unity CLI',
    description:
      '安装、创建、构建与测试 Unity 项目，并通过命令行控制已连接的 Editor。',
    category: 'unity',
    publisher: 'Unity Technologies',
    repository: 'Unity-Technologies/skills',
    ref: 'main',
    path: 'skills/unity-cli',
    trust: 'official',
    license: 'Unity Companion',
    evidence: '官方维护 · 终端与 Editor 工作流',
  },
  {
    id: 'unity-package-management',
    name: 'Unity Package Management',
    description:
      '用 UPM Client API 管理、发现与验证 Unity 包，适合 CI 和无头环境。',
    category: 'unity',
    publisher: 'Unity Technologies',
    repository: 'Unity-Technologies/skills',
    ref: 'main',
    path: 'skills/unity-package-management',
    trust: 'official',
    license: 'Unity Companion',
    evidence: '官方维护 · UPM 专项流程',
  },
  {
    id: 'ui-uitk',
    name: 'Unity UI Toolkit',
    description:
      '面向 Unity 6 的 UXML、USS、UIDocument、数据绑定与自定义 UI 元素。',
    category: 'unity',
    publisher: 'Unity Technologies',
    repository: 'Unity-Technologies/skills',
    ref: 'main',
    path: 'skills/ui-uitk',
    trust: 'official',
    license: 'Unity Companion',
    evidence: '官方维护 · Unity 6 UI Toolkit',
  },
  {
    id: 'unreal-mcp',
    name: 'Unreal Editor MCP',
    description:
      '通过实时 MCP 连接驱动 Unreal Editor：关卡、蓝图、材质、Niagara、Sequencer 与测试。',
    category: 'unreal',
    publisher: 'Epic Games',
    repository: 'EpicGames/unreal-engine-skills-for-claude-code-plugin',
    ref: 'main',
    path: 'skills/unreal-mcp',
    trust: 'official',
    license: 'MIT',
    evidence: '官方维护 · 30+ Editor Toolsets',
    requirement: '需要 Unreal ModelContextProtocol 与 AllToolsets 插件',
  },
  {
    id: 'godot-gdscript-mastery',
    name: 'Godot GDScript Mastery',
    description:
      'Godot 4.7+ 的强类型 GDScript、信号架构、生命周期、Callable 与热路径规范。',
    category: 'godot',
    publisher: 'Divergent AI',
    repository: 'thedivergentai/gd-agentic-skills',
    ref: 'main',
    path: 'skills/godot-gdscript-mastery',
    trust: 'reviewed',
    license: 'LGPL-3.0',
    evidence: '社区精选 · 97 项 Godot 专项库',
  },
  {
    id: 'godot-project-foundations',
    name: 'Godot Project Foundations',
    description:
      '建立 Godot 4 项目结构、命名规则、场景所有权、版本控制与可维护的功能目录。',
    category: 'godot',
    publisher: 'Divergent AI',
    repository: 'thedivergentai/gd-agentic-skills',
    ref: 'main',
    path: 'skills/godot-project-foundations',
    trust: 'reviewed',
    license: 'LGPL-3.0',
    evidence: '社区精选 · 项目基础与架构',
  },
  {
    id: 'godot-testing-patterns',
    name: 'Godot Testing Patterns',
    description:
      '使用 GdUnit4 组织单元、场景与 CI 测试，覆盖信号、物理、快照和无头运行。',
    category: 'godot',
    publisher: 'Divergent AI',
    repository: 'thedivergentai/gd-agentic-skills',
    ref: 'main',
    path: 'skills/godot-testing-patterns',
    trust: 'reviewed',
    license: 'LGPL-3.0',
    evidence: '社区精选 · 自动化测试专项',
  },
  {
    id: 'phaser-core',
    name: 'Phaser Core',
    description:
      'Phaser Web 游戏的场景生命周期、资源加载、输入、对象组织与稳定启动流程。',
    category: 'web',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/web-engines/phaser-core',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · 68 项版本锁定 Skill 库',
  },
  {
    id: 'threejs-scene-setup',
    name: 'Three.js Scene Setup',
    description:
      '搭建 Three.js 场景、渲染循环、相机、灯光、尺寸响应和基础性能边界。',
    category: 'web',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/web-engines/threejs-scene-setup',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · Web 3D 基础',
  },
  {
    id: 'game-feel',
    name: 'Game Feel',
    description:
      '系统调校输入响应、镜头、命中反馈、动画时序、音画反馈与可读性。',
    category: 'craft',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/disciplines/game-feel',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · 跨引擎制作方法',
  },
  {
    id: 'level-design',
    name: 'Level Design',
    description: '从玩家目标、空间节奏、教学、遭遇和可测试指标构建可迭代关卡。',
    category: 'craft',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/disciplines/level-design',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · 跨引擎关卡设计',
  },
  {
    id: 'create-game-assets',
    name: 'Create Game Assets',
    description:
      '制定美术方向并生成、搜集、统一与验收精灵、贴图、UI、概念图和 3D 素材。',
    category: 'craft',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/disciplines/create-game-assets',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · 完整资产管线',
  },
  {
    id: 'prototype-fast',
    name: 'Fast Prototype',
    description:
      '把创意压缩成可玩的最小闭环，明确假设、时间盒、占位资产和验证标准。',
    category: 'craft',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/workflows/prototype-fast',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · 原型验证流程',
  },
  {
    id: 'steam-publish',
    name: 'Steam Publish',
    description:
      '准备 Steamworks、Depot、SteamPipe 构建、分支、商店素材和发布前检查。',
    category: 'craft',
    publisher: 'GameDev Skills',
    repository: 'gamedev-skills/awesome-gamedev-agent-skills',
    ref: 'main',
    path: 'skills/workflows/steam-publish',
    trust: 'reviewed',
    license: 'Apache-2.0',
    evidence: '社区精选 · 商业发布流程',
  },
];

export const gameSkillCategoryLabels: Record<
  'all' | GameSkillCategory,
  string
> = {
  all: '全部',
  unity: 'Unity',
  unreal: 'Unreal',
  godot: 'Godot',
  web: 'Web 引擎',
  craft: '制作流程',
};

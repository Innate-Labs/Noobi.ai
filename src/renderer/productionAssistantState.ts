import type { PipelineStage, ProjectStatus } from '../shared/contracts';
import {
  productionNavigationNode,
  type ProductionNavigationNodeId,
} from './productionMapNavigation';

export const PRODUCTION_ASSISTANT_EASTER_EGG_CHANCE = 0.02;

export type ProductionStation =
  | 'brief-desk'
  | 'assembly-bench'
  | 'design-board'
  | 'asset-easel'
  | 'world-lounge'
  | 'code-console'
  | 'test-arcade'
  | 'delivery-stage';

export type ProductionAssistantPose =
  | 'idle'
  | 'work'
  | 'think'
  | 'carry'
  | 'paint'
  | 'sleep'
  | 'play'
  | 'repair'
  | 'coffee'
  | 'stretch'
  | 'type'
  | 'inspect'
  | 'sweep'
  | 'celebrate'
  | 'wait'
  | 'walk';

export interface ProductionAssistantAction {
  id: string;
  label: string;
  pose: ProductionAssistantPose;
}

export interface ProductionAssistantPoint {
  nodeId: ProductionNavigationNodeId;
  x: number;
  y: number;
}

export interface ProductionAssistantScene extends ProductionAssistantPoint {
  stage: PipelineStage;
  station: ProductionStation;
  stationLabel: string;
  headline: string;
  detail: string;
  roamPoints: readonly ProductionAssistantPoint[];
  actions: readonly ProductionAssistantAction[];
}

export type ProductionCrewRole = 'planner' | 'artist' | 'engineer' | 'tester';
/** One preserves the legacy solo scene; collaborative production uses 2–4. */
export type ProductionCrewSize = 1 | 2 | 3 | 4;

export interface ProductionCrewMember extends ProductionAssistantPoint {
  id: `crew-${ProductionCrewRole}`;
  role: ProductionCrewRole;
  roleLabel: string;
  badgeLabel: string;
  station: ProductionStation;
  stationLabel: string;
  active: boolean;
  staggerMs: number;
  roamPoints: readonly ProductionAssistantPoint[];
  actions: readonly ProductionAssistantAction[];
}

export interface ProductionAssistantEasterEgg {
  id: 'moonwalk' | 'golden-acorn' | 'mini-noobi' | 'debug-dance';
  label: string;
}

export interface ProductionAssistantBeat {
  action: ProductionAssistantAction;
  easterEgg: ProductionAssistantEasterEgg | null;
}

const action = (
  id: string,
  label: string,
  pose: ProductionAssistantPose,
): ProductionAssistantAction => ({ id, label, pose });

const navigationPoint = (
  nodeId: ProductionNavigationNodeId,
): ProductionAssistantPoint => {
  const { x, y } = productionNavigationNode(nodeId);
  return { nodeId, x, y };
};

const STAGE_SCENES: Record<PipelineStage, ProductionAssistantScene> = {
  brief: {
    ...navigationPoint('brief-main'),
    stage: 'brief',
    station: 'brief-desk',
    stationLabel: '需求桌',
    headline: '正在把想法拆成可制作的任务',
    detail: 'Noobi 会阅读需求、记录重点，并确认游戏的核心目标。',
    roamPoints: [
      navigationPoint('brief-main'),
      navigationPoint('brief-east'),
      navigationPoint('brief-west'),
    ],
    actions: [
      action('read-brief', '阅读你的想法', 'work'),
      action('type-brief', '把需求录入制作清单', 'type'),
      action('think-scope', '思考制作范围', 'think'),
      action('inspect-brief', '逐条检查关键目标', 'inspect'),
      action('coffee-brief', '喝口咖啡整理思路', 'coffee'),
      action('pin-note', '贴上关键目标', 'carry'),
    ],
  },
  scaffold: {
    ...navigationPoint('assembly-main'),
    stage: 'scaffold',
    station: 'assembly-bench',
    stationLabel: '装配台',
    headline: '正在搭起游戏工程骨架',
    detail: 'Noobi 会准备目录、运行环境和第一版可启动入口。',
    roamPoints: [
      navigationPoint('assembly-main'),
      navigationPoint('assembly-left'),
      navigationPoint('assembly-right'),
    ],
    actions: [
      action('measure-frame', '测量工程骨架', 'work'),
      action('hammer-frame', '装配基础模块', 'repair'),
      action('carry-block', '搬运工程组件', 'carry'),
      action('inspect-frame', '检查启动结构', 'inspect'),
      action('sweep-bench', '清理装配台零件', 'sweep'),
    ],
  },
  gdd: {
    ...navigationPoint('design-main'),
    stage: 'gdd',
    station: 'design-board',
    stationLabel: '玩法白板',
    headline: '正在推演游戏怎么玩才有趣',
    detail: 'Noobi 会画出核心循环、规则、反馈和玩家目标。',
    roamPoints: [
      navigationPoint('design-main'),
      navigationPoint('design-left'),
      navigationPoint('design-right'),
    ],
    actions: [
      action('draw-loop', '画核心玩法循环', 'paint'),
      action('test-controller', '试按玩法原型', 'play'),
      action('pace-design', '来回推演规则', 'think'),
      action('stretch-design', '伸个懒腰换换思路', 'stretch'),
      action('inspect-rules', '仔细检查规则漏洞', 'inspect'),
      action('spark-idea', '抓住一个新点子', 'celebrate'),
    ],
  },
  assets: {
    ...navigationPoint('asset-main'),
    stage: 'assets',
    station: 'asset-easel',
    stationLabel: '素材画架',
    headline: '正在准备角色、场景与声音素材',
    detail: 'Noobi 会生成、筛选并整理真正会被游戏使用的素材。',
    roamPoints: [
      navigationPoint('asset-main'),
      navigationPoint('asset-left'),
      navigationPoint('asset-right'),
    ],
    actions: [
      action('paint-sprite', '绘制像素素材', 'paint'),
      action('sort-assets', '整理素材卡片', 'carry'),
      action('inspect-assets', '放大检查素材细节', 'inspect'),
      action('sweep-assets', '清扫散落的像素碎片', 'sweep'),
      action('hold-sprite', '举起素材检查', 'work'),
    ],
  },
  world: {
    ...navigationPoint('world-main'),
    stage: 'world',
    station: 'world-lounge',
    stationLabel: '场景休息区',
    headline: '正在让关卡和世界长出来',
    detail: '场景构建会持续一会儿；Noobi 会看地图、摆放关卡，也会偷偷打盹。',
    roamPoints: [
      navigationPoint('world-main'),
      navigationPoint('world-left'),
      navigationPoint('world-right'),
    ],
    actions: [
      action('study-map', '查看场景地图', 'work'),
      action('place-level', '摆放关卡模块', 'carry'),
      action('inspect-world', '检查场景边界与路线', 'inspect'),
      action('coffee-world', '等场景加载时喝口咖啡', 'coffee'),
      action('stretch-world', '铺完地图伸个懒腰', 'stretch'),
      action('world-nap', '趁加载打个盹', 'sleep'),
      action('world-sleep', '抱着地图睡着了', 'sleep'),
    ],
  },
  code: {
    ...navigationPoint('code-main'),
    stage: 'code',
    station: 'code-console',
    stationLabel: '代码终端',
    headline: '正在把玩法写成可以运行的游戏',
    detail: 'Noobi 会实现交互、动画、音效、规则和场景逻辑。',
    roamPoints: [
      navigationPoint('code-main'),
      navigationPoint('code-east'),
      navigationPoint('code-south'),
    ],
    actions: [
      action('type-code', '敲下新的游戏逻辑', 'type'),
      action('debug-code', '追踪一个小问题', 'think'),
      action('wire-system', '连接游戏系统', 'repair'),
      action('coffee-code', '喝口咖啡继续写', 'coffee'),
      action('stretch-code', '起身伸展一下肩膀', 'stretch'),
    ],
  },
  verify: {
    ...navigationPoint('arcade-main'),
    stage: 'verify',
    station: 'test-arcade',
    stationLabel: '试玩机',
    headline: '正在试玩、评测并修复问题',
    detail: 'Noobi 会亲自操作游戏，检查能否开始、游玩、失败和重来。',
    roamPoints: [
      navigationPoint('arcade-main'),
      navigationPoint('arcade-left'),
      navigationPoint('arcade-upper'),
    ],
    actions: [
      action('play-build', '试玩最新构建', 'play'),
      action('check-build', '核对交付清单', 'work'),
      action('inspect-build', '放大检查操作反馈', 'inspect'),
      action('type-report', '记录试玩问题', 'type'),
      action('repair-build', '修复试玩问题', 'repair'),
    ],
  },
  complete: {
    ...navigationPoint('delivery-main'),
    stage: 'complete',
    station: 'delivery-stage',
    stationLabel: '交付台',
    headline: '可交付游戏已经准备好了',
    detail: 'Noobi 已完成制作、试玩和检查；现在可以进入游戏。',
    roamPoints: [
      navigationPoint('delivery-main'),
      navigationPoint('delivery-left'),
      navigationPoint('delivery-right'),
    ],
    actions: [
      action('completion-wave', '向你挥手', 'celebrate'),
      action('completion-cheer', '庆祝游戏完成', 'celebrate'),
      action('completion-dance', '跳一小段胜利舞', 'celebrate'),
      action('completion-bow', '认真鞠躬交付', 'celebrate'),
      action('sweep-confetti', '把庆祝彩纸收拾干净', 'sweep'),
      action('coffee-complete', '端起咖啡庆祝交付', 'coffee'),
    ],
  },
};

const STATUS_ACTIONS: Partial<Record<ProjectStatus, readonly ProductionAssistantAction[]>> = {
  draft: [
    action('draft-idle', '等待新的制作指令', 'idle'),
    action('draft-controller', '擦亮自己的手柄', 'work'),
    action('draft-look', '四处看看工作室', 'think'),
  ],
  waiting: [
    action('waiting-watch', '等待你的确认', 'wait'),
    action('waiting-sit', '坐下等一会儿', 'idle'),
    action('waiting-nap', '等着等着睡着了', 'sleep'),
  ],
  failed: [
    action('failed-worry', '发现了需要处理的问题', 'think'),
    action('failed-repair', '拿出扳手准备修复', 'repair'),
    action('failed-retry', '重新检查出错位置', 'work'),
  ],
  stopped: [
    action('stopped-pack', '把工具收进背包', 'carry'),
    action('stopped-idle', '暂停工作并待命', 'idle'),
  ],
};

interface ProductionCrewProfile {
  role: ProductionCrewRole;
  roleLabel: string;
  badgeLabel: string;
  station: ProductionStation;
  stationLabel: string;
  nodeId: ProductionNavigationNodeId;
  roamNodeIds: readonly ProductionNavigationNodeId[];
  staggerMs: number;
  supportActions: readonly ProductionAssistantAction[];
}

export const PRODUCTION_CREW_ROLE_ORDER: readonly ProductionCrewRole[] = [
  'planner', 'artist', 'engineer', 'tester',
] as const;

const PRODUCTION_CREW_PROFILES: Readonly<Record<ProductionCrewRole, ProductionCrewProfile>> = {
  planner: {
    role: 'planner',
    roleLabel: '策划',
    badgeLabel: '策',
    station: 'brief-desk',
    stationLabel: '需求与策划桌',
    nodeId: 'brief-main',
    roamNodeIds: ['brief-main', 'brief-east', 'brief-west'],
    staggerMs: 0,
    supportActions: [
      action('planner-notes', '整理策划笔记', 'work'),
      action('planner-inspect', '检查任务边界', 'inspect'),
      action('planner-coffee', '喝口咖啡继续规划', 'coffee'),
      action('planner-idle', '等待新的制作信息', 'idle'),
    ],
  },
  artist: {
    role: 'artist',
    roleLabel: '美术',
    badgeLabel: '艺',
    station: 'asset-easel',
    stationLabel: '美术与画架区',
    nodeId: 'asset-main',
    roamNodeIds: ['asset-main', 'asset-left', 'asset-right'],
    staggerMs: 620,
    supportActions: [
      action('artist-paint', '补画一处像素细节', 'paint'),
      action('artist-inspect', '检查素材轮廓', 'inspect'),
      action('artist-sweep', '清理散落的像素', 'sweep'),
      action('artist-idle', '观察工作室色彩', 'idle'),
    ],
  },
  engineer: {
    role: 'engineer',
    roleLabel: '工程',
    badgeLabel: '工',
    station: 'code-console',
    stationLabel: '代码终端',
    nodeId: 'code-main',
    roamNodeIds: ['code-main', 'code-east', 'code-south'],
    staggerMs: 1_240,
    supportActions: [
      action('engineer-type', '维护游戏系统', 'type'),
      action('engineer-repair', '校准运行环境', 'repair'),
      action('engineer-inspect', '检查构建日志', 'inspect'),
      action('engineer-coffee', '等待编译时喝口咖啡', 'coffee'),
    ],
  },
  tester: {
    role: 'tester',
    roleLabel: '测试',
    badgeLabel: '测',
    station: 'test-arcade',
    stationLabel: '街机与验收区',
    nodeId: 'arcade-main',
    roamNodeIds: ['arcade-main', 'arcade-left', 'arcade-upper'],
    staggerMs: 1_860,
    supportActions: [
      action('tester-play', '试玩上一版构建', 'play'),
      action('tester-inspect', '检查操作反馈', 'inspect'),
      action('tester-sweep', '整理测试区', 'sweep'),
      action('tester-idle', '等待新的验收版本', 'idle'),
    ],
  },
};

const PRODUCTION_CREW_PRIMARY_ROLE: Readonly<Record<PipelineStage, ProductionCrewRole>> = {
  brief: 'planner',
  scaffold: 'engineer',
  gdd: 'planner',
  assets: 'artist',
  world: 'artist',
  code: 'engineer',
  verify: 'tester',
  complete: 'tester',
};

export const PRODUCTION_ASSISTANT_EASTER_EGGS: readonly ProductionAssistantEasterEgg[] = [
  { id: 'moonwalk', label: '彩蛋：Noobi 突然开始月球漫步' },
  { id: 'golden-acorn', label: '彩蛋：发现了一颗金色橡果' },
  { id: 'mini-noobi', label: '彩蛋：迷你 Noobi 来帮忙了' },
  { id: 'debug-dance', label: '彩蛋：报错消失后跳起调试舞' },
] as const;

export const WALK_ACTION: ProductionAssistantAction = action(
  'walk-to-station',
  '前往下一个工位',
  'walk',
);

export function productionAssistantScene(
  stage: PipelineStage,
  status: ProjectStatus,
): ProductionAssistantScene {
  const resolvedStage = status === 'completed' ? 'complete' : stage;
  const scene = STAGE_SCENES[resolvedStage];
  const override = STATUS_ACTIONS[status];
  return override ? { ...scene, actions: override } : scene;
}

export function productionCrewPrimaryRole(
  stage: PipelineStage,
  status: ProjectStatus,
): ProductionCrewRole {
  if (status === 'completed') return 'tester';
  if (status === 'failed') return 'engineer';
  return PRODUCTION_CREW_PRIMARY_ROLE[stage];
}

export function productionCrewMembers(
  stage: PipelineStage,
  status: ProjectStatus,
  requestedSize: ProductionCrewSize = 4,
): readonly ProductionCrewMember[] {
  const size = Math.min(4, Math.max(1, Math.round(requestedSize))) as ProductionCrewSize;
  const activeRole = productionCrewPrimaryRole(stage, status);
  const primaryActions = productionAssistantScene(stage, status).actions;
  const selectedRoles = new Set<ProductionCrewRole>([
    activeRole,
    ...PRODUCTION_CREW_ROLE_ORDER.filter((role) => role !== activeRole),
  ].slice(0, size));

  return PRODUCTION_CREW_ROLE_ORDER
    .filter((role) => selectedRoles.has(role))
    .map((role) => {
      const profile = PRODUCTION_CREW_PROFILES[role];
      const point = navigationPoint(profile.nodeId);
      return {
        ...point,
        id: `crew-${role}`,
        role,
        roleLabel: profile.roleLabel,
        badgeLabel: profile.badgeLabel,
        station: profile.station,
        stationLabel: profile.stationLabel,
        active: role === activeRole,
        staggerMs: profile.staggerMs,
        roamPoints: profile.roamNodeIds.map(navigationPoint),
        actions: role === activeRole ? primaryActions : profile.supportActions,
      };
    });
}

export function productionCrewActionDelay(
  member: Pick<ProductionCrewMember, 'staggerMs'>,
  random: () => number = Math.random,
): number {
  return productionAssistantActionDelay(random) + member.staggerMs;
}

export function selectProductionCrewRoamPoint(
  member: Pick<ProductionCrewMember, 'nodeId' | 'x' | 'y' | 'roamPoints'>,
  currentX: number,
  currentY: number,
  random: () => number = Math.random,
): ProductionAssistantPoint {
  const alternatives = member.roamPoints.filter(
    (point) => Math.hypot(point.x - currentX, point.y - currentY) > 0.75,
  );
  const candidates = alternatives.length > 0 ? alternatives : member.roamPoints;
  const index = Math.floor(normalizedRandom(random()) * candidates.length);
  return candidates[index] ?? { nodeId: member.nodeId, x: member.x, y: member.y };
}

export function productionAssistantStages(): readonly PipelineStage[] {
  return Object.keys(STAGE_SCENES) as PipelineStage[];
}

export function selectProductionAssistantBeat(
  actions: readonly ProductionAssistantAction[],
  currentActionId: string | null,
  random: () => number = Math.random,
): ProductionAssistantBeat {
  if (actions.length === 0) throw new Error('Production assistant requires at least one action.');

  const easterEggRoll = normalizedRandom(random());
  const actionRoll = normalizedRandom(random());
  const easterEggChoiceRoll = normalizedRandom(random());
  const alternatives = actions.length > 1
    ? actions.filter((candidate) => candidate.id !== currentActionId)
    : actions;
  const actionIndex = Math.floor(actionRoll * alternatives.length);
  const easterEggIndex = Math.floor(easterEggChoiceRoll * PRODUCTION_ASSISTANT_EASTER_EGGS.length);

  return {
    action: alternatives[actionIndex] ?? alternatives[0]!,
    easterEgg: easterEggRoll < PRODUCTION_ASSISTANT_EASTER_EGG_CHANCE
      ? PRODUCTION_ASSISTANT_EASTER_EGGS[easterEggIndex]!
      : null,
  };
}

export function productionAssistantActionDelay(random: () => number = Math.random): number {
  return 3_800 + Math.floor(normalizedRandom(random()) * 3_200);
}

export function shouldProductionAssistantRoam(
  status: ProjectStatus,
  action: ProductionAssistantAction,
  easterEgg: ProductionAssistantEasterEgg | null,
  random: () => number = Math.random,
): boolean {
  if (status !== 'running') return false;
  if (easterEgg?.id === 'moonwalk') return true;
  if (action.pose === 'sleep') return false;
  return normalizedRandom(random()) < 0.42;
}

export function selectProductionAssistantRoamPoint(
  scene: ProductionAssistantScene,
  currentX: number,
  currentY: number,
  random: () => number = Math.random,
): ProductionAssistantPoint {
  const alternatives = scene.roamPoints.filter(
    (point) => Math.hypot(point.x - currentX, point.y - currentY) > 0.75,
  );
  const candidates = alternatives.length > 0 ? alternatives : scene.roamPoints;
  const index = Math.floor(normalizedRandom(random()) * candidates.length);
  return candidates[index] ?? { nodeId: scene.nodeId, x: scene.x, y: scene.y };
}

export function normalizedRandom(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999_999_999, Math.max(0, value));
}

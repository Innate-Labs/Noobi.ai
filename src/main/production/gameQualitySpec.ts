import { createHash } from 'node:crypto';
import type { ProjectRecord } from '../../shared/contracts.js';
import { SCENE_QUALITY_GUIDE } from '../quality/sceneQuality.js';
import { VISUAL_SAMPLE_GUIDE } from '../quality/visualSample.js';

export interface GameQualitySpec {
  version: 1;
  engine?: 'web' | 'godot';
  id: string;
  genre: 'platformer' | 'hunting' | 'exploration' | 'card' | '3d' | 'generic';
  interactionMode: 'real-time' | 'turn-based';
  presentation: '2d' | '3d';
  requirements: string[];
  milestones: Array<{ id: string; acceptance: string }>;
}

export function supportsCoreLoop(spec: GameQualitySpec): boolean {
  return spec.genre === 'platformer' || (spec.presentation === '3d' && spec.interactionMode === 'real-time');
}

export function supportsVisualSample(spec: GameQualitySpec): boolean {
  return spec.presentation === '3d' || spec.genre === 'platformer';
}

/** Host-derived minimums. This is a floor, not a substitute for the full user
 * brief; scope cannot be weakened by editing the generated playtest manifest. */
export function gameQualitySpec(project: Pick<ProjectRecord, 'name' | 'idea' | 'engine' | 'targetFrameRate'>, dimension?: '2d' | '3d'): GameQualitySpec {
  const text = `${project.name}\n${project.idea}`;
  const presentation = dimension ?? (/\b3d\b|三维|第三人称|第一人称|\bfps\b/iu.test(text) ? '3d' : '2d');
  const genre = /卡牌|牌组|炉石|card.?game|deck.?builder/iu.test(text) ? 'card'
    : /横版|平台动作|platformer/iu.test(text) ? 'platformer'
      : /狩猎|套索|hunting|lasso/iu.test(text) ? 'hunting'
        : /探索|废墟|explor/iu.test(text) ? 'exploration'
          : /\b3d\b|三维|第三人称/iu.test(text) ? '3d' : 'generic';
  const specialized = {
    platformer: ['平台画面与碰撞一致，关键路径能通过真实移动/跳跃到达。', '角色动作、跳跃与冲刺有连续反馈，收集、失败与重开可验证。'],
    hunting: ['猎物必须有符合狩猎设定的行为与捕捉约束；不能为固定测试扩大命中范围或取消挑战。', '实际验证追逐/瞄准或约定的核心决策，以及失败代价和成功反馈。'],
    exploration: ['场景中的可走区域、障碍和交互点必须对应实际世界，提供路线选择与探索奖励。', '通过真实路径到达关键区域，不能用单张背景代替可探索空间。'],
    card: ['验证出牌费用、非法出牌、回合推进、对手响应、胜负和重开。', '牌面可读、卡牌与效果对应；等待输入时允许画面静止。'],
    '3d': ['验证真实 3D 控制、相机、鼠标锁定、碰撞、高低路径、模型尺度与动画。', '在交付平台测试焦点切换、遮挡和性能。'],
    generic: ['根据用户原始目标定义并验证核心玩法，不能悄悄缩小范围。'],
  };
  const requirements = [
    '冻结用户目标；修复不得通过删除需求、测试或降低阈值来通过。',
    '素材必须在真实游戏中可见、可读且正确绑定，中文字体必须随游戏交付。',
    '真实输入验证核心目标、失败反馈、暂停/恢复和重开；直接设置分数只能作单元测试。',
    ...specialized[genre],
    ...(presentation === '3d' && genre !== '3d' ? specialized['3d'] : []),
  ];
  return { version: 1, engine: project.engine, id: createHash('sha256').update(JSON.stringify({ text, engine: project.engine,
    fps: project.targetFrameRate, presentation, requirements })).digest('hex'), genre,
    interactionMode: genre === 'card' ? 'turn-based' : 'real-time', requirements,
    presentation,
    milestones: [
      { id: 'core-loop', acceptance: '以真实操作完成一个最小完整流程，含成功、失败与重开证据。' },
      { id: 'visual-sample', acceptance: '一个场景内验证角色、地形、交互物、HUD、关键动作与音效的一致性。' },
      { id: 'content', acceptance: '扩展约定内容并验证全部关键路径可达。' },
      { id: 'polish', acceptance: '打磨操作反馈、难度、镜头、声音和可读性，列出剩余品质差距。' },
      { id: 'delivery', acceptance: '对同一冻结构建执行回归，技术与品质结论分别记录。' },
    ],
  };
}

export function qualitySpecPrompt(spec: GameQualitySpec): string {
  return `Host quality specification ${spec.id}\nGenre: ${spec.genre}\n`
    + spec.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')
    + '\nWork in these milestones, recording evidence and remaining gaps in DESIGN.md and TESTING.md:\n'
    + spec.milestones.map((m) => `${m.id}: ${m.acceptance}`).join('\n')
    + '\nGodot delivery runs in an app-owned frozen snapshot. Do not modify NoobiHostProbe. '
    + 'Read runtimeEvidence in the host playtest report: it includes scene nodes, collisions, animation, visible labels and findings. '
    + 'possible-occlusion is a review signal, not proof: inspect screenshots before changing layers. '
    + 'missing-glyphs requires a font with actual character coverage. '
    + 'Inspect Control rect/minimumSize and TextureRect textureSize/expandMode for oversized UI; inspect Sprite2D scale/frame/region/offset for art binding and foot anchors. '
    + 'customDraw marks nodes whose text and geometry need screenshot review: Label/Button font checks do not certify custom-drawn text. '
    + 'New Godot workspaces include runtime/noobi/platformer_controller.gd and its README; reuse its tested physics when appropriate, keeping level design and art separate. '
    + 'For selected third-person 3D mechanics, new Godot workspaces also provide runtime/noobi/ADVENTURE_V1.md with optional camera-relative control, step/slope physics, collision camera, interaction and melee components. Read the guide, wire their real state and visuals, and keep unrequested combat out of noncombat games. These are reusable mechanics, not an existing completed game. '
    + 'For multi-region progression, read runtime/noobi/PROGRESSION_V1.md and declare data/progression.json for host logical reachability checks. Bind quests, rewards, keys, abilities and save snapshots through the shared state contract; actual objectives and region exits still require physical input validation. '
    + 'Use runtime-state observations alongside screenshots, with value as JSON such as {"key":"state","equals":"won"}. '
    + 'Supported root state keys include state, phase, score, lives, collected, has_relic, seal_broken, turn_number, player_health, enemy_health, mana; paused is observed by the host bridge. '
    + 'For supported Godot game genres, expose real root state as ready/playing/paused/won/lost (or phase with these values). '
    + 'The delivery journey must reach won, then restart into ready/playing with collected reset. It must also demonstrate lost, lower lives/player_health, or a real last_event of damage/invalid/miss. '
    + 'Update these values from actual gameplay only; a basic movement diagnostic cannot pass full-game delivery. '
    + 'These state observations supplement real inputs and visible feedback; never add a self-reported pass field or cheat interface. '
    + 'Never interpret the basic playtest percentage as an art or fun score.'
    + (spec.engine !== 'web' && supportsVisualSample(spec) ? `\n${spec.presentation === '3d' ? SCENE_QUALITY_GUIDE : VISUAL_SAMPLE_GUIDE}` : '');
}

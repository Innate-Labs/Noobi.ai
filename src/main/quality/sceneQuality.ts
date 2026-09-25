import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SceneQualitySummary } from '../../shared/sceneQuality.js';
import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import type { RuntimePacket } from '../runtime/runtimeEvidence.js';
export const SCENE_QUALITY_PATH = '.noobi/scene-quality.json';
type Subject = { id: string; node: string; role: 'player' | 'terrain' | 'environment' | 'interactive' | 'hud';
  treatment: 'model' | 'procedural' | 'interface' | 'viewpoint'; resource?: string | string[]; design: string; collision: 'solid' | 'trigger' | 'none' };
export interface SceneQualityContract {
  version: 1;
  artDirection: { style: string; palette: string[]; proportions: string; lighting: string };
  representative: string;
  scenes: Array<{ id: string; resource: string; views: string[]; subjects: Subject[];
    collisionSteps: string[]; interaction: { before: string; after: string; key: string } }>;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 3 && v.length <= 2000;
const nodePath = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 500
  && !v.startsWith('/') && !v.includes('\\') && !v.includes('\0') && v.split('/').every(p => p && p !== '.' && p !== '..');
const resource = (v: unknown): v is string => typeof v === 'string' && v.startsWith('res://') && nodePath(v.slice(6));
const modelResources = (v: unknown): v is string | string[] => resource(v) || (Array.isArray(v) && v.length > 0 && v.length <= 32 && v.every(resource) && new Set(v).size === v.length);
const names = (v: unknown, min: number): v is string[] => Array.isArray(v) && v.length >= min && v.length <= 24
  && v.every(nodePath) && new Set(v).size === v.length;
export function parseSceneQuality(value: unknown): SceneQualityContract {
  if (!object(value) || value.version !== 1 || !object(value.artDirection)
    || !['style', 'proportions', 'lighting'].every(k => text(value.artDirection && (value.artDirection as Record<string, unknown>)[k]))
    || !Array.isArray(value.artDirection.palette) || value.artDirection.palette.length < 3 || value.artDirection.palette.length > 12
    || value.artDirection.palette.some(c => typeof c !== 'string' || !/^#[a-f0-9]{6}$/iu.test(c))
    || !Array.isArray(value.scenes) || !value.scenes.length || value.scenes.length > 12) throw new Error('3D 场景规格需要风格、3–12 色色板、比例、灯光规则及 1–12 个场景。');
  const ids = new Set(); const resources = new Set();
  for (const scene of value.scenes) {
    if (!object(scene) || !nodePath(scene.id) || ids.has(scene.id) || !resource(scene.resource) || resources.has(scene.resource)
      || !names(scene.views, 2) || !names(scene.collisionSteps, 1) || !object(scene.interaction)
      || !nodePath(scene.interaction.before) || !nodePath(scene.interaction.after) || scene.interaction.before === scene.interaction.after
      || !['score', 'collected', 'has_relic', 'seal_broken', 'last_event', 'enemy_health', 'mana', 'state', 'phase'].includes(String(scene.interaction.key))
      || !Array.isArray(scene.subjects) || scene.subjects.length < 4 || scene.subjects.length > 200) throw new Error('场景需要唯一 id/resource、至少两个视角、碰撞步骤、交互前后步骤及对象绑定。');
    ids.add(scene.id); resources.add(scene.resource); const subjectIds = new Set(); const paths: string[] = [];
    for (const subject of scene.subjects) {
      if (!object(subject) || !nodePath(subject.id) || subjectIds.has(subject.id) || !nodePath(subject.node)
        || paths.some(p => within(p, String(subject.node)) || within(String(subject.node), p))
        || !['player', 'terrain', 'environment', 'interactive', 'hud'].includes(String(subject.role))
        || !['model', 'procedural', 'interface', 'viewpoint'].includes(String(subject.treatment)) || !text(subject.design)
        || !['solid', 'trigger', 'none'].includes(String(subject.collision))
        || (subject.treatment === 'model' && !modelResources(subject.resource))
        || (subject.treatment === 'interface' && subject.role !== 'hud')
        || (subject.treatment === 'viewpoint' && subject.role !== 'player')) throw new Error('对象绑定路径必须独立且唯一；需要外观方案、来源和碰撞意图，不能用根节点笼统覆盖全场景。');
      subjectIds.add(subject.id); paths.push(subject.node);
    }
    if (['player', 'terrain', 'interactive', 'hud'].some(role => !(scene.subjects as Subject[]).some(s => s.role === role))) throw new Error('3D 样板必须覆盖玩家、地形、交互对象和 HUD。');
    if (!(scene.subjects as Subject[]).some(s => s.role === 'player' && s.collision === 'solid')
      || !(scene.subjects as Subject[]).some(s => s.role === 'terrain' && s.collision === 'solid')) throw new Error('玩家及地形必须声明实体碰撞。');
  }
  if (!ids.has(value.representative)) throw new Error('代表性场景必须来自场景清单。');
  return value as unknown as SceneQualityContract;
}
export async function readSceneQuality(root: string): Promise<SceneQualityContract> {
  const bytes = await readFile(join(root, SCENE_QUALITY_PATH));
  if (bytes.length > 128000) throw new Error('3D 场景规格超过 128 KB');
  return parseSceneQuality(JSON.parse(bytes.toString('utf8')));
}
const within = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`);
const visible = (n: Record<string, unknown>) => n.visible === true && n.inViewport === true;
const finiteVector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n));
function changed(a: unknown, b: unknown): boolean {
  return finiteVector(a) && finiteVector(b) && a.some((n,i) => Math.abs(n - b[i]!) > 0.02);
}

/** Checks complete loaded-scene inventories, never an aesthetic score. The
 * source contract describes intent; it cannot mark itself visually accepted. */
export function evaluateSceneQuality(contract: SceneQualityContract, report: GameplayExperienceReport,
  scope: 'sample' | 'delivery' = 'delivery'): SceneQualitySummary {
  const result: SceneQualitySummary = { version: 1, buildId: report.build?.buildId ?? '', sourceHash: report.build?.sourceHash ?? '', artifactHash: report.build?.artifactHash ?? '',
    status: 'repair', checkedAt: new Date().toISOString(), scope: scope === 'sample' ? '代表性场景' : '全部已声明场景与本次运行出现的几何对象',
    observedGeometry: 0, coveredGeometry: 0, proceduralGeometry: 0, findings: [], reviewRequired: [], reportPath: 'artifacts/playtest/latest/report.json' };
  const failures = new Set<string>(); const reviews = new Set<string>();
  const add = (s: string) => failures.add(s);
  if (!report.build) add('缺少冻结构建标识');
  const steps = new Map(report.journey.map(s => [s.id, s]));
  const evidence = (report.runtimeEvidence ?? []).filter(e => e.packet?.buildId === report.build?.buildId && e.packet
    && !e.packet.paused && ['playing'].includes(String(e.packet.state.state ?? e.packet.state.phase))
    && steps.get(e.stepId)?.screenshotPath && steps.get(e.stepId)!.observations.length > 0 && steps.get(e.stepId)!.observations.every(o => o.status === 'pass'));
  const valid = evidence.filter(e => e.packet!.scene3d && !e.packet!.scene3d.truncated);
  if (!evidence.length) add('缺少 playing 状态下真实操作及截图证据');
  for (const e of evidence) if (!e.packet!.scene3d || e.packet!.scene3d.truncated) add(`${e.stepId}: 3D 场景采样缺失或超限，覆盖范围不完整`);
  const allGeometry = new Map<string, { node: Record<string, unknown>; scene: string }>();
  for (const e of valid) for (const node of e.packet!.scene3d!.nodes) if (node.kind === 'geometry') {
    const scene = e.packet!.scene3d!.scene;
    allGeometry.set(`${scene}:${node.path}`, { node, scene });
  }
  result.observedGeometry = allGeometry.size;
  for (const { node, scene } of allGeometry.values()) {
    const subject = contract.scenes.find(s => s.resource === scene)?.subjects.find(s => within(String(node.path), s.node));
    if (subject) { result.coveredGeometry++; if (subject.treatment === 'procedural') result.proceduralGeometry++; }
  }
  // Validate every observed state, not just the final appearance of a node.
  for (const { node, scene } of valid.flatMap(e => e.packet!.scene3d!.nodes.filter(n => n.kind === 'geometry').map(node => ({ node, scene: e.packet!.scene3d!.scene })))) {
    const definition = contract.scenes.find(s => s.resource === scene);
    const subject = definition?.subjects.find(s => within(String(node.path), s.node));
    if (!subject) add(`${node.path}: 运行几何对象未纳入场景外观清单（${scene}）`);
    else {
      if (subject.treatment === 'interface' || subject.treatment === 'viewpoint') add(`${node.path}: 实际几何对象不能归入界面或无模型视点`);
      if (!Number.isSafeInteger(node.surfaces) || Number(node.surfaces) < 1 || node.meshClass === 'unsupported') add(`${node.path}: 缺少可核对的网格表面，特殊渲染需要补充支持`);
      if (!Number.isSafeInteger(node.materials) || Number(node.materials) < Number(node.surfaces)) add(`${node.path}: 存在未绑定材质的网格表面`);
      const resources = Array.isArray(subject.resource) ? subject.resource : [subject.resource];
      if (subject.treatment === 'model' && !resources.some(path => node.sourceScene === path || node.meshResource === path
        || (typeof path === 'string' && String(node.meshResource).startsWith(`${path}::`)))) add(`${node.path}: 实际模型资源与 ${resources.join(', ')} 不一致`);
      if (node.primitive === true) reviews.add(`${node.path}: 基础几何外观需按设计和实机截图判断，不能因已登记就视为美术通过`);
      if (subject.treatment === 'procedural') reviews.add(`${subject.id}: 程序生成外观需审查轮廓、比例、材质和重复分布；设计：${subject.design}`);
    }
  }
  if (!allGeometry.size) add('未观察到实际 3D 几何');
  const scenes = scope === 'sample' ? contract.scenes.filter(s => s.id === contract.representative) : contract.scenes;
  for (const scene of scenes) {
    const samples = valid.filter(e => e.packet!.scene3d!.scene === scene.resource);
    const at = (id: string) => samples.find(e => e.stepId === id)?.packet;
    if (!samples.length) { add(`${scene.id}: 未到达该场景，不能以其他场景代替`); continue; }
    const views = scene.views.map(id => ({ id, packet: at(id) })).filter(v => v.packet);
    for (const id of scene.views) if (!at(id) || !['move', 'primary'].includes(steps.get(id)?.action ?? '')) add(`${scene.id}/${id}: 缺少真实移动或交互视角`);
    const cameras = views.map(v => v.packet!.scene3d!.nodes.find(n => n.kind === 'camera' && n.current === true));
    if (cameras.some(c => !c) || !cameras.some(a => cameras.some(b => a && b && (changed(a.position, b.position) || changed(a.rotation, b.rotation))))) add(`${scene.id}: 至少两个实际变化的相机视角，静止重复截图不算多视角`);
    for (const subject of scene.subjects) {
      const nodes = samples.flatMap(e => e.packet!.scene3d!.nodes.filter(n => within(String(n.path), subject.node)));
      if (subject.treatment === 'interface') {
        if (!views.some(v => v.packet!.nodes.some(n => within(String(n.path), subject.node) && visible(n)))) add(`${subject.id}: HUD 在视角截图中不可见或未采样`);
      } else if (subject.treatment === 'viewpoint') {
        if (!nodes.some(n => n.kind === 'camera' && n.current === true)) add(`${subject.id}: 第一人称视点没有实际活动相机`);
      } else if (!views.some(v => v.packet!.scene3d!.nodes.some(n => within(String(n.path), subject.node) && n.kind === 'geometry' && visible(n)))) add(`${subject.id}: 未在样板视角中观察到实际几何，需补充路线和截图`);
      if (subject.collision !== 'none') {
        const bodies = nodes.filter(n => n.kind === 'body' && (subject.collision === 'trigger' ? n.class === 'Area3D' : n.class !== 'Area3D') && Number(n.layer) > 0);
        if (!bodies.some(body => nodes.some(n => n.kind === 'shape' && n.body === body.path && n.enabled === true))) add(`${subject.id}: 缺少启用且有碰撞层的${subject.collision === 'solid' ? '实体' : '触发'}碰撞结构`);
      }
    }
    const contactSamples = scene.collisionSteps.map(at);
    for (const id of scene.collisionSteps) if (!at(id) || steps.get(id)?.action !== 'move') add(`${scene.id}/${id}: 缺少移动碰撞采样`);
    const players = scene.subjects.filter(s => s.role === 'player');
    for (const subject of scene.subjects.filter(s => ['terrain', 'interactive'].includes(s.role) && s.collision === 'solid')) {
      if (!contactSamples.some(p => p?.scene3d!.nodes.some(n => {
        if (n.kind !== 'body' || n.class !== 'CharacterBody3D' || !players.some(s => within(String(n.path), s.node))) return false;
        if (Array.isArray(n.contacts) && n.contacts.some(contact => within(String(contact), subject.node))) return true;
        const previous = samples.filter(e => e.packet!.sequence < p.sequence).at(-1)?.packet?.engineFrame ?? 0;
        return Array.isArray(n.recentContacts) && n.recentContacts.some(event => object(event) && within(String(event.path), subject.node)
          && typeof event.ageMs === 'number' && event.ageMs >= 0 && event.ageMs <= 1500
          && typeof event.engineFrame === 'number' && event.engineFrame > previous && event.engineFrame <= p.engineFrame);
      }))) add(`${scene.id}/${subject.id}: 没有观察到玩家与该实体的真实碰撞接触；地面接触不能替代机关碰撞验收`);
    }
    const before = at(scene.interaction.before); const after = at(scene.interaction.after);
    if (!before || !after || steps.get(scene.interaction.after)?.action !== 'primary' || after.sequence <= before.sequence
      || before.state[scene.interaction.key] === undefined || after.state[scene.interaction.key] === undefined
      || before.state[scene.interaction.key] === after.state[scene.interaction.key]) add(`${scene.id}: 缺少实际主操作前后的交互状态变化`);
    if (!views.some(v => ['player', 'terrain', 'interactive', 'hud'].every(role => scene.subjects.filter(s => s.role === role).some(s =>
      s.treatment === 'viewpoint' ? v.packet!.scene3d!.nodes.some(n => within(String(n.path), s.node) && n.kind === 'camera' && n.current === true)
        : (s.treatment === 'interface' ? v.packet!.nodes : v.packet!.scene3d!.nodes).some(n => within(String(n.path), s.node) && visible(n)))))) add(`${scene.id}: 未在同一画面观察到玩家、地形、交互对象和 HUD`);
  }
  for (const e of evidence) for (const f of e.packet!.findings) if (f.severity === 'error') add(`${f.path ?? e.stepId}: ${f.message}`);
  reviews.add('相机视锥与碰撞结构只是技术证据。独立审查须打开实际截图，核对遮挡、穿模、比例、轮廓、灯光、风格和交互反馈。');
  result.findings = [...failures].map(f => `SCENE_QUALITY: ${f}`);
  result.reviewRequired = [...reviews]; result.status = failures.size ? 'repair' : 'pass'; return result;
}

export const SCENE_QUALITY_GUIDE = `Maintain ${SCENE_QUALITY_PATH} (version 1) before expanding 3D content. It is design intent, never proof of success.
artDirection requires style, palette (3–12 hex colors), proportions and lighting. representative names one scene id.
scenes lists EVERY intended gameplay scene (id, resource: res://main.tscn, views: at least two actual move/primary journey step IDs,
collisionSteps: move step IDs, interaction: {before: stepId, after: primaryStepId, key: real root gameplay state key}, subjects).
Every subject has id, node (relative runtime SceneTree subtree, never '.' or overlapping another subject), role (player/terrain/environment/interactive/hud),
treatment (model/procedural/interface/viewpoint), design (specific silhouette/material/style intent), collision (solid/trigger/none).
model requires resource (one res:// path or a list of up to 32 paths for multipart characters/equipment) matching actual instantiated GLB scenes or Mesh resources; procedural requires a specific design and actual material surfaces.
Use viewpoint only for a first-person player subtree with an active camera, interface only for HUD. Player and terrain require solid collisions.
Capture actual CharacterBody3D sliding contact with EACH declared solid terrain and interactive subject during movement; do not fabricate state or add test teleports.
Interaction must change an existing real gameplay state (score/collected/has_relic/seal_broken/last_event/enemy_health/mana/state/phase) after primary input.
Change camera position or angle through real input between views. Show player or first-person view, terrain, interactable and HUD together.
The host independently scans all loaded geometry, including offscreen, procedural and MultiMesh objects. Declare all of them; do not hide/remove objects to evade coverage.
No asset count, declared design, successful export, or primitive mesh certifies aesthetics. Use image reference -> Three.js model -> GLB where modeling is needed.
Read sceneQuality in artifacts/playtest/latest/report.json, fix unbound objects, unsupported renderers, missing materials, absent collision structures and incomplete sampling.
During sample stage inspect the representative scene; delivery must visit EVERY declared scene. Keep all planned scenes in the contract even before they are built.
The read-only reviewer must open host screenshots for every view and compare proportions, silhouette, ground/vegetation density, composition, lighting, UI, collision alignment and interaction feedback with the original brief and reference images.
Return repair for repeated placeholder primitives, missing reference evidence, broad empty terrain, incoherent visual styles, incorrect collision/occlusion or unvisited requested regions.
Sampling is bounded (600 relevant 3D objects, 8000 visited nodes, 240 KB packet budget); limits produce incomplete evidence, never an automatic pass. Large scenes need scoped streaming and real journeys, not weakened acceptance.`;

export async function inspectSceneQuality(root: string, report: GameplayExperienceReport, scope: 'sample' | 'delivery' = 'delivery'): Promise<SceneQualitySummary> {
  try { return evaluateSceneQuality(await readSceneQuality(root), report, scope); }
  catch (error) { return { version: 1, buildId: report.build?.buildId ?? '', sourceHash: report.build?.sourceHash ?? '', artifactHash: report.build?.artifactHash ?? '',
    status: 'repair', checkedAt: new Date().toISOString(), scope: scope === 'sample' ? '代表性场景' : '全部已声明场景', observedGeometry: 0, coveredGeometry: 0, proceduralGeometry: 0,
    findings: [`SCENE_QUALITY: ${error instanceof Error ? error.message : String(error)}`], reviewRequired: ['缺少可用场景规格，不能认定画面质量通过。'], reportPath: 'artifacts/playtest/latest/report.json' }; }
}

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import type { RuntimePacket } from '../runtime/runtimeEvidence.js';

export const VISUAL_SAMPLE_PATH = '.noobi/visual-sample.json';
type Role = 'player' | 'terrain' | 'interactive' | 'hud';
export interface VisualSampleContract {
  version: 1;
  artDirection: { style: string; palette: string[]; readability: string };
  bindings: Array<{ id: string; role: Role; node: string; resource: string | string[];
    /** Final viewport-space image dimensions, NOT source-image resolution. */
    size: [number, number]; animated?: boolean }>;
}
const ROLES: Role[] = ['player', 'terrain', 'interactive', 'hud'];
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length >= 3 && value.length <= 2000;
const pair = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2
  && value.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 8192);
const imagePath = (value: unknown): value is string => typeof value === 'string'
  && /^res:\/\/(?:[^/]+\/)*[^/]+\.(?:png|webp|jpg|jpeg)$/iu.test(value) && !value.includes('..') && !value.includes('\\');
const imagePaths = (value: unknown): boolean => imagePath(value) || (Array.isArray(value) && value.length > 0
  && value.length <= 32 && value.every(imagePath) && new Set(value).size === value.length);

export function parseVisualSample(value: unknown): VisualSampleContract {
  if (!object(value) || value.version !== 1 || !object(value.artDirection)
    || !nonempty(value.artDirection.style) || !nonempty(value.artDirection.readability)
    || !Array.isArray(value.artDirection.palette) || value.artDirection.palette.length < 3
    || value.artDirection.palette.length > 12 || value.artDirection.palette.some(c => typeof c !== 'string' || !/^#[\da-f]{6}$/iu.test(c))
    || !Array.isArray(value.bindings) || value.bindings.length < 4 || value.bindings.length > 40) {
    throw new Error('视觉样板需要 version=1、artDirection(style/palette/readability) 和 4–40 个素材绑定。');
  }
  const ids = new Set<string>(); const nodes = new Set<string>();
  for (const binding of value.bindings) {
    if (!object(binding) || !nonempty(binding.id) || ids.has(binding.id)
      || typeof binding.role !== 'string' || !ROLES.includes(binding.role as Role)
      || !nonempty(binding.node) || binding.node.startsWith('/') || binding.node.split('/').includes('..') || nodes.has(binding.node)
      || !imagePaths(binding.resource) || !pair(binding.size)
      || (binding.animated !== undefined && typeof binding.animated !== 'boolean')) {
      throw new Error('素材绑定需要唯一 id/node、player/terrain/interactive/hud 角色、res:// 图片路径和最终 size:[宽,高]。');
    }
    ids.add(binding.id); nodes.add(binding.node);
  }
  if (ROLES.some(role => !(value.bindings as Array<Record<string, unknown>>).some(b => b.role === role))) {
    throw new Error('视觉样板必须同时包含 player、terrain、interactive、hud；背景不能替代这些角色。');
  }
  return value as unknown as VisualSampleContract;
}

/** Read only from the host-frozen build. The build store already rejects symlinks. */
export async function readVisualSample(snapshotRoot: string): Promise<VisualSampleContract> {
  const bytes = await readFile(join(snapshotRoot, VISUAL_SAMPLE_PATH));
  if (bytes.length > 64_000) throw new Error('视觉样板规格超过 64 KB');
  return parseVisualSample(JSON.parse(bytes.toString('utf8')));
}

function isPlaying(packet: RuntimePacket): boolean {
  return !packet.paused && ['playing'].includes(String(packet.state.state ?? packet.state.phase));
}
function visible(node: Record<string, unknown>): boolean {
  return node.visible === true && node.inViewport === true && Number(node.opacity) > 0.05;
}

/** These are binding checks, not an aesthetic score. A separate read-only
 * reviewer must inspect the captured scene and its action frames. */
export function visualSampleFindings(contract: VisualSampleContract, report: GameplayExperienceReport): string[] {
  const findings: string[] = [];
  if (!report.build) return ['VISUAL_SAMPLE: 缺少绑定到构建的运行证据。'];
  const steps = new Set(report.journey.filter(step => step.screenshotPath && step.observations.every(o => o.status === 'pass')).map(step => step.id));
  const packets = (report.runtimeEvidence ?? []).filter(e => steps.has(e.stepId) && e.packet?.buildId === report.build!.buildId)
    .map(e => e.packet!).filter(isPlaying);
  if (!packets.length) return ['VISUAL_SAMPLE: 缺少真实操作后 playing 状态的场景采样。'];
  if (!report.screenshots.action.length) findings.push('没有操作截图，不能审查运行中的视觉样板。');
  for (const binding of contract.bindings) {
    const nodes = packets.flatMap(packet => packet.nodes.filter(node => node.path === binding.node && visible(node)));
    if (!nodes.length) { findings.push(`${binding.id}: ${binding.node} 在操作画面中不可见或未采样。`); continue; }
    const resources = Array.isArray(binding.resource) ? binding.resource : [binding.resource];
    if (nodes.some(node => !resources.includes(String(node.texture)))) findings.push(`${binding.id}: 运行时纹理与 ${resources.join(', ')} 不符。`);
    const dimensions = nodes.map(node => node.displaySize);
    if (dimensions.some(actual => !pair(actual) || actual.some((n, i) => Math.abs(n - binding.size[i]!) > 2))) {
      findings.push(`${binding.id}: 预期显示 ${binding.size.join('×')}，实际 ${JSON.stringify(dimensions[0])}；检查 TextureRect expand_mode、缩放和切帧。`);
    }
    if (binding.animated && new Set(nodes.map(node => JSON.stringify([node.animation, node.frame, node.texture,
      node.regionEnabled ? node.region : null]))).size < 2) {
      findings.push(`${binding.id}: 未观察到至少两个动画帧；请在试玩路径中实际触发动作。`);
    }
  }
  // All four subjects must coexist in at least one gameplay frame. Showing
  // each one on a separate loading/menu page cannot satisfy the sample.
  if (!packets.some(packet => ROLES.every(role => contract.bindings.filter(b => b.role === role)
    .some(b => packet.nodes.some(n => n.path === b.node && visible(n)))))) {
    findings.push('未在同一运行画面中观察到角色、地形、交互物与 HUD。');
  }
  for (const packet of packets) for (const finding of packet.findings) {
    if (finding.severity === 'error') findings.push(`${finding.path ?? '场景'}: ${finding.code} ${finding.characters ?? ''}`);
  }
  return [...new Set(findings)].map(f => `VISUAL_SAMPLE: ${f}`);
}

export const VISUAL_SAMPLE_GUIDE = `Before content expansion, maintain ${VISUAL_SAMPLE_PATH}:
{"version":1,"artDirection":{"style":"coherent visual style and reference assets","palette":["#203b32","#74a765","#ffd980"],"readability":"foreground contrast, font and scale rules"},"bindings":[
{"id":"player","role":"player","node":"Player/Art","resource":"res://public/assets/player.png","size":[48,64],"animated":true},
{"id":"terrain","role":"terrain","node":"Terrain/Ground","resource":"res://public/assets/ground.png","size":[160,32]},
{"id":"pickup","role":"interactive","node":"Seed/Art","resource":"res://public/assets/seed.png","size":[24,24]},
{"id":"hud-icon","role":"hud","node":"HUD/Heart","resource":"res://public/assets/heart.png","size":[42,56]}]}
Use actual relative SceneTree paths from runtimeEvidence, real resources and designed display sizes; this example is a schema, not required artwork.
Each role must have a distinct node. Sprite2D and TextureRect and AnimatedSprite2D are supported. AtlasTexture resolves to its atlas source.
For animations using separate frame images, resource may be a list of the allowed res:// image paths. Region changes also count as frame changes.
Size means final viewport-space image width/height including parent scale and camera zoom, after cropping/aspect fitting. Do not change desired sizes merely to match broken layout.
Show these subjects together in playing state during the real input journey. If animated=true, capture distinct frames during movement.
Use runtime/noobi/presentation_v1.gd for new icons/atlas sprites when appropriate; keep tested physics and gameplay intact.
The host checks binding and character coverage, then a read-only reviewer inspects screenshots for style, proportions, anchors, background seams,
custom-drawn text, action feedback and sound wiring. Passing numeric checks alone never certifies visual quality or fun.
Keep final source assets and derived atlas regions separate; reuse existing art when correcting a binding bug.`;

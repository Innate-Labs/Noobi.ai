/** Authored game intent is distinct from host measurements and in-game acceptance. */
export interface ArtBible {
  version: 1; id: string; style: string; palette: string[];
  units: 'meters'; up: '+Y'; forward: '-Z';
  budgets: { triangles: number; nodes: number; materials: number; textureSize: number };
}
export interface ModelAssetSpec {
  version?: 2; referenceImage: string;
  parts: Array<{ name: string; shape: string; material: string }>;
  criticalFeatures: string[]; inferredSurfaces: string[];
  artBiblePath?: string;
  game?: { dimensions: [number, number, number]; tolerance: number;
    pivot: { node: string; position: [number, number, number] };
    sockets: Array<{ id: string; node: string; position: [number, number, number] }>;
    collision: { kind: 'none' | 'capsule' | 'box' | 'convex' | 'trimesh'; purpose: string } };
  animation?: { mode: 'none' | 'transform' | 'skeletal'; required: string[] };
}
export interface ModelInspection {
  bounds: { min: number[]; max: number[] }; nodeCount: number; materialCount: number; maxTextureSize: number;
  nodes: Array<{ name: string; position: number[] }>;
  clips: Array<{ name: string; duration: number; targets: number; motionObserved: boolean }>;
}
const object = (v: unknown): v is Record<string, any> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const label = (v: unknown, max = 1000): v is string => typeof v === 'string' && Boolean(v.trim()) && v.length <= max;
const list = (v: unknown, min: number, max: number): v is string[] => Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => label(x));
const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10000);
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function parseModelAssetSpec(value: unknown, reference: string): ModelAssetSpec {
  demand(object(value) && value.referenceImage === reference && Array.isArray(value.parts) && value.parts.length > 0 && value.parts.length <= 128
    && value.parts.every(p => object(p) && label(p.name, 120) && label(p.shape) && label(p.material))
    && list(value.criticalFeatures, 1, 32) && list(value.inferredSurfaces, 0, 32),
  'Model .spec.json requires matching referenceImage, named parts/shape/material, criticalFeatures and inferredSurfaces');
  demand(value.version === undefined || value.version === 2, 'Unsupported model spec version');
  if (value.version === 2) {
    demand(value.artBiblePath === '.noobi/art-bible.json', 'Spec v2 requires .noobi/art-bible.json');
    const game = value.game, animation = value.animation;
    demand(object(game) && vector(game.dimensions) && game.dimensions.every(n => n > 0) && typeof game.tolerance === 'number'
      && Number.isFinite(game.tolerance) && game.tolerance >= 0.001 && game.tolerance <= 0.25, 'Spec v2 requires positive dimensions and tolerance 0.001–0.25');
    demand(object(game.pivot) && label(game.pivot.node, 120) && vector(game.pivot.position), 'Spec v2 requires a named pivot and position in meters');
    demand(Array.isArray(game.sockets) && game.sockets.length <= 32 && game.sockets.every(s => object(s) && label(s.id, 120) && label(s.node, 120) && vector(s.position))
      && new Set(game.sockets.map(s => s.id)).size === game.sockets.length, 'Spec v2 sockets require unique IDs, node names and positions');
    demand(object(game.collision) && ['none', 'capsule', 'box', 'convex', 'trimesh'].includes(game.collision.kind) && label(game.collision.purpose), 'Spec v2 requires collision intent');
    demand(object(animation) && ['none', 'transform', 'skeletal'].includes(animation.mode) && list(animation.required, animation.mode === 'none' ? 0 : 1, 32)
      && (animation.mode !== 'none' || animation.required.length === 0) && new Set(animation.required).size === animation.required.length, 'Spec v2 requires explicit animation mode and unique clips');
  }
  return value as unknown as ModelAssetSpec;
}
export function parseArtBible(value: unknown): ArtBible {
  demand(object(value) && value.version === 1 && label(value.id, 120) && label(value.style, 2000) && list(value.palette, 1, 16)
    && value.palette.every(color => /^#[\da-f]{6}$/iu.test(color)) && value.units === 'meters' && value.up === '+Y' && value.forward === '-Z',
  'ArtBible requires version 1, ID, style, hex palette and meters/+Y/-Z convention');
  demand(object(value.budgets), 'ArtBible requires per-model budgets');
  for (const [key, max] of Object.entries({ triangles: 100000, nodes: 2048, materials: 64, textureSize: 2048 })) {
    demand(Number.isInteger(value.budgets[key]) && value.budgets[key] >= 1 && value.budgets[key] <= max, `ArtBible ${key} must be between 1 and ${max}`);
  }
  return value as unknown as ArtBible;
}
export function validateModelInspection(spec: ModelAssetSpec, art: ArtBible, result: { triangles: number; skins: number; inspection?: ModelInspection }): void {
  const data = result.inspection;
  demand(data && vector(data.bounds.min) && vector(data.bounds.max) && Number.isInteger(data.nodeCount) && data.nodeCount > 0
    && Number.isInteger(data.materialCount) && data.materialCount > 0 && Number.isFinite(data.maxTextureSize) && data.maxTextureSize >= 0, 'Missing independent model measurements');
  demand(result.triangles <= art.budgets.triangles && data.nodeCount <= art.budgets.nodes && data.materialCount <= art.budgets.materials
    && data.maxTextureSize <= art.budgets.textureSize, 'Model exceeds selected ArtBible budget');
  const game = spec.game!;
  const size = data.bounds.max.map((x, i) => x - data.bounds.min[i]!);
  demand(size.every((x, i) => Math.abs(x - game.dimensions[i]!) <= game.dimensions[i]! * game.tolerance), `Model dimensions differ from spec: measured ${size.join(', ')} meters`);
  for (const point of [game.pivot, ...game.sockets]) {
    const nodes = data.nodes.filter(node => node.name === point.node);
    demand(nodes.length === 1 && vector(nodes[0]!.position), `Missing or ambiguous pivot/socket node: ${point.node}`);
    demand(nodes[0]!.position.every((x, i) => Math.abs(x - point.position[i]!) <= 0.02), `Pivot/socket ${point.node} differs by more than 0.02 meters`);
  }
  const animation = spec.animation!;
  if (animation.mode === 'skeletal') demand(result.skins > 0, 'Skeletal animation requires an exported skin');
  for (const name of animation.required) {
    const clips = data.clips.filter(clip => clip.name === name);
    demand(clips.length === 1 && clips[0]!.duration > 0 && clips[0]!.targets > 0 && clips[0]!.motionObserved, `Required clip is missing, ambiguous, unbound or static: ${name}`);
  }
}

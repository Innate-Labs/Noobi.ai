import { describe, expect, it } from 'vitest';
import { parseArtBible, parseModelAssetSpec, validateModelInspection, type ModelInspection } from './modelAssetSpec.js';
const art = { version: 1, id: 'test', style: 'painted wood', palette: ['#77aa88'], units: 'meters', up: '+Y', forward: '-Z', budgets: { triangles: 1000, nodes: 20, materials: 2, textureSize: 512 } };
const spec = { version: 2, referenceImage: 'reference.png', parts: [{ name: 'body', shape: 'box', material: 'wood' }], criticalFeatures: ['square'], inferredSurfaces: [], artBiblePath: '.noobi/art-bible.json',
  game: { dimensions: [1, 2, 1], tolerance: 0.1, pivot: { node: 'ActorRoot', position: [0, 0, 0] }, sockets: [{ id: 'hand', node: 'HandSocket', position: [0.4, 1.2, 0] }], collision: { kind: 'capsule', purpose: 'movement' } },
  animation: { mode: 'transform', required: ['walk'] } };
const measured: ModelInspection = { bounds: { min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] }, nodeCount: 3, materialCount: 1, maxTextureSize: 256,
  nodes: [{ name: 'ActorRoot', position: [0, 0, 0] }, { name: 'HandSocket', position: [0.4, 1.2, 0] }], clips: [{ name: 'walk', duration: 1, targets: 1, motionObserved: true }] };
describe('model assembly contract', () => {
  it('requires finite bounded dimensions, explicit collision and coherent animation mode', () => {
    expect(parseModelAssetSpec(spec, 'reference.png').version).toBe(2);
    for (const patch of [{ version: 3 }, { artBiblePath: '../other.json' }, { game: { ...spec.game, tolerance: 1 } },
      { game: { ...spec.game, dimensions: [NaN, 2, 1] } }, { animation: { mode: 'none', required: ['walk'] } }]) {
      expect(() => parseModelAssetSpec({ ...spec, ...patch }, 'reference.png')).toThrow();
    }
    expect(() => parseArtBible({ ...art, budgets: { ...art.budgets, triangles: 100001 } })).toThrow('triangles');
  });
  it('checks actual scale, unambiguous socket locations, material budgets and moving clip bindings', () => {
    const validate = (inspection: ModelInspection) => validateModelInspection(parseModelAssetSpec(spec, 'reference.png'), parseArtBible(art), { triangles: 100, skins: 0, inspection });
    expect(() => validate(measured)).not.toThrow();
    expect(() => validate({ ...measured, bounds: { min: [-0.5, 0, -0.5], max: [0.5, 20, 0.5] } })).toThrow('dimensions');
    expect(() => validate({ ...measured, nodes: [...measured.nodes, measured.nodes[1]!] })).toThrow('ambiguous');
    expect(() => validate({ ...measured, nodes: [measured.nodes[0]!, { name: 'HandSocket', position: [4, 1.2, 0] }] })).toThrow('0.02');
    expect(() => validate({ ...measured, materialCount: 3 })).toThrow('budget');
    expect(() => validate({ ...measured, clips: [{ ...measured.clips[0]!, motionObserved: false }] })).toThrow('static');
    expect(() => validateModelInspection(parseModelAssetSpec({ ...spec, animation: { mode: 'skeletal', required: ['walk'] } }, 'reference.png'), parseArtBible(art), { triangles: 100, skins: 0, inspection: measured })).toThrow('skin');
  });
});

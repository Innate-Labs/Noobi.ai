import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetStore } from './assetStore.js';
import { ReferenceModel3dService, readProjectBytes } from './referenceModel3d.js';
import { createProceduralModel3dGlb } from './proceduralModel3d.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-reference-')); roots.push(root);
  const project = { id: 'project', root };
  await mkdir(join(root, 'model-sources'));
  await writeFile(join(root, 'reference.png'), png);
  await writeFile(join(root, 'model-sources/object.mjs'), 'export function createModel(THREE) { return {root:new THREE.Group(),animations:[]}; }');
  const assets = new AssetStore(); const [image] = await assets.importFiles(project.id, root, [join(root, 'reference.png')]);
  await writeFile(join(root,'model-sources/object.spec.json'),JSON.stringify({referenceImage:image!.relativePath,parts:[{name:'body',shape:'box',material:'wood'}],criticalFeatures:['box silhouette'],inferredSurfaces:['back']}));
  const fixture = await createProceduralModel3dGlb({name:'test-fixture',prompt:'crate'});
  const render = vi.fn(async () => ({glb:fixture.bytes, views:{front:png,side:png,back:png,perspective:png}, triangles:36,meshes:3,skins:0,animations:[] as string[]}));
  const service = new ReferenceModel3dService(assets, join(root, 'private-ledger'), render);
  const input = { project, kind:'model3d' as const, name:'object', prompt:'reference-based test', options:{ referenceImage:image!.relativePath,sourcePath:'model-sources/object.mjs' } };
  return {root,project,assets,render,service,input};
}
describe('reference model evidence', () => {
  it('binds the real reference/source/GLB and detects stale source and tampered captures', async () => {
    const c=await setup(); const result=await c.service.generate(c.input);
    expect(result.asset.metadata).toMatchObject({route:'image-threejs',visualReview:'pending'});
    expect(await c.service.verify(c.project,[result.asset])).toEqual([]);
    const source=await readFile(join(c.root,c.input.options.sourcePath));
    await writeFile(join(c.root,c.input.options.sourcePath),'changed');
    expect(await c.service.verify(c.project,[result.asset])).toHaveLength(1);
    await writeFile(join(c.root,c.input.options.sourcePath),source);
    await writeFile(join(c.root,String(result.asset.metadata?.evidencePath),'side.png'),'fake screenshot');
    expect(await c.service.verify(c.project,[result.asset])).toHaveLength(1);
    await writeFile(join(c.root,String(result.asset.metadata?.evidencePath),'side.png'),png);
    await writeFile(join(c.root,String(result.asset.metadata?.evidencePath),'perspective.png'),'tampered perspective');
    expect(await c.service.verify(c.project,[result.asset])).toHaveLength(1);
  });
  it('accepts a corrected source without blocking on superseded unused evidence', async () => {
    const c=await setup();const old=await c.service.generate(c.input);
    await writeFile(join(c.root,c.input.options.sourcePath),'// revised image-guided source');
    const next=await c.service.generate(c.input);
    expect(await c.service.verify(c.project,[next.asset,old.asset])).toEqual([]);
    const stripped={...next.asset,metadata:{}};
    await writeFile(join(c.root,c.input.options.referenceImage),'changed image');
    expect((await c.service.verify(c.project,[stripped])).length).toBeGreaterThan(0);
  });
  it('reuses identical bound output but rebuilds changed or damaged evidence', async () => {
    const c = await setup();
    const first = await c.service.generate(c.input);
    const again = await c.service.generate(c.input);
    expect(again.asset.id).toBe(first.asset.id);
    expect(c.render).toHaveBeenCalledTimes(1);
    await writeFile(join(c.root, String(first.asset.metadata?.evidencePath), 'front.png'), 'damaged');
    await c.service.generate(c.input);
    expect(c.render).toHaveBeenCalledTimes(2);
    await writeFile(join(c.root, c.input.options.sourcePath), '// corrected');
    await c.service.generate(c.input);
    expect(c.render).toHaveBeenCalledTimes(3);
  });

  it('binds a v2 art bible and rejects bad assembly before importing a model', async () => {
    const c = await setup();
    const specFile = join(c.root, 'model-sources/object.spec.json');
    const original = JSON.parse(await readFile(specFile, 'utf8'));
    const art = { version: 1, id: 'wood', style: 'wooden props', palette: ['#aa8844'], units: 'meters', up: '+Y', forward: '-Z', budgets: {triangles:1000,nodes:20,materials:4,textureSize:512} };
    await mkdir(join(c.root, '.noobi'), {recursive:true});
    await writeFile(join(c.root, '.noobi/art-bible.json'), JSON.stringify(art));
    await writeFile(specFile, JSON.stringify({...original,version:2,artBiblePath:'.noobi/art-bible.json', game:{dimensions:[1,1,1],tolerance:0.1,pivot:{node:'Root',position:[0,0,0]},sockets:[],collision:{kind:'box',purpose:'solid crate'}},animation:{mode:'none',required:[]}}));
    const base = await c.render();
    c.render.mockResolvedValue({...base,inspection:{bounds:{min:[-0.5,0,-0.5],max:[0.5,1,0.5]},nodeCount:3,materialCount:1,maxTextureSize:0,nodes:[{name:'Root',position:[0,0,0]}],clips:[]}} as typeof base);
    const result = await c.service.generate(c.input);
    expect(result.asset.metadata?.assemblyCheck).toBe('measured-contract-passed-runtime-pending');
    await writeFile(join(c.root, '.noobi/art-bible.json'), JSON.stringify({...art, budgets:{...art.budgets, triangles:10}}));
    expect(await c.service.verify(c.project,[result.asset])).toHaveLength(1);
    await expect(c.service.generate(c.input)).rejects.toThrow('budget');
    const models = (await c.assets.list(c.project.id,c.root)).filter(a=>a.kind==='model3d');
    expect(models).toHaveLength(1);
  });

  it('requires an explicit shape specification before executing authored code', async () => {
    const c=await setup();await writeFile(join(c.root,'model-sources/object.spec.json'),'{}');
    await expect(c.service.generate(c.input)).rejects.toThrow('criticalFeatures');
    expect(c.render).not.toHaveBeenCalled();
  });

  it('rejects missing images, traversal and symlinks before executing code', async () => {
    const c=await setup();
    for(const referenceImage of ['../reference.png','public/assets/images/missing.png']) {
      await expect(c.service.generate({...c.input,options:{...c.input.options,referenceImage}})).rejects.toThrow();
    }
    const outside=await mkdtemp(join(tmpdir(),'noobi-outside-'));roots.push(outside);await writeFile(join(outside,'evil.mjs'),'secret');
    await symlink(join(outside,'evil.mjs'),join(c.root,'model-sources/evil.mjs'));
    await expect(c.service.generate({...c.input,options:{...c.input.options,sourcePath:'model-sources/evil.mjs'}})).rejects.toThrow('leaves project');
    expect(c.render).not.toHaveBeenCalled();
    await expect(readProjectBytes(c.root,'reference.png',1)).rejects.toThrow('budget');
  });
  it('rejects empty, over-budget and falsely animated outputs', async () => {
    const c=await setup();
    await expect(c.service.generate({...c.input,options:{...c.input.options,animation:true}})).rejects.toThrow('skin');
    c.render.mockResolvedValueOnce({...await c.render(),triangles:100001});
    await expect(c.service.generate(c.input)).rejects.toThrow('budget');
  });
  it('does not write evidence through a project symlink', async () => {
    const c=await setup();const outside=await mkdtemp(join(tmpdir(),'noobi-evidence-'));roots.push(outside);
    await symlink(outside,join(c.root,'artifacts'));
    await expect(c.service.generate(c.input)).rejects.toThrow('symlinks');
  });
});

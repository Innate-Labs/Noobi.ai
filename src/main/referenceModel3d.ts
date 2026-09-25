import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { AssetStore } from './assetStore.js';
import type { MediaGenerationInput, MediaGenerationAssetResult } from './mediaGenerationService.js';
import type { GameAssetRecord } from '../shared/contracts.js';
import { parseArtBible, parseModelAssetSpec, validateModelInspection, type ModelInspection } from './modelAssetSpec.js';

export interface ModelRenderResult {
  glb: Buffer;
  views: { front: Buffer; side: Buffer; back: Buffer; perspective?: Buffer };
  triangles: number;
  meshes: number;
  skins: number;
  animations: string[];
  inspection?: ModelInspection;
}
export type ModelRenderer = (input: { source: string; reference: Buffer; mimeType: string; animation: boolean; glb?: Buffer }) => Promise<ModelRenderResult>;
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/** Host-owned evidence binds source, reference, exported GLB and captures. Visual judgment remains with the reviewer. */
export class ReferenceModel3dService {
  #tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly assets: AssetStore, private readonly storage: string, private readonly render: ModelRenderer) {}

  generate(input: MediaGenerationInput): Promise<MediaGenerationAssetResult> {
    const task = this.#tail.then(() => this.#generate(input));
    this.#tail = task.catch(() => undefined);
    return task;
  }

  async #generate(input: MediaGenerationInput): Promise<MediaGenerationAssetResult> {
    const started = Date.now();
    const referencePath = String(input.options?.referenceImage ?? '');
    const sourcePath = String(input.options?.sourcePath ?? '');
    if (referencePath.length > 480 || sourcePath.length > 480) throw new Error('Model input paths must be at most 480 characters');
    if (!/^public\/assets\/images\/.+\.(png|jpe?g|webp)$/iu.test(referencePath)) throw new Error('referenceImage must be a registered image under public/assets/images');
    if (!/^model-sources\/[A-Za-z0-9_/-]+\.mjs$/u.test(sourcePath)) throw new Error('sourcePath must be an .mjs file under model-sources');
    const reference = await readProjectBytes(input.project.root, referencePath, 16 * 1024 * 1024);
    const source = await readProjectBytes(input.project.root, sourcePath, 256 * 1024);
    const specPath = sourcePath.replace(/\.mjs$/u, '.spec.json');
    const specBytes = await readProjectBytes(input.project.root, specPath, 128 * 1024);
    let rawSpec: unknown;
    try { rawSpec = JSON.parse(specBytes.toString('utf8')); } catch { throw new Error('Model spec must be valid JSON'); }
    const spec = parseModelAssetSpec(rawSpec, referencePath);
    const artBytes = spec.version === 2 ? await readProjectBytes(input.project.root, spec.artBiblePath!, 32 * 1024) : null;
    const art = artBytes ? parseArtBible(JSON.parse(artBytes.toString('utf8'))) : null;
    const knownAssets = await this.assets.list(input.project.id, input.project.root);
    const image = knownAssets.find(asset => asset.kind === 'image'
      && asset.relativePath === referencePath && asset.sha256 === hash(reference));
    if (!image) throw new Error('Register the reference image before building its 3D model');
    const ledgerDir = join(this.storage, hash(input.project.id));
    const inputHash = hash(JSON.stringify({ renderer: 2, name: input.name, reference: hash(reference), source: hash(source),
      spec: hash(specBytes), art: artBytes ? hash(artBytes) : null, animation: input.options?.animation === true }));
    // Reuse only host-bound evidence with every referenced byte still intact.
    try {
      const pointer = JSON.parse(await readFile(join(ledgerDir, `latest-${hash(sourcePath)}.json`), 'utf8'));
      if (!/^[a-f0-9-]{36}$/u.test(pointer.id)) throw new Error('Invalid evidence pointer');
      const record = JSON.parse(await readFile(join(ledgerDir, `${pointer.id}.json`), 'utf8'));
      const asset = knownAssets.find(a => a.relativePath === record.assetPath && a.sha256 === record.assetHash);
      if (!asset || asset.metadata?.evidenceId !== record.id || record.inputHash !== inputHash) throw new Error('Inputs changed');
      for (const [path, expected] of Object.entries({ [record.assetPath]: record.assetHash, ...record.evidence })) {
        if (hash(await readProjectBytes(input.project.root, path, 16 * 1024 * 1024)) !== expected) throw new Error('Evidence changed');
      }
      return modelResult(asset);
    } catch { /* Missing, stale or damaged evidence must be rebuilt, never certified. */ }
    const result = await this.render({ source: source.toString('utf8'), reference, mimeType: image.mimeType, animation: input.options?.animation === true });
    if (result.glb.length > 16 * 1024 * 1024 || result.glb.length < 20 || result.glb.toString('ascii', 0, 4) !== 'glTF'
      || result.meshes < 1 || result.triangles < 1 || result.triangles > 100_000) throw new Error('Invalid model geometry or model exceeds the 100,000 triangle / 16 MiB budget');
    if (input.options?.animation === true && (result.skins < 1 || result.animations.length < 1)) throw new Error('animation=true requires a real skin and animation clip');
    if (art) validateModelInspection(spec, art, result);
    const id = randomUUID();
    // Project id is hashed; arbitrary tool/project strings can never select storage paths.
    await mkdir(ledgerDir, { recursive: true });
    const staging = join(ledgerDir, `${id}.glb`);
    await writeFile(staging, result.glb, { flag: 'wx' });
    const [imported] = await this.assets.importFiles(input.project.id, input.project.root, [staging]);
    if (!imported) throw new Error('Model import failed');
    const evidencePath = `artifacts/model3d/${id}`;
    await safeDirectory(input.project.root, evidencePath);
    const evidence: Record<string, string> = {};
    for (const [name, bytes] of Object.entries({ 'reference' : reference, 'source.mjs': source,
      'front.png': result.views.front, 'side.png': result.views.side, 'back.png': result.views.back, ...(result.views.perspective ? { 'perspective.png': result.views.perspective } : {}) })) {
      const file = name === 'reference' ? `reference.${image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType === 'image/webp' ? 'webp' : 'png'}` : name;
      const path = `${evidencePath}/${file}`;
      await writeFile(join(input.project.root, path), bytes, { flag: 'wx' });
      evidence[path] = hash(bytes);
    }
    const record = { version: 2, id, inputHash, durationMs: Date.now() - started, createdAt: new Date().toISOString(), specPath, specHash: hash(specBytes), referencePath, referenceHash: hash(reference), sourcePath, sourceHash: hash(source),
      ...(artBytes ? { artBiblePath: spec.artBiblePath, artBibleHash: hash(artBytes) } : {}), inspection: result.inspection ?? null,
      assetPath: imported.relativePath, assetHash: imported.sha256, evidence, triangles: result.triangles,
      meshes: result.meshes, skins: result.skins, animations: result.animations, visualReview: 'pending' };
    await writeFile(join(ledgerDir, `${id}.json`), JSON.stringify(record, null, 2), { flag: 'wx' });
    await writeFile(join(ledgerDir, `latest-${hash(sourcePath)}.json`), JSON.stringify({ id }));
    const asset = await this.assets.registerExisting({ projectId: input.project.id, root: input.project.root,
      relativePath: imported.relativePath, name: input.name, source: 'procedural', provider: 'Noobi:Image-guided Three.js',
      metadata: { route: 'image-threejs', generator: 'image-threejs-v1', referenceImage: referencePath,
        referenceSha256: hash(reference), sourcePath, sourceSha256: hash(source), specPath, evidenceId: id, evidencePath,
        triangleCount: result.triangles, rigged: result.skins > 0, animations: result.animations.join(','),
        assetSpecVersion: spec.version ?? 1, assemblyCheck: art ? 'measured-contract-passed-runtime-pending' : 'legacy-unverified',
        ...(artBytes ? { artBibleSha256: hash(artBytes) } : {}),
        durationMs: Date.now() - started,
        visualReview: 'pending', approximation: 'Single-image reconstruction; hidden surfaces are inferred' } });
    return modelResult(asset);
  }

  async verify(project: { id: string; root: string }, assets: GameAssetRecord[]): Promise<string[]> {
    const findings: string[] = [];
    const directory = join(this.storage, hash(project.id));
    const pointers = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const covered = new Set<string>();
    for (const file of pointers.filter(name => /^latest-[a-f0-9]{64}\.json$/u.test(name))) {
      let label = '参考模型';
      try {
        const { id } = JSON.parse(await readFile(join(directory, file), 'utf8'));
        if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('missing evidence id');
        const record = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
        label = record.sourcePath;
        const asset = assets.find(a => a.relativePath === record.assetPath);
        if (!asset || record.assetHash !== asset.sha256) throw new Error('model missing or changed');
        covered.add(record.sourcePath);
        for (const [path, expected] of Object.entries({ [record.referencePath]: record.referenceHash,
          [record.sourcePath]: record.sourceHash, [record.specPath]: record.specHash, [record.assetPath]: record.assetHash,
          ...(record.artBiblePath ? { [record.artBiblePath]: record.artBibleHash } : {}), ...record.evidence })) {
          if (hash(await readProjectBytes(project.root, path, 16 * 1024 * 1024)) !== expected) throw new Error('source, reference or evidence changed');
        }
      } catch { findings.push(`MODEL_REFERENCE: ${label} 的模型、参考图、源码或多角度证据缺失/已变化；重新运行 noobi_model3d_generate。`); }
    }
    for (const asset of assets.filter(a => a.kind === 'model3d' && a.metadata?.route === 'image-threejs')) {
      try {
        const id = String(asset.metadata?.evidenceId ?? '');
        if (!/^[a-f0-9-]{36}$/u.test(id)) throw new Error('Missing evidence');
        const record = JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
        if (record.assetPath !== asset.relativePath || record.assetHash !== asset.sha256 || !covered.has(record.sourcePath)) throw new Error('Unbound evidence');
      } catch { findings.push(`MODEL_REFERENCE: ${asset.name} 缺少宿主生成证据。`); }
    }
    return findings;
  }
}

function modelResult(asset: GameAssetRecord): MediaGenerationAssetResult {
  return { outcome: 'asset', asset, provider: { id: 'builtin-image-threejs', presetId: 'image-threejs',
    displayName: '图片参考 → Three.js 建模', model: 'image-threejs-v1', route: 'image-threejs' } };
}

export async function readProjectBytes(root: string, path: string, max: number): Promise<Buffer> {
  if (isAbsolute(path) || path.includes('\\') || path.split('/').some(p => p === '..' || p === '.' || !p)) throw new Error('Invalid project-relative path');
  const canonical = await realpath(root), resolved = await realpath(join(canonical, path));
  const rel = relative(canonical, resolved);
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new Error('Path leaves project');
  const file = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > max) throw new Error('File exceeds input budget');
    return await file.readFile();
  } finally { await file.close(); }
}

async function safeDirectory(root: string, path: string): Promise<void> {
  const canonical = await realpath(root);
  let current = canonical;
  for (const part of path.split('/')) {
    current = join(current, part);
    await mkdir(current).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
    if (await realpath(current) !== current) throw new Error('Evidence directory must not contain symlinks');
  }
}

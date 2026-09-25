import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VisualReferenceStore, referenceDimensions, validateReferenceSpec } from './visualReferenceStore.js';
import { encodePngRgba } from './projectIcon.js';
import { turnInputs } from './turnInputs.js';
import { readVisualEvidence, retainVisualEvidence, writeProjectReference } from './visualEvidence.js';
import { PlanStore } from './planStore.js';
import { PlanService } from './planService.js';
import type { PlanDraft } from '../shared/planning.js';
import type { GameplayExperienceReport } from '../shared/contracts.js';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const png = encodePngRgba(64, 48, new Uint8Array(64 * 48 * 4).fill(120));
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-reference-')); dirs.push(root);
  const store = new VisualReferenceStore(join(root, 'cache'), bytes => ({ png: bytes, thumbnail: bytes }));
  const [record] = await store.import([{ name: 'reference.png', dataBase64: png.toString('base64') }]);
  return { root, store, record: record! };
}
describe('independent visual references and real image inputs', () => {
  it('checks signatures, dimensions and upload limits before decoding', async () => {
    const { root } = await setup(); const decode = vi.fn(bytes => ({ png: bytes, thumbnail: bytes }));
    const store = new VisualReferenceStore(join(root, 'other'), decode);
    expect(referenceDimensions(png, 'scene.png')).toEqual({ width: 64, height: 48 });
    expect(() => referenceDimensions(png, 'fake.jpg')).toThrow();
    const bomb = Buffer.from(png); bomb.writeUInt32BE(50000, 16);
    for (const input of [{ name: 'fake.jpg', dataBase64: png.toString('base64') }, { name: '../escape.png', dataBase64: png.toString('base64') }, { name: 'bomb.png', dataBase64: bomb.toString('base64') }]) await expect(store.import([input])).rejects.toThrow();
    await expect(store.import(Array(6).fill({ name: 'x.png', dataBase64: png.toString('base64') }))).rejects.toThrow('1–5');
    const oversized = Buffer.concat([png, Buffer.alloc(12 * 1024 ** 2)]).toString('base64');
    await expect(store.import([{ name: 'large.png', dataBase64: oversized }])).rejects.toThrow();
    const large = Buffer.concat([png, Buffer.alloc(11 * 1024 ** 2)]).toString('base64');
    await expect(store.import(Array(3).fill({ name: 'large.png', dataBase64: large }))).rejects.toThrow('总量');
    expect(decode).not.toHaveBeenCalled();
  });
  it('persists hashes and stable IDs without a production-asset ledger; rejects tampered cache', async () => {
    const { root, store, record } = await setup();
    const [duplicate] = await store.import([{ name: 'same.png', dataBase64: png.toString('base64') }]);
    expect(duplicate!.id).toBe(record.id); expect(await store.get(record.id)).toEqual(record);
    await expect(store.resolve('../elsewhere')).rejects.toThrow('ID');
    await expect(readFile(join(root, 'public/assets/asset-pack.json'))).rejects.toThrow();
    await writeFile(await store.resolve(record.id), 'tampered'); await expect(store.get(record.id)).rejects.toThrow('变化');
  });
  it('rejects a reference cache symlink and protects existing project reference files', async () => {
    const { root, store, record } = await setup(); const image = await store.resolve(record.id);
    await rm(image); await symlink(join(root, 'outside.png'), image); await writeFile(join(root, 'outside.png'), png);
    await expect(store.get(record.id)).rejects.toThrow('路径');
    const game = join(root, 'game'); await mkdir(game); await writeProjectReference(game, record.id, png); await writeProjectReference(game, record.id, png);
    await expect(writeProjectReference(game, record.id, Buffer.from('changed'))).rejects.toThrow('冲突');
    const bad = join(root, 'bad'); await mkdir(bad); await symlink(root, join(bad, 'references'));
    await expect(writeProjectReference(bad, record.id, png)).rejects.toThrow('不安全');
  });
  it('puts images in protocol items, never just filenames in the prompt', () => {
    expect(turnInputs('look at this', ['/tmp/reference.png'], [{ name: 'skill', path: '/tmp/SKILL.md' }])).toEqual([{ type: 'text', text: 'look at this', text_elements: [] }, { type: 'localImage', path: '/tmp/reference.png' }, { type: 'skill', name: 'skill', path: '/tmp/SKILL.md' }]);
    expect(() => turnInputs('x', ['relative.png'])).toThrow(); expect(() => turnInputs('x', Array(11).fill('/tmp/image.png'))).toThrow();
  });
  it('keeps screenshot bytes bound to the report after workspace images change', async () => {
    const { root } = await setup(); const project = join(root, 'game'), directory = join(root, 'private-build');
    const path = 'artifacts/playtest/latest/screenshots/start.png'; await mkdir(join(project, 'artifacts/playtest/latest/screenshots'), { recursive: true }); await writeFile(join(project, path), png);
    const report: GameplayExperienceReport = { version: 1, verdict: 'pass', score: 100, checkedAt: 'now', reportPath: 'artifacts/playtest/latest/report.json', checks: [], build: { buildId: 'build', sourceHash: 'source', artifactHash: 'artifact', testSuiteVersion: 'v1' }, screenshots: { before: path, idle: null, after: path, action: [path] } };
    await retainVisualEvidence(directory, project, report); await writeFile(join(project, path), 'altered after playtest');
    const evidence = await readVisualEvidence(directory, report); expect(await readFile(evidence.paths[0]!)).toEqual(png); expect(evidence.context).toContain('构建 build');
    await expect(readVisualEvidence(directory, { ...report, checkedAt: 'different' })).rejects.toThrow('不匹配');
    await writeFile(evidence.paths[0]!, 'modified private image'); await expect(readVisualEvidence(directory, report)).rejects.toThrow('变化');
  });
  it('sends verified images to planning and preserves a corrected interpretation through regeneration', async () => {
    const { root, store, record } = await setup(); const plans = new PlanStore(join(root, 'plans.json')); await plans.init();
    const references = [{ id: record.id, purpose: 'style' as const }];
    let draft = await plans.create({ request: '3D 单岛游戏', references });
    const spec = { style: '粉彩', camera: '俯视', scene: '一座岛', ui: '没有明确游戏界面', facts: [{ referenceId: record.id, observation: '浅色背景' }], inferences: ['可设计探索玩法'], unknowns: ['图中不能确认控制按键'] };
    const result = { options: [1, 2].map(i => ({ title: `路线${i}`, approach: `不同路线${i}`, engine: 'godot', dimension: '3d', platform: 'web', coreLoop: ['开始', `路线${i}`, '终点'], features: ['角色', '场景', '终点'], assumptions: ['单人'], exclusions: ['联机'], requirementIds: ['R001'], estimate: { timeRange: null, costRange: null, basis: '未知' } })), referenceSpec: spec };
    const runtime = { startThread: vi.fn(async () => 'thread'), unsubscribeThread: vi.fn(async () => {}), runTurn: vi.fn(async (_options: unknown) => ({ status: 'completed', turnId: 'turn', raw: {}, text: JSON.stringify(result) })) };
    const context = async (_draft: PlanDraft) => ({ cwd: root, godotAvailable: true, visualReferences: [{ record, selection: references[0]!, path: await store.resolve(record.id) }] });
    await new PlanService(plans, runtime, context).generate(draft); draft = await plans.get(draft.id);
    expect(draft.status).toBe('ready'); expect((runtime.runTurn.mock.calls[0]![0] as any).imagePaths).toEqual([await store.resolve(record.id)]);
    expect(draft.version!.visualInputs![0]!.normalizedHash).toBe(record.normalizedHash);
    draft = await plans.saveReferenceSpec({ draftId: draft.id, versionId: draft.version!.id, spec: { ...spec, style: '用户修正为冷色' } });
    expect(draft.version!.requiresReview).toBe(true);
    result.referenceSpec = { ...spec, style: '用户修正为冷色' };
    draft = await plans.retry(draft.id); await new PlanService(plans, runtime, context).generate(draft); draft = await plans.get(draft.id);
    expect(draft.version!.referenceSpec!.style).toBe('用户修正为冷色'); expect(draft.version!.referenceSpecAuthor).toBe('user');
    expect(() => validateReferenceSpec({ ...spec, facts: [{ referenceId: 'unknown', observation: '伪造来源' }] }, references)).toThrow('未知');
    expect(() => validateReferenceSpec({ ...spec, inferences: Array(12).fill('长'.repeat(1900)) }, references)).toThrow('总量');
  });
  it('fails rather than pretending a missing image was analyzed', async () => {
    const { root, record } = await setup(); const plans = new PlanStore(join(root, 'plans.json')); await plans.init();
    const draft = await plans.create({ request: '看图制作', references: [{ id: record.id, purpose: 'layout' }] });
    const runtime = { startThread: vi.fn(), unsubscribeThread: vi.fn(), runTurn: vi.fn() };
    await new PlanService(plans, runtime, async () => ({ cwd: root, godotAvailable: true })).generate(draft);
    expect((await plans.get(draft.id)).error).toContain('不能退回纯文字'); expect(runtime.runTurn).not.toHaveBeenCalled();
  });
});

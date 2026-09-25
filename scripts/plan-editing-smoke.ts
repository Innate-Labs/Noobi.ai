import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { PlanStore } from '../src/main/planStore.js';
import { PlanService } from '../src/main/planService.js';
import { prepareSmokeHome } from './smokeHome.js';

// Real model calls, isolated persistence; never starts production or writes a game.
const output = resolve('.noobi-private/stage-02/real-editing');
await mkdir(output, { recursive: true });
const home = await prepareSmokeHome();
const runtime = new CodexAppServer({ codexHome: home.path });
const evidence: unknown[] = [];
runtime.on('serverRequest', (request: { id: string | number; method: string }) => {
  if (request.method === 'item/permissions/requestApproval') runtime.respondToServerRequest(request.id, { scope: 'turn', permissions: {} });
  else if (request.method === 'item/tool/requestUserInput') runtime.respondToServerRequest(request.id, { answers: {} });
  else runtime.respondToServerRequest(request.id, { decision: 'decline', action: 'decline' });
});
try {
  const status = await runtime.start();
  assert(status.account, 'Codex authentication required');
  const model = status.models.find(m => m.isDefault) ?? status.models[0]!;
  const file = join(output, 'production-plans.json');
  const store = new PlanStore(file); await store.init();
  const service = new PlanService(store, runtime, async () => ({ cwd: output, godotAvailable: true }));
  const prior = process.env.NOOBI_PLAN_EDITING_REUSE === '1' ? (await store.list()).findLast(d => d.status === 'ready' && d.version?.options[0]?.title === '我的章鱼云岛' && !d.version.requiresReview) : null;
  let draft = prior ?? await store.create({ request: '制作单人离线 3D 浏览器探索游戏：一个小岛、小骑士、收集三颗珍珠后和青蛙商店兑换花蜜，再让花朵开放并获胜。必须有暂停与重开。粉彩童话美术。', model: model.model, effort: model.defaultEffort });
  if (!prior) {
  console.log(`Initial planning: ${model.model}`);
  await service.generate(draft); draft = await store.get(draft.id);
  assert.equal(draft.status, 'ready', draft.error ?? 'initial planning failed');
  evidence.push({ step: 'initial', version: draft.version });
  const first = draft.version!.options[0]!;
  draft = await store.saveEdits({ draftId: draft.id, versionId: draft.version!.id, option: { ...first, title: '我的章鱼云岛', design: { camera: '可旋转俯视镜头', regions: '一个主岛和一座桥', characters: '小骑士和青蛙店主', style: '粉彩紫色与薄荷绿', budget: '只做单岛；实际费用未知，不承诺金额' } }, locks: [] });
  assert(draft.version!.requiresReview);
  await assert.rejects(store.reserve({ draftId: draft.id, versionId: draft.version!.id, optionId: first.id }), /校验/);
  const reopened = new PlanStore(file); await reopened.init(); assert.deepEqual(await reopened.get(draft.id), draft);
  draft = await store.revise({ draftId: draft.id, versionId: draft.version!.id, instruction: '保持所有锁定内容，结合第二方案中适用的教学提示；不增加地图。', importedPlan: '目标提示要显示当前收集数量。胜利后支持重新开始。', mergeOptionId: draft.version!.options[1]!.id });
  console.log('Revising locked fields with imported plan');
  await service.generate(draft); draft = await store.get(draft.id);
  evidence.push({ step: 'revised', status: draft.status, error: draft.error, version: draft.version });
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  assert.equal(draft.status, 'ready', draft.error ?? 'revision failed');
  assert.equal(draft.version!.options[0]!.title, '我的章鱼云岛');
  assert.equal(draft.version!.options[0]!.design!.style, '粉彩紫色与薄荷绿');
  assert(!draft.version!.requiresReview);
  assert(draft.version!.requirements.some(r => r.source === 'import'));
  }
  const validated = draft.version!;
  evidence.push({ step: 'validated-revision', reusedActualResponse: Boolean(prior), version: validated });
  draft = await store.saveEdits({ draftId: draft.id, versionId: validated.id, option: { ...validated.options[0]!, features: validated.options[0]!.features.map((feature, i) => i ? feature : `${feature}；必须全程完全离线且与另一台电脑的玩家实时联网对战`) }, locks: draft.locks ?? [] });
  draft = await store.retry(draft.id);
  console.log('Checking conflicting offline/online requirements');
  await service.generate(draft); draft = await store.get(draft.id);
  evidence.push({ step: 'conflict', status: draft.status, error: draft.error });
  assert.equal(draft.status, 'failed', 'Contradictory manual edit must not be executable');
  assert.match(draft.error ?? '', /暂不支持此范围/);
  await assert.rejects(store.reserve({ draftId: draft.id, versionId: draft.version!.id, optionId: validated.options[0]!.id }));
  console.log('PLAN_EDITING_REAL_SMOKE_OK');
} finally {
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await runtime.stop(); await home.cleanup();
}

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { PlanStore } from '../src/main/planStore.js';
import { PlanService } from '../src/main/planService.js';
import type { VideoClip } from '../src/shared/videoReferences.js';
import { prepareSmokeHome } from './smokeHome.js';

const root = resolve(process.argv[2] ?? '.noobi-private/stage-04');
const clips = JSON.parse(await readFile(join(root, 'clips.json'), 'utf8')) as Array<{ mode: string; clip: VideoClip }>;
const output = join(root, 'planning'); await mkdir(output, { recursive: true });
const store = new PlanStore(join(output, 'plans.json')); await store.init();
const home = await prepareSmokeHome(), runtime = new CodexAppServer({ codexHome: home.path });
const runTurn = runtime.runTurn.bind(runtime);
runtime.runTurn = async input => {
  const response = await runTurn(input);
  await writeFile(join(output, `response-${response.turnId}.json`), JSON.stringify({ input: JSON.parse(input.prompt), response }, null, 2));
  return response;
};
runtime.on('serverRequest', (r: { id: string | number }) => runtime.respondToServerRequest(r.id, { decision: 'decline', action: 'decline' }));
try {
  const status = await runtime.start(); assert(status.account);
  const model = status.models.find(m => m.isDefault) ?? status.models[0]!;
  const service = new PlanService(store, runtime, async draft => {
    const clip = clips.find(item => item.clip.id === draft.video?.clipId)!.clip;
    return { cwd: output, godotAvailable: true, video: { clip, paths: clip.frames.map(f => join(root, 'images', `${f.referenceId}.png`)) } };
  });
  const results: unknown[] = [];
  let failures = 0;
  for (let index = 0; index < clips.length; index += 2) {
    const batch = await Promise.allSettled(clips.slice(index, index + 2).map(async item => {
      const request = '根据提供的游戏片段关键帧，区分可见状态变化、规则假设与未知项。保留翻滚和体力，改成探索。不能从画面断言确切按键或精确体力消耗公式。';
      const old = (await store.list()).find(d => d.request === request && d.video?.clipId === item.clip.id && d.status === 'ready');
      let draft = old ?? await store.create({ request, model: model.model, effort: model.defaultEffort, video: { clipId: item.clip.id, purpose: 'gameplay' } });
      if (!old) { console.log('VIDEO_PLAN_START', item.mode); await service.generate(draft); draft = await store.get(draft.id); }
      results.push({ mode: item.mode, draft }); await writeFile(join(output, 'evidence.json'), JSON.stringify(results, null, 2));
      assert.equal(draft.status, 'ready', `${item.mode}: ${draft.error}`);
      assert(draft.version?.videoSpec); assert.equal(draft.version.videoInput?.sourceHash, item.clip.source.sha256);
      console.log('VIDEO_PLAN_READY', item.mode, draft.version.analysisDurationMs);
    }));
    for (const result of batch) if (result.status === 'rejected') { failures++; console.error('VIDEO_PLAN_FAILED', result.reason); }
  }
  if (failures) throw new Error(`${failures} video planning cases failed; inspect preserved evidence`);
  console.log('VIDEO_PLAN_RESULTS_SAVED; semantic conclusions require inspection against fixture annotations');
} finally { await runtime.stop(); await home.cleanup(); }

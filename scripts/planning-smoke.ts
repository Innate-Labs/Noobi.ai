import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { PlanStore } from '../src/main/planStore.js';
import { PlanService } from '../src/main/planService.js';
import { PlanStarter } from '../src/main/planStarter.js';
import { ProjectStore } from '../src/main/projectStore.js';
import { GameHarness, GameHarnessStoppedError } from '../src/main/gameHarness.js';
import { GodotEnvironmentService } from '../src/main/godotEnvironmentService.js';
import { resolveRequiredImageGenerationSkill } from '../src/main/imageGenerationSkillPolicy.js';
import { prepareSmokeHome } from './smokeHome.js';

// Three real planning calls plus accepted real Harness planner turns.
// Stop after the server accepts the selected prompt: this verifies handoff, not game quality.
const output = resolve('.noobi-private/stage-01/real-planning');
await mkdir(output, { recursive: true });
const smokeHome = await prepareSmokeHome();
const runtime = new CodexAppServer({ codexHome: smokeHome.path });
const harness = new GameHarness(runtime);
const evidence: unknown[] = [];
runtime.on('serverRequest', (request: { id: string | number; method: string }) => {
  if (request.method === 'item/permissions/requestApproval') runtime.respondToServerRequest(request.id, { scope: 'turn', permissions: {} });
  else if (request.method === 'item/tool/requestUserInput') runtime.respondToServerRequest(request.id, { answers: {} });
  else runtime.respondToServerRequest(request.id, { decision: 'decline', action: 'decline' });
});
try {
  const status = await runtime.start();
  if (!status.account) throw new Error('真实规划验收需要已登录 Codex');
  const imageGenerationSkill = await resolveRequiredImageGenerationSkill(runtime, status);
  if (!imageGenerationSkill) throw new Error('真实 Harness 交接需要可用的 ImageGen Skill');
  const model = status.models.find(m => m.isDefault) ?? status.models[0]!;
  const store = new PlanStore(join(output, 'plans.json')); await store.init();
  const projects = new ProjectStore({ storageFile: join(output, 'projects.json'), defaultWorkspace: join(output, 'games') });
  await projects.init();
  const env = await new GodotEnvironmentService({ storageFile: join(output, 'godot.json') }).init();
  const cwd = join(output, 'read-only-context'); await mkdir(cwd, { recursive: true });
  const service = new PlanService(store, runtime, async () => ({ cwd, godotAvailable: env.canCreateProjects }));
  const inputs = JSON.parse(await readFile('benchmarks/planning/stage-01.json', 'utf8')) as Array<{ id: string; request: string }>;
  for (const input of inputs) {
    const draft = await store.create({ request: input.request, model: model.model, effort: model.efforts.includes('low') ? 'low' : model.defaultEffort });
    process.stdout.write(`Planning ${input.id} with ${model.model}\n`);
    const prior = process.env.NOOBI_PLANNING_REUSE === '1'
      ? (await store.list()).find(d => d.request === input.request && d.version && d.run?.status === 'failed') : null;
    if (prior?.version) {
      process.stdout.write(`Reusing actual model response ${prior.version.id}; prior failure was harness test configuration
`);
      await store.finish(draft.id, draft.attemptId, prior.version, null);
    } else await service.generate(draft);
    const ready = await store.get(draft.id);
    if (ready.status !== 'ready' || !ready.version) throw new Error(`${input.id}: ${ready.error}`);
    const option = ready.version.options[0]!;
    const selectedInput = { draftId: ready.id, versionId: ready.version.id, optionId: option.id };
    const events: Array<{ method: string; message: string }> = [];
    let dispatchedPrompt = '';
    let plannerTurnId: string | null = null;
    let projectId = '';
    const onEvent = (event: any) => {
      if (event.projectId !== projectId) return;
      events.push({ method: event.method, message: event.message });

    };
    harness.on('event', onEvent);
    const startTurn = runtime.startTurn.bind(runtime);
    runtime.startTurn = async options => {
      if (!options.prompt.includes(ready.version!.id) || !options.prompt.includes(option.title)) throw new Error('Harness did not forward the selected plan version');
      const turnId = await startTurn(options);
      plannerTurnId = turnId;
      setTimeout(() => void harness.stop(projectId), 500);
      return turnId;
    };
    const starter = new PlanStarter(store, {
      getProject: id => projects.get(id),
      prepare: async d => { const project = await projects.create({ name: `Stage 01 ${input.id}`, idea: d.request, parentDirectory: join(output, 'games'), engine: option.engine }); projectId = project.id; return project; },
      dispatch: async (project, approved) => {
        dispatchedPrompt = approved.run!.prompt;
        const timeout = setTimeout(() => void harness.stop(project.id), 120000);
        try {
          await harness.run({ projectId: project.id, cwd: project.root, prompt: dispatchedPrompt, model: ready.model, effort: ready.effort, imageGenerationSkill });
        } catch (error) { if (!(error instanceof GameHarnessStoppedError)) throw error; }
        finally { clearTimeout(timeout); }
        if (!plannerTurnId) throw new Error('Harness planner turn 未获服务端接受，不能声明交接通过');
        return project;
      },
    });
    try {
      await Promise.all([starter.start(selectedInput), starter.start(selectedInput)]);
      if (!dispatchedPrompt.includes(ready.version.id) || !dispatchedPrompt.includes(option.title)) throw new Error('Harness 没有收到选定版本');
      evidence.push({ inputId: input.id, draftId: ready.id, versionId: ready.version.id, model: ready.model, optionCount: ready.version.options.length,
        selectedTitle: option.title, threadId: ready.version.threadId, turnId: ready.version.turnId, analysisUsage: ready.version.analysisUsage,
        analysisDurationMs: ready.version.analysisDurationMs, plannerTurnId, plannerCompleted: false, stoppedAfterServerAcceptedPrompt: true, stoppedBeforeImplementation: true, events });
      await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
      process.stdout.write(`PASS ${input.id}: ${ready.version.options.length} plans; selected prompt accepted by real Harness planner turn; stopped before implementation\n`);
    } finally { runtime.startTurn = startTurn; harness.off('event', onEvent); await writeFile(join(output, `${input.id}-events.json`), JSON.stringify(events, null, 2)); }
  }
} finally {
  await runtime.stop(); await smokeHome.cleanup();
}

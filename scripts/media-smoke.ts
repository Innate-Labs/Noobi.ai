import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetStore } from '../src/main/assetStore.js';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { MEDIA_DYNAMIC_TOOLS, MediaToolBroker } from '../src/main/mediaToolBroker.js';
import { createWorkspaceTemplate } from '../src/main/workspaceTemplate.js';
import { prepareSmokeHome } from './smokeHome.js';

const workspace = await mkdtemp(join(tmpdir(), 'noobi-media-smoke-'));
const smokeHome = await prepareSmokeHome();
const runtime = new CodexAppServer({ codexHome: smokeHome.path });
const assetStore = new AssetStore();
let threadId: string | null = null;
let dynamicCalls = 0;

const broker = new MediaToolBroker({
  server: runtime,
  assetStore,
  resolveProject: async (candidateThreadId) =>
    candidateThreadId === threadId ? { id: 'media-smoke', root: workspace } : null,
});

runtime.on('serverRequest', (request) => {
  if (broker.handle(request)) {
    dynamicCalls += 1;
    return;
  }
  runtime.rejectServerRequest(request.id, -32601, `Unsupported smoke request: ${request.method}`);
});

try {
  await createWorkspaceTemplate(workspace, {
    id: 'media-smoke',
    name: 'Media Smoke',
    idea: 'Verify Noobi dynamic media tools through the real Codex App Server.',
    createdAt: new Date().toISOString(),
    model: null,
  });
  const status = await runtime.start();
  if (!status.account) throw new Error('Codex is not signed in.');
  const model = status.models.find((candidate) => candidate.isDefault) ?? status.models[0];
  if (!model) throw new Error('Codex App Server returned no usable models.');

  threadId = await runtime.startThread({
    cwd: workspace,
    model: model.model,
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    ephemeral: true,
    dynamicTools: MEDIA_DYNAMIC_TOOLS,
    developerInstructions:
      'This is an automated Noobi media tool test. Use the provided dynamic tool exactly as requested. Do not run shell commands or edit files directly.',
  });
  const result = await runtime.runTurn({
    threadId,
    cwd: workspace,
    model: model.model,
    effort: model.efforts.includes('low') ? 'low' : model.defaultEffort,
    approvalPolicy: 'never',
    prompt:
      'Call noobi_audio_synthesize exactly once with name media_smoke, preset pickup, durationSeconds 0.1, and seed 23. Then reply only with the returned relativePath.',
  });

  const assets = await assetStore.list('media-smoke', workspace);
  const audio = assets.find((asset) => asset.relativePath === 'public/assets/audio/media_smoke.wav');
  if (!audio || audio.kind !== 'audio' || audio.source !== 'procedural') {
    throw new Error('The dynamic audio tool did not register its WAV asset.');
  }
  if (dynamicCalls !== 1) throw new Error(`Expected one dynamic tool call, received ${dynamicCalls}.`);
  if (result.status !== 'completed') throw new Error(`Media smoke turn ended with ${result.status}.`);

  process.stdout.write(
    `Noobi media smoke passed: ${model.displayName}; ${audio.relativePath}; ${audio.size} bytes\n`,
  );
} finally {
  await runtime.stop().catch(() => undefined);
  await rm(workspace, { recursive: true, force: true });
  await smokeHome.cleanup();
}

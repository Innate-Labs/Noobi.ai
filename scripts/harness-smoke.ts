import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AssetStore } from '../src/main/assetStore.js';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { GameHarness } from '../src/main/gameHarness.js';
import { ImageGenerationAttestationStore } from '../src/main/imageGenerationAttestation.js';
import { createWorkspaceTemplate } from '../src/main/workspaceTemplate.js';
import { prepareSmokeHome } from './smokeHome.js';

const workspace = await mkdtemp(join(tmpdir(), 'noobi-harness-smoke-'));
const smokeHome = await prepareSmokeHome();
const runtime = new CodexAppServer({ codexHome: smokeHome.path });
const harness = new GameHarness(runtime);
const assetStore = new AssetStore();
const imageAttestations = new ImageGenerationAttestationStore(
  join(smokeHome.path, 'image-generation-attestations.json'),
);
const phases: string[] = [];
const imageIngestions: Promise<void>[] = [];

harness.on('state', (event: { state: string; phase: string | null }) => {
  const value = `${event.state}:${event.phase ?? 'terminal'}`;
  if (phases.at(-1) !== value) phases.push(value);
});
runtime.on('serverRequest', (request: { id: string | number; method: string }) => {
  if (
    request.method === 'item/commandExecution/requestApproval' ||
    request.method === 'item/fileChange/requestApproval'
  ) {
    runtime.respondToServerRequest(request.id, { decision: 'accept' });
  } else if (request.method === 'item/permissions/requestApproval') {
    runtime.respondToServerRequest(request.id, { scope: 'turn', permissions: {} });
  } else if (request.method === 'item/tool/requestUserInput') {
    runtime.respondToServerRequest(request.id, { answers: {} });
  } else {
    runtime.respondToServerRequest(request.id, { action: 'decline', content: null });
  }
});
runtime.on('notification', (notification: { method: string; params?: unknown }) => {
  if (notification.method !== 'item/completed') return;
  const item = asRecord(asRecord(notification.params)?.item);
  if (item?.type !== 'imageGeneration' || item.status !== 'completed') return;
  if (typeof item.savedPath !== 'string') return;
  const task = assetStore.ingestGeneratedImage({
    projectId: 'harness-smoke',
    root: workspace,
    sourcePath: item.savedPath,
    provider: 'codex-imagegen',
  }).then(async (asset) => {
    await imageAttestations.record({
      projectId: 'harness-smoke',
      relativePath: asset.relativePath,
      sha256: asset.sha256,
    });
  });
  imageIngestions.push(task);
});

try {
  await createWorkspaceTemplate(workspace, {
    id: 'harness-smoke',
    name: 'Harness Smoke',
    idea: 'A temporary project used only to prove the Noobi host harness end to end.',
    createdAt: new Date().toISOString(),
    model: null,
  });
  await imageAttestations.init();
  const status = await runtime.start();
  if (!status.account) throw new Error('Codex is not signed in.');
  if (!status.capabilities.imageGeneration) {
    throw new Error('The active Codex provider does not advertise image generation.');
  }
  const model = status.models.find((candidate) => candidate.isDefault) ?? status.models[0];
  if (!model) throw new Error('Codex App Server returned no usable models.');
  const imageGenerationSkillPath = await realpath(
    join(smokeHome.path, 'skills', '.system', 'imagegen', 'SKILL.md'),
  );
  if (!(await stat(imageGenerationSkillPath)).isFile()) {
    throw new Error('The imagegen system skill was not installed.');
  }

  const result = await harness.run({
    projectId: 'harness-smoke',
    cwd: workspace,
    model: model.model,
    effort: model.efforts.includes('low') ? 'low' : model.defaultEffort,
    prompt:
      'Perform one bounded full game-harness integration check. Generate one simple cyan energy-pickup image, ingest and visibly use it in the starter game, then create harness-smoke.txt with exact contents NOOBI_GAME_HARNESS_OK and no trailing newline. Run the production build and verify the asset path resolves.',
    imageGenerationSkill: { name: 'imagegen', path: imageGenerationSkillPath },
  });
  await Promise.all(imageIngestions);
  const artifact = await readFile(join(workspace, 'harness-smoke.txt'), 'utf8');
  if (artifact !== 'NOOBI_GAME_HARNESS_OK') {
    throw new Error(`Harness artifact did not match: ${JSON.stringify(artifact)}`);
  }
  if (!result.threadId || result.implementation.status !== 'completed') {
    throw new Error('Harness did not return a durable completed Implementer thread.');
  }
  if (!phases.includes('running:planner') || !phases.includes('running:reviewer')) {
    throw new Error(`Harness skipped an expected role: ${phases.join(', ')}`);
  }
  const assets = await assetStore.list('harness-smoke', workspace);
  const imageVerification = await imageAttestations.verify({
    projectId: 'harness-smoke',
    root: workspace,
    assets,
  });
  if (!imageVerification.ok) {
    throw new Error(`Harness ImageGen attestation failed: ${imageVerification.reason}.`);
  }

  process.stdout.write(
    `Noobi harness smoke passed: ${model.displayName}; review=${result.review.verdict}; repair=${result.repaired}; phases=${phases.join('>')}\n`,
  );
} finally {
  await runtime.stop().catch(() => undefined);
  await rm(workspace, { recursive: true, force: true });
  await smokeHome.cleanup();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

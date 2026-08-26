import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { AssetStore } from '../src/main/assetStore.js';
import { CodexAppServer } from '../src/main/codexAppServer.js';
import { createWorkspaceTemplate } from '../src/main/workspaceTemplate.js';
import { prepareSmokeHome } from './smokeHome.js';

const workspace = await mkdtemp(join(tmpdir(), 'noobi-image-smoke-'));
const smokeHome = await prepareSmokeHome();
const runtime = new CodexAppServer({ codexHome: smokeHome.path });
const assetStore = new AssetStore();
let savedPath: string | null = null;
let revisedPrompt: string | undefined;

runtime.on('serverRequest', (request) => {
  runtime.rejectServerRequest(request.id, -32601, `Unsupported image smoke request: ${request.method}`);
});
runtime.on('notification', (notification: { method: string; params?: unknown }) => {
  if (notification.method !== 'item/completed') return;
  const item = asRecord(asRecord(notification.params)?.item);
  if (item?.type !== 'imageGeneration' || item.status !== 'completed') return;
  if (typeof item.savedPath === 'string') savedPath = item.savedPath;
  if (typeof item.revisedPrompt === 'string') revisedPrompt = item.revisedPrompt;
});

try {
  await createWorkspaceTemplate(workspace, {
    id: 'image-smoke',
    name: 'Image Smoke',
    idea: 'Verify Codex ImageGen and Noobi workspace ingestion end to end.',
    createdAt: new Date().toISOString(),
    model: null,
  });
  const status = await runtime.start();
  if (!status.account) throw new Error('Codex is not signed in.');
  if (!status.capabilities.imageGeneration) {
    throw new Error('The active Codex provider does not advertise image generation.');
  }
  const model = status.models.find((candidate) => candidate.isDefault) ?? status.models[0];
  if (!model) throw new Error('Codex App Server returned no usable models.');
  const skillPath = await realpath(join(smokeHome.path, 'skills', '.system', 'imagegen', 'SKILL.md'));
  if (!(await stat(skillPath)).isFile()) throw new Error('The imagegen system skill was not installed.');

  const threadId = await runtime.startThread({
    cwd: workspace,
    model: model.model,
    sandbox: 'workspace-write',
    approvalPolicy: 'never',
    ephemeral: true,
    developerInstructions:
      'This is an automated asset smoke test. Generate exactly one image with the attached imagegen skill. Do not use shell commands or other tools.',
  });
  const result = await runtime.runTurn({
    threadId,
    cwd: workspace,
    model: model.model,
    effort: model.efforts.includes('low') ? 'low' : model.defaultEffort,
    approvalPolicy: 'never',
    skills: [{ name: 'imagegen', path: skillPath }],
    prompt:
      'Use imagegen to create exactly one 1024x1024 transparent PNG game asset: a simple glowing cyan energy pickup, centered, no text, no border, clean readable silhouette. Reply briefly after generation.',
  });
  if (result.status !== 'completed') throw new Error(`Image smoke turn ended with ${result.status}.`);
  if (!savedPath) throw new Error('Codex completed without a saved imageGeneration path.');

  const [home, source] = await Promise.all([realpath(smokeHome.path), realpath(savedPath)]);
  const fromHome = relative(home, source);
  if (!fromHome || fromHome === '..' || fromHome.startsWith(`..${sep}`) || isAbsolute(fromHome)) {
    throw new Error('Codex image output escaped the isolated smoke home.');
  }
  const asset = await assetStore.ingestGeneratedImage({
    projectId: 'image-smoke',
    root: workspace,
    sourcePath: source,
    prompt: revisedPrompt,
    provider: 'codex-imagegen',
  });
  if (asset.kind !== 'image' || asset.source !== 'generated') {
    throw new Error('Noobi did not ingest the generated image as a project asset.');
  }

  process.stdout.write(
    `Noobi ImageGen smoke passed: ${model.displayName}; ${asset.relativePath}; ${asset.size} bytes\n`,
  );
} finally {
  await runtime.stop().catch(() => undefined);
  await rm(workspace, { recursive: true, force: true });
  await smokeHome.cleanup();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

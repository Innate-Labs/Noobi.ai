import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { GodotEnvironmentService } from '../src/main/godotEnvironmentService.js';
import { PreviewServer } from '../src/main/previewServer.js';
import { ProjectStore } from '../src/main/projectStore.js';

const root = await mkdtemp(join(tmpdir(), 'noobi-godot-smoke-'));

try {
  const environment = new GodotEnvironmentService({
    storageFile: join(root, 'godot-environment.json'),
  });
  const status = await environment.init();
  if (!status.canCreateProjects || !status.tool.binaryPath) {
    throw new Error(status.tool.message);
  }
  if (!status.canExportProjects || !status.exportTemplates.targets.web) {
    throw new Error(status.exportTemplates.issues.join(' ') || 'Godot Web export templates are missing.');
  }

  const store = new ProjectStore({
    storageFile: join(root, 'projects.json'),
    defaultWorkspace: join(root, 'games'),
  });
  const project = await store.create({
    name: 'Noobi Godot Smoke',
    idea: 'Verify the real Noobi Godot starter, validation, and Web export pipeline.',
    parentDirectory: join(root, 'games'),
    model: null,
    engine: 'godot',
    targetFrameRate: 60,
  });

  const imported = await environment.execute({
    kind: 'import',
    projectPath: project.root,
  });
  requirePass('import', imported);

  const validated = await environment.execute({
    kind: 'validate',
    projectPath: project.root,
  });
  requirePass('validate', validated);

  const outputPath = join(project.root, 'build', 'web', 'index.html');
  await mkdir(dirname(outputPath), { recursive: true });
  const exported = await environment.execute({
    kind: 'export',
    projectPath: project.root,
    preset: 'Web',
    outputPath,
  });
  requirePass('export', exported);
  const exportedHtml = await readFile(outputPath, 'utf8');
  if (!exportedHtml.includes('show-image--false') || exportedHtml.includes('show-image--true')) {
    throw new Error('Godot Web export still exposes the default engine boot splash.');
  }
  if (exportedHtml.includes('-gd-engine-icon') || exportedHtml.includes('apple-touch-icon')) {
    throw new Error('Godot Web export still exposes the default engine icon.');
  }

  const preview = new PreviewServer();
  try {
    const previewUrl = await preview.start(project.id, project.root, {
      directory: 'build/web',
      sourceFallback: false,
    });
    const buildBaseUrl = new URL(previewUrl);
    await requireHttp('preview HTML', buildBaseUrl);
    await requireHttp('preview WASM', new URL('index.wasm', buildBaseUrl), 'application/wasm');
    await requireHttp('preview PCK', new URL('index.pck', buildBaseUrl), 'application/octet-stream');
  } finally {
    await preview.stopAll();
  }

  process.stdout.write(
    [
      'Noobi Godot smoke passed',
      'engine=' + status.tool.version,
      'project=' + project.engine,
      'artifacts=' + exported.artifacts.length,
      'engine-branding=hidden',
      'preview=pass',
    ].join('; ') + '\n',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

async function requireHttp(label: string, url: URL, contentType?: string): Promise<void> {
  const response = await fetch(url, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}`);
  }
  if (contentType && !response.headers.get('content-type')?.startsWith(contentType)) {
    throw new Error(`${label} returned ${response.headers.get('content-type') ?? 'no content type'}`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new Error(`${label} returned an empty artifact`);
  }
}

function requirePass(
  label: string,
  result: Awaited<ReturnType<GodotEnvironmentService['execute']>>,
): void {
  if (result.ok) return;
  const output = (result.stderr + '\n' + result.stdout).trim().slice(0, 2_000);
  throw new Error('Godot ' + label + ' failed: ' + output);
}

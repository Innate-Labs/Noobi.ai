import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GodotEnvironmentService, GodotHeadlessResult } from '../godotEnvironmentService.js';
import type { GodotBuild, GodotBuildStore } from './godotBuildStore.js';
import { installGodotRuntimeProbe } from '../runtime/godotRuntimeProbe.js';
import type { GameQualitySpec } from './gameQualitySpec.js';
import { PRESENTATION_KIT } from '../runtime/presentationKit.js';

export async function buildGodotCandidate(input: {
  projectId: string; projectRoot: string; store: GodotBuildStore;
  environment: GodotEnvironmentService; signal?: AbortSignal;
  qualitySpec?: GameQualitySpec;
}): Promise<GodotBuild> {
  const { store, environment, signal } = input;
  signal?.throwIfAborted();
  const status = await environment.getStatus();
  if (!status.canExportProjects) throw new Error('Godot 与匹配的 Web 导出模板未就绪');
  const build = await store.create(input.projectId, input.projectRoot,
    status.tool.version ?? 'unknown', status.exportTemplates.expectedVersion ?? 'unknown', signal);
  try {
    if (input.qualitySpec) build.record.qualitySpec = structuredClone(input.qualitySpec);
    const derived = await installGodotRuntimeProbe(build.root, build.record.buildId);
    await mkdir(join(build.root, 'runtime/noobi'), { recursive: true });
    const kitPath = 'runtime/noobi/presentation_v1.gd';
    try {
      await writeFile(join(build.root, kitPath), PRESENTATION_KIT, { flag: 'wx' });
      derived.push(kitPath);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    await store.recordInstrumentation(build, derived);
    for (const kind of ['import', 'validate', 'runtime'] as const) {
      const result = await environment.execute({ kind, projectPath: build.root }, signal);
      await writeFile(join(build.root, '..', `${kind}.json`), JSON.stringify(result, null, 2));
      assertTask(result, build.root);
    }
    await mkdir(join(build.root, 'build/web'), { recursive: true });
    const exported = await environment.execute({ kind: 'export', projectPath: build.root,
      preset: 'Web', outputPath: join(build.root, 'build/web/index.html') }, signal);
    await writeFile(join(build.root, '..', 'export.json'), JSON.stringify(exported, null, 2));
    assertTask(exported, build.root);
    await store.publish(build, signal);
    return build;
  } catch (error) {
    await store.fail(build, error);
    throw error;
  }
}

function assertTask(result: GodotHeadlessResult, root: string): void {
  if (result.ok) return;
  const labels = { import: '资源导入', validate: '静态检查', runtime: '主场景运行', export: 'Web 导出' };
  throw new Error(`Godot ${labels[result.task]}失败${result.timedOut ? '（超时）' : ''}：`
    + `${result.stderr}\n${result.stdout}`.replaceAll(root, '<snapshot>').trim().slice(0, 2400));
}

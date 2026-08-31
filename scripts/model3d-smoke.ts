import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { AssetStore } from '../src/main/assetStore.js';
import { GodotEnvironmentService } from '../src/main/godotEnvironmentService.js';
import { MediaGenerationService } from '../src/main/mediaGenerationService.js';

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'noobi-model3d-smoke-'));

try {
  const assetStore = new AssetStore();
  const media = new MediaGenerationService({
    providerStore: { withActiveProvider: async () => null } as never,
    assetStore,
  });
  const generated = await media.generate({
    project: { id: 'model3d-smoke', root },
    kind: 'model3d',
    name: 'noobi_smoke_character',
    prompt: 'Low-poly game character with readable arms and legs',
    options: { animation: true },
  });
  if (generated.outcome !== 'asset') throw new Error('3D fallback did not return an asset');
  if (generated.provider.route !== 'threejs-fallback') throw new Error('3D fallback route was not reported');

  await writeFile(join(root, 'project.godot'), `[application]
config/name="Noobi Model3D Smoke"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`, 'utf8');
  const resourcePath = `res://${generated.asset.relativePath}`;
  await writeFile(join(root, 'verify_model.gd'), godotVerifier(resourcePath), 'utf8');

  const environment = new GodotEnvironmentService({ storageFile: join(root, 'godot-environment.json') });
  const status = await environment.init();
  if (!status.tool.binaryPath) throw new Error(status.tool.message);
  const imported = await environment.execute({ kind: 'import', projectPath: root });
  if (!imported.ok) throw new Error(`Godot import failed: ${(imported.stderr + imported.stdout).slice(0, 2_000)}`);

  const verified = await execute(status.tool.binaryPath, [
    '--headless',
    '--path', root,
    '--script', 'res://verify_model.gd',
  ], {
    cwd: root,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = `${verified.stdout}\n${verified.stderr}`;
  if (!output.includes('NOOBI_MODEL3D_SMOKE_OK')) {
    throw new Error(`Godot did not confirm the model scene: ${output.slice(0, 2_000)}`);
  }

  process.stdout.write([
    'Noobi 3D route smoke passed',
    `engine=${status.tool.version}`,
    `route=${generated.provider.route}`,
    `asset=${generated.asset.relativePath}`,
    'mesh=pass',
    'skeleton=pass',
    'animations=idle,walk,run',
  ].join('; ') + '\n');
} finally {
  await rm(root, { recursive: true, force: true });
}

function godotVerifier(resourcePath: string): string {
  return `extends SceneTree

func _initialize() -> void:
    var packed := load(${JSON.stringify(resourcePath)}) as PackedScene
    if packed == null:
        push_error("GLB did not import as PackedScene")
        quit(2)
        return
    var instance := packed.instantiate()
    var state := {"meshes": 0, "skeletons": 0, "clips": {}}
    inspect_node(instance, state)
    instance.free()
    if state.meshes < 1:
        push_error("Imported GLB has no MeshInstance3D")
        quit(3)
        return
    if state.skeletons < 1:
        push_error("Imported animated GLB has no Skeleton3D")
        quit(4)
        return
    for required_clip in ["idle", "walk", "run"]:
        if not state.clips.has(required_clip):
            push_error("Imported GLB is missing animation: " + required_clip)
            quit(5)
            return
    print("NOOBI_MODEL3D_SMOKE_OK meshes=%d skeletons=%d clips=%s" % [state.meshes, state.skeletons, state.clips.keys()])
    quit(0)

func inspect_node(node: Node, state: Dictionary) -> void:
    if node is MeshInstance3D:
        state.meshes += 1
    if node is Skeleton3D:
        state.skeletons += 1
    if node is AnimationPlayer:
        for library_name in node.get_animation_library_list():
            var library: AnimationLibrary = node.get_animation_library(library_name)
            for animation_name in library.get_animation_list():
                state.clips[animation_name] = true
    for child in node.get_children():
        inspect_node(child, state)
`;
}

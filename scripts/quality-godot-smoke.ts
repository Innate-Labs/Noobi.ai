import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { GodotEnvironmentService } from '../src/main/godotEnvironmentService.js';
import { GodotBuildStore } from '../src/main/production/godotBuildStore.js';
import { buildGodotCandidate } from '../src/main/production/godotBuilder.js';

// Uses the same production services as Main. Never mutates the supplied game.
const out = resolve(process.env.NOOBI_QUALITY_OUTPUT ?? '.tmp/quality-godot-smoke');
await mkdir(out, { recursive: true });
const environment = new GodotEnvironmentService({ storageFile: join(out, 'godot.json') });
const status = await environment.init();
const evidence: Record<string, unknown> = { engine: status.tool.version, templates: status.exportTemplates.expectedVersion };
for (const bad of [false, true]) {
  const root = join(out, bad ? 'broken-main' : 'valid-main');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'project.godot'), '[application]\nconfig/name="Noobi validation fixture"\nrun/main_scene="res://main.tscn"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  await writeFile(join(root, 'main.tscn'), '[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://main.gd" id="1"]\n[node name="Main" type="Node"]\nscript = ExtResource("1")\n');
  await writeFile(join(root, 'main.gd'), bad
    ? 'extends Node\nfunc _ready():\n\tvar missing: Node = get_node_or_null("MissingPlayer")\n\tmissing.queue_free()\n'
    : 'extends Node\nfunc _ready():\n\tprint("VALID_MAIN_STARTED")\n');
  const imported = await environment.execute({ kind: 'import', projectPath: root });
  const validated = await environment.execute({ kind: 'validate', projectPath: root });
  const runtime = await environment.execute({ kind: 'runtime', projectPath: root });
  evidence[bad ? 'injectedRuntimeFault' : 'normalControl'] = { imported, validated, runtime };
  if (!imported.ok || !validated.ok || runtime.ok === bad) throw new Error('Real Godot runtime gate failed its fault/control test');
}
const project = process.argv[2];
if (project) {
  const store = new GodotBuildStore(join(out, 'builds'));
  const build = await buildGodotCandidate({ projectId: 'smoke-project', projectRoot: resolve(project), store, environment });
  await store.verifyArtifacts(build);
  evidence.productionBuild = build.record;
  evidence.snapshotRoot = build.root;
}
await writeFile(join(out, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ ok: true, evidence: join(out, 'evidence.json'), snapshotRoot: evidence.snapshotRoot }));

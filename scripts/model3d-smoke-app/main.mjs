import {app} from 'electron';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {GodotEnvironmentService} from '../../dist/main/godotEnvironmentService.js';
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {AssetStore} from '../../dist/main/assetStore.js';
import {ReferenceModel3dService} from '../../dist/main/referenceModel3d.js';
import {renderReferenceModel} from '../../dist/main/referenceModelRenderer.js';
app.on('window-all-closed',()=>{});
app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
async function run() {
const root=resolve('.noobi-private/image-threejs-smoke');
try {
  await mkdir(join(root,'model-sources'),{recursive:true});
  await copyFile(resolve('examples/image-threejs/wind-beacon.mjs'),join(root,'model-sources/wind-beacon.mjs'));
  const assets=new AssetStore(),project={id:'reference-smoke',root};
  const [reference]=await assets.importFiles(project.id,root,[resolve('examples/image-threejs/wind-beacon.png')]);
  const spec=JSON.parse(await readFile(resolve('examples/image-threejs/wind-beacon.spec.json'),'utf8'));spec.referenceImage=reference.relativePath;
  await writeFile(join(root,'model-sources/wind-beacon.spec.json'),JSON.stringify(spec,null,2));
  const service=new ReferenceModel3dService(assets,join(root,'host-evidence'),renderReferenceModel);
  const result=await service.generate({project,kind:'model3d',name:'wind-beacon',prompt:'Four teal paddles, brass hub, octagonal plinth',
    options:{referenceImage:reference.relativePath,sourcePath:'model-sources/wind-beacon.mjs'}});
  const issues=await service.verify(project,[result.asset]);if(issues.length)throw Error(issues.join('\n'));
  await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,asset:result.asset.relativePath,metadata:result.asset.metadata}));
  const textured = await renderReferenceModel({source:`export async function createModel(THREE,{referenceUrl}) {
    const map=await new THREE.TextureLoader().loadAsync(referenceUrl);map.colorSpace=THREE.SRGBColorSpace;
    const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({map})));return {root,animations:[]};
  }`,reference:await readFile(resolve('examples/image-threejs/wind-beacon.png')),mimeType:'image/png',animation:false});
  const gltf=JSON.parse(textured.glb.subarray(20,20+textured.glb.readUInt32LE(12)).toString('utf8'));
  if(!gltf.images?.length||gltf.images.some(image=>image.uri))throw Error('Texture was not embedded in GLB');
  console.log('TEXTURED_GLB_RELOAD_OK');
  // An author module may not read Node APIs or fetch a remote resource.
  for(const source of ['export function createModel(){return process.env}',
    'export async function createModel(){await fetch("https://example.com/private");return {}}']) {
    let rejected=false;try {await renderReferenceModel({source,reference:await readFile(resolve('examples/image-threejs/wind-beacon.png')),mimeType:'image/png',animation:false})}catch{rejected=true}
    if(!rejected)throw Error('Sandbox negative test failed');
  }
  const started=Date.now();let timedOut=false;
  try {await renderReferenceModel({source:'export function createModel(){while(true){}}',reference:Buffer.alloc(0),mimeType:'image/png',animation:false})}
  catch {timedOut=true}
  if(!timedOut || Date.now()-started > 40000)throw Error('Unbounded author execution');
  console.log('AUTHOR_TIMEOUT_OK');
  await writeFile(join(root,'project.godot'),'[application]\nconfig/name="Image Three.js Smoke"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
  await writeFile(join(root,'verify.gd'),`extends SceneTree
var meshes = 0
var paddles = 0
var pivot = false
func _initialize():
    var packed = load(${JSON.stringify('res://'+result.asset.relativePath)})
    if not packed is PackedScene:
        push_error("GLB missing")
        quit(2)
        return
    var instance = packed.instantiate()
    inspect(instance)
    instance.free()
    if meshes < 10 or paddles != 4 or not pivot:
        push_error("Model hierarchy missing")
        quit(3)
        return
    print("GODOT_REFERENCE_MODEL_OK meshes=%d paddles=%d" % [meshes,paddles])
    quit(0)
func inspect(node):
    if node is MeshInstance3D:
        meshes += 1
        if str(node.name).begins_with("TealPaddle"):
            paddles += 1
    if node.name == "RotorPivot":
        pivot = true
    for child in node.get_children():
        inspect(child)
`);
  const env=new GodotEnvironmentService({storageFile:join(root,'godot-env.json')});const status=await env.init();
  const imported=await env.execute({kind:'import',projectPath:root});
  if(!imported.ok)throw Error('Godot import failed: '+imported.stderr);
  const check=await promisify(execFile)(status.tool.binaryPath,['--headless','--path',root,'--script','res://verify.gd'],{timeout:30000,maxBuffer:1024*1024});
  if(!check.stdout.includes('GODOT_REFERENCE_MODEL_OK')||check.stderr.includes('ERROR'))throw Error('Godot instance check failed: '+check.stderr);
  console.log(check.stdout.trim());
  console.log('NOOBI_REFERENCE_MODEL_SMOKE_OK export independent-glb-render 3-views no-node no-external-network');
  app.exit(0);
} catch(error) {console.error(error);app.exit(1)}

}

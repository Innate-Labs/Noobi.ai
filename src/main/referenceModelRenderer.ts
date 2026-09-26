import { BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { assertPortableSkinTracks } from './modelAnimationPortability.js';
import type { ModelRenderer } from './referenceModel3d.js';

/** Author code runs without Node, preload, credentials or external network. A fresh window reopens the GLB for evidence. */
export const renderReferenceModel: ModelRenderer = async input => {
  const threeRoot = dirname(dirname(createRequire(import.meta.url).resolve('three')));
  const files = new Map<string, { bytes: Buffer; type: string }>();
  for (const [url, path] of Object.entries({ '/three.js': 'build/three.module.js', '/three.core.js': 'build/three.core.js',
    '/GLTFExporter.js': 'examples/jsm/exporters/GLTFExporter.js', '/GLTFLoader.js': 'examples/jsm/loaders/GLTFLoader.js',
    '/utils/BufferGeometryUtils.js': 'examples/jsm/utils/BufferGeometryUtils.js',
    '/utils/SkeletonUtils.js': 'examples/jsm/utils/SkeletonUtils.js',
    '/RoomEnvironment.js': 'examples/jsm/environments/RoomEnvironment.js' })) {
    files.set(url, { bytes: await readFile(join(threeRoot, path)), type: 'text/javascript' });
  }
  // Module paths are only host-owned library files and the explicitly supplied factory/image.
  files.set('/factory.js', { bytes: Buffer.from(input.source), type: 'text/javascript' });
  files.set('/reference', { bytes: input.reference, type: input.mimeType });
  files.set('/runtime.js', { bytes: Buffer.from(RUNTIME), type: 'text/javascript' });
  files.set('/', { bytes: Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#e8edf1}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/three.js"}}</script></head><body><script type="module" src="/runtime.js"></script></body></html>`), type: 'text/html' });
  const server = createServer((req, res) => {
    const resource = req.method === 'GET' ? files.get((req.url ?? '').split('?')[0]!) : undefined;
    if (!resource) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': resource.type, 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'" });
    res.end(resource.bytes);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Model preview failed to bind');
  const origin = `http://127.0.0.1:${address.port}`;
  let window: BrowserWindow | undefined;
  const deadline = AbortSignal.timeout(30_000);
  const create = (): BrowserWindow => {
    const win = new BrowserWindow({ width: 640, height: 640, useContentSize: true, show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
        backgroundThrottling: false, offscreen: true, partition: `noobi-model-${randomUUID()}` } });
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.on('will-redirect', e => e.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
    win.webContents.session.on('will-download', (_event, item) => item.cancel());
    win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      let allowed = false;
      try { const url = new URL(details.url); allowed = (url.origin === origin && files.has(url.pathname))
          || (url.protocol === 'blob:' && url.origin === origin && (details.resourceType === 'image' || !files.has('/factory.js')))
          || (details.resourceType === 'image' && /^data:image\/(png|jpeg|webp);/u.test(details.url)); } catch { /* deny */ }
      callback({ cancel: !allowed });
    });
    return win;
  };
  const abort = (): void => { window?.destroy(); };
  deadline.addEventListener('abort', abort, { once: true });
  async function wait<T>(operation: Promise<T>): Promise<T> {
    deadline.throwIfAborted();
    return new Promise((resolve, reject) => {
      const onAbort = (): void => reject(new Error('Three.js model build timed out (30s)'));
      deadline.addEventListener('abort', onAbort, { once: true });
      operation.then(resolve, reject).finally(() => deadline.removeEventListener('abort', onAbort));
    });
  }
  async function ready(): Promise<void> {
    while (true) {
      const state = await wait(window!.webContents.executeJavaScript('window.__modelState ?? null'));
      if (state?.error) throw new Error(`Three.js model: ${String(state.error).slice(0, 600)}`);
      if (state?.ready) return;
      await new Promise(r => setTimeout(r, 50));
      deadline.throwIfAborted();
    }
  }
  try {
    let glb = input.glb;
    if (!glb) {
      window = create();
      await wait(window.loadURL(`${origin}/?author=1`));
      await ready();
      const base64 = await wait(window.webContents.executeJavaScript('window.__modelState.glb'));
      if (typeof base64 !== 'string' || base64.length > 24 * 1024 * 1024) throw new Error('Export exceeds GLB budget');
      glb = Buffer.from(base64, 'base64');
      window.destroy(); window = undefined;
    }
    if (glb.length > 16 * 1024 * 1024 || glb.length < 20 || glb.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid or oversized GLB');
    files.set('/model.glb', { bytes: glb, type: 'model/gltf-binary' });
    // Remove author code before loading the independent GLB inspection renderer.
    files.delete('/factory.js');
    window = create();
    await wait(window.loadURL(`${origin}/?review=1`));
    await ready();
    const stats = await wait(window.webContents.executeJavaScript('window.__modelState.stats'));
    if (input.animation && (stats.skins < 1 || !stats.inspection.clips.some((clip: { skinMotionObserved: boolean }) => clip.skinMotionObserved))) throw new Error('Animated model needs a skin and actual weighted vertex deformation');
    const views = {} as Record<'front' | 'side' | 'back' | 'perspective', Buffer>;
    for (const angle of ['front', 'side', 'back', 'perspective'] as const) {
      await wait(window.webContents.executeJavaScript(`window.__captureModel(${JSON.stringify(angle)})`));
      const shot = await wait(window.webContents.capturePage());
      const pixels = shot.toBitmap();
      let foreground = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i]! - pixels[0]!) + Math.abs(pixels[i + 1]! - pixels[1]!) + Math.abs(pixels[i + 2]! - pixels[2]!) > 24) foreground++;
      }
      if (foreground < 400) throw new Error(`Exported model is blank or too thin in ${angle} view`);
      views[angle] = shot.toPNG();
    }
    return { glb, views, ...stats };
  } finally {
    deadline.removeEventListener('abort', abort);
    if (window && !window.isDestroyed()) window.destroy();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
};

const RUNTIME = String.raw`
import * as THREE from '/three.js';
import {GLTFExporter} from '/GLTFExporter.js';
import {GLTFLoader} from '/GLTFLoader.js';
import {RoomEnvironment} from '/RoomEnvironment.js';
window.__modelState = {};
try {
  if (new URLSearchParams(location.search).has('author')) {
    const {createModel} = await import('/factory.js');
    if (typeof createModel !== 'function') throw Error('Export createModel(THREE, {referenceUrl}) from your .mjs file');
    const model = await createModel(THREE, {referenceUrl: '/reference'});
    if (!model?.root?.isObject3D) throw Error('createModel must return {root: THREE.Group, animations: THREE.AnimationClip[]}');
    check(model.root, model.animations || []);
    const data = await new GLTFExporter().parseAsync(model.root, {binary:true, trs:true, animations:model.animations || [], maxTextureSize:2048});
    if (!(data instanceof ArrayBuffer) || data.byteLength > 16777216) throw Error('GLB exceeds 16 MiB');
    const bytes = new Uint8Array(data); let binary = '';
    for(let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
    window.__modelState = {ready:true, glb:btoa(binary)};
  } else {
    const gltf = await new GLTFLoader().loadAsync('/model.glb');
    (${assertPortableSkinTracks.toString()})(gltf.parser.json);
    // GLTFLoader can tolerate failed texture fetches. Evidence must not silently lose them.
    const loadedMaterials = await gltf.parser.getDependencies('material');
    for (const [i, definition] of (gltf.parser.json.materials || []).entries()) {
      const material=loadedMaterials[i], pbr=definition.pbrMetallicRoughness || {};
      for (const [declared, slot] of [[pbr.baseColorTexture,'map'],[pbr.metallicRoughnessTexture,'roughnessMap'],
        [definition.normalTexture,'normalMap'],[definition.emissiveTexture,'emissiveMap'],[definition.occlusionTexture,'aoMap']]) {
        if (declared && !material?.[slot]?.image) throw Error('GLB texture failed to reload: '+slot);
      }
    }
    const stats = check(gltf.scene, gltf.animations);
    stats.inspection = inspect(gltf.scene, gltf.animations);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8edf1');
    const bounds = new THREE.Box3().setFromObject(gltf.scene), center=bounds.getCenter(new THREE.Vector3());
    const size=bounds.getSize(new THREE.Vector3()), radius=size.length()/2;
    gltf.scene.position.sub(center); scene.add(gltf.scene);
    scene.add(new THREE.HemisphereLight(0xffffff,0x687887,.7));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(3,5,4);scene.add(light);
    const camera = new THREE.PerspectiveCamera(38,1,Math.max(radius/1000,0.001),radius*100);
    const renderer = new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    const pmrem = new THREE.PMREMGenerator(renderer);scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    renderer.setSize(640,640);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.9;
    document.body.appendChild(renderer.domElement);
    window.__captureModel = async view => {
      const angle={front:0,side:Math.PI/2,back:Math.PI,perspective:Math.PI/4}[view], distance=radius/Math.sin(38*Math.PI/360)*1.12;
      camera.position.set(Math.sin(angle)*distance,distance*(view==='perspective'?.55:.15),Math.cos(angle)*distance);camera.lookAt(0,0,0);
      renderer.render(scene,camera);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    };
    await window.__captureModel('front');
    window.__modelState={ready:true,stats};
  }
} catch(error) {window.__modelState={error:String(error?.message || error)}}
function check(root, animations) {
  let nodes=0,meshes=0,skins=0,triangles=0;
  root.updateMatrixWorld(true);
  root.traverse(n=>{
    if(++nodes>2048)throw Error('Model exceeds 2048 nodes');
    if(n.isSkinnedMesh) skins++;
    if(n.isMesh){
      meshes++;const p=n.geometry?.getAttribute('position');if(!p)throw Error('Mesh missing positions');
      triangles+=(n.geometry.index?.count ?? p.count)/3;
      for(const x of p.array)if(!Number.isFinite(x))throw Error('Non-finite geometry');
    }
  });
  if(!meshes || triangles<1 || triangles>100000)throw Error('Model must contain 1–100000 triangles');
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  if(!Number.isFinite(size.length()) || size.length()<0.0001 || size.length()>10000)throw Error('Invalid model bounds');
  if(animations.length>32 || animations.some(a=>!a.tracks?.length || !Number.isFinite(a.duration) || a.duration<=0 || a.duration>600))throw Error('Invalid animation clips');
  return {meshes,skins,triangles:Math.ceil(triangles),animations:animations.map(a=>a.name)};
}
function inspect(root, animations) {
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root), nodes=[], materials=new Set(); let maxTextureSize=0;
  root.traverse(node=>{
    nodes.push({name:node.name,position:node.getWorldPosition(new THREE.Vector3()).toArray()});
    for(const material of (Array.isArray(node.material)?node.material:node.material?[node.material]:[])) {
      materials.add(material);
      for(const value of Object.values(material)) if(value?.isTexture) {
        const image=value.image;
        if(!image || !Number.isFinite(image.width) || !Number.isFinite(image.height)) throw Error('Texture has no decoded dimensions');
        maxTextureSize=Math.max(maxTextureSize,image.width,image.height);
      }
    }
  });
  // Observe geometry independently of author track declarations. Empty animated
  // nodes, unused bones and equivalent quaternion signs must not certify motion.
  const meshes=[];
  root.traverseVisible(node=>{
    if(node.isMesh && (Array.isArray(node.material)?node.material:[node.material]).some(m=>m?.visible!==false && m?.opacity>0)) meshes.push(node);
  });
  const points=[], perMesh=Math.max(4,Math.floor(8192/Math.max(1,meshes.length)));
  for(const mesh of meshes){
    const index=mesh.geometry.index, positions=mesh.geometry.getAttribute('position');
    const count=index?.count ?? positions.count, amount=Math.min(perMesh,count);
    for(let i=0;i<amount;i++){
      const slot=amount===1?0:Math.floor(i*(count-1)/(amount-1));
      points.push({mesh,index:index?index.getX(slot):slot});
    }
  }
  const posed=()=>{
    root.updateMatrixWorld(true);for(const mesh of meshes)if(mesh.isSkinnedMesh)mesh.skeleton.update();
    return points.map(({mesh,index})=>{
      const position=mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const skin=mesh.isSkinnedMesh?mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index)):new THREE.Vector3();
      const values=[...position.toArray(),...skin.toArray()];
      if(values.some(x=>!Number.isFinite(x)))throw Error('Non-finite animated vertex');
      return values;
    });
  };
  const threshold=Math.max(1e-5,box.getSize(new THREE.Vector3()).length()*1e-5);
  const clips=[];
  for(const clip of animations) {
    const bindings=clip.tracks.map(track=>({binding:THREE.PropertyBinding.create(root,track.name),size:track.getValueSize()}));
    const read=()=>bindings.flatMap(({binding,size})=>{const value=new Array(size).fill(NaN);binding.getValue(value,0);if(value.some(x=>!Number.isFinite(x)))throw Error('Unbound/non-numeric animation track in '+clip.name);return value;});
    bindings.forEach(({binding})=>binding.bind());
    const mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(0);
    const initial=read(),initialPose=posed();let bindingMotionObserved=false,maxVertexDisplacement=0,maxSkinDisplacement=0;
    const keys=new Set();
    for(const track of clip.tracks)for(let i=0;i<Math.min(64,track.times.length);i++){
      const index=Math.floor(i*(track.times.length-1)/Math.max(1,Math.min(64,track.times.length)-1)),time=track.times[index];
      if(Number.isFinite(time)&&time>=0&&time<=clip.duration)keys.add(time);
    }
    const ordered=[...keys].sort((a,b)=>a-b),times=new Set(Array.from({length:9},(_,i)=>clip.duration*i/8));
    for(let i=0;i<Math.min(8,ordered.length);i++)times.add(ordered[Math.floor(i*(ordered.length-1)/Math.max(1,Math.min(8,ordered.length)-1))]);
    const sampleTimes=[...times].sort((a,b)=>a-b);
    for(const time of sampleTimes){
      mixer.setTime(time);const current=read(),pose=posed();
      if(current.some((x,i)=>Math.abs(x-initial[i])>1e-6))bindingMotionObserved=true;
      for(let i=0;i<pose.length;i++){
        maxVertexDisplacement=Math.max(maxVertexDisplacement,Math.hypot(...pose[i].slice(0,3).map((x,j)=>x-initialPose[i][j])));
        maxSkinDisplacement=Math.max(maxSkinDisplacement,Math.hypot(...pose[i].slice(3).map((x,j)=>x-initialPose[i][j+3])));
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(root);bindings.forEach(({binding})=>binding.unbind());
    clips.push({name:clip.name,duration:clip.duration,targets:bindings.length,bindingMotionObserved,
      motionObserved:maxVertexDisplacement>threshold,skinMotionObserved:maxSkinDisplacement>threshold,
      sampledVertices:points.length,sampleTimes,maxVertexDisplacement,maxSkinDisplacement,threshold});
  }
  root.updateMatrixWorld(true);
  return {bounds:{min:box.min.toArray(),max:box.max.toArray()},nodeCount:nodes.length,materialCount:materials.size,maxTextureSize,nodes,clips};
}
`;

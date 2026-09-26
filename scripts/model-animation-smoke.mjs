// Engine-generated engineering geometry, never an autonomous game or approved character.
import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { renderReferenceModel } from '../dist/main/referenceModelRenderer.js';
import { validateModelInspection } from '../dist/main/modelAssetSpec.js';
const out=resolve('.noobi-private/stage-07/animation',new Date().toISOString().replaceAll(':','-'));
app.setPath('userData',join(out,'electron'));app.on('window-all-closed',()=>{});
const buildSource=(setup,track)=>`export function createModel(THREE){
 const root=new THREE.Group();root.name='ActorRoot';
 const geometry=new THREE.BoxGeometry(1,2,1),material=new THREE.MeshStandardMaterial({color:0x88bbaa});
 ${setup}
 body.name='Body';body.position.y=1;root.add(body);
 return {root,animations:[new THREE.AnimationClip('action',1,[${track}])]};
}`;
const plain='const body=new THREE.Mesh(geometry,material);';
const skinned=`const ids=[],weights=[];for(let i=0;i<geometry.attributes.position.count;i++){ids.push(geometry.attributes.position.getY(i)>0?1:0,0,0,0);weights.push(1,0,0,0)}
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const body=new THREE.SkinnedMesh(geometry,material),base=new THREE.Bone(),tip=new THREE.Bone(),unused=new THREE.Bone();
 base.name='Base';tip.name='Tip';unused.name='Unused';tip.position.y=1;base.add(tip,unused);body.add(base);body.bind(new THREE.Skeleton([base,tip,unused]));`;
const vector=(name,times,values)=>`new THREE.VectorKeyframeTrack('${name}',${JSON.stringify(times)},${JSON.stringify(values)})`;
const cases=[
 {name:'rigid-motion',setup:plain,track:vector('Body.position',[0,.5,1],[0,1,0,0,1.2,0,0,1,0]),motion:true,skin:false},
 {name:'empty-node-decoy',setup:plain+"const decoy=new THREE.Group();decoy.name='Decoy';root.add(decoy);",track:vector('Decoy.position',[0,.5,1],[0,0,0,0,2,0,0,0,0]),motion:false,skin:false},
 {name:'short-pulse',setup:plain,track:vector('Body.position',[0,.04,.08,1],[0,1,0,0,1.2,0,0,1,0,0,1,0]),motion:true,skin:false},
 {name:'endpoint-only',setup:plain,track:vector('Body.position',[0,1],[0,1,0,0,1.2,0])+'.setInterpolation(THREE.InterpolateDiscrete)',motion:true,skin:false},
 {name:'quaternion-sign-only',setup:plain,track:"new THREE.QuaternionKeyframeTrack('Body.quaternion',[0,.5,1],[0,0,0,1,0,0,0,-1,0,0,0,1])",motion:false,skin:false},
 {name:'weighted-bone',setup:skinned,track:vector('Tip.position',[0,.5,1],[0,1,0,.3,1,0,0,1,0]),motion:true,skin:true},
 {name:'unused-bone',setup:skinned,track:vector('Unused.position',[0,.5,1],[0,0,0,.3,0,0,0,0,0]),motion:false,skin:false},
 {name:'rigid-skin-translation',setup:skinned,track:vector('Body.position',[0,.5,1],[0,1,0,0,1.2,0,0,1,0]),blocked:true},
 {name:'parent-skin-translation',setup:skinned,track:vector('ActorRoot.position',[0,.5,1],[0,0,0,0,.2,0,0,0,0]),motion:true,skin:false},
];
const spec={version:2,referenceImage:'reference.png',parts:[{name:'Body',shape:'box',material:'mint'}],criticalFeatures:['engineering'],inferredSurfaces:[],artBiblePath:'.noobi/art-bible.json',game:{dimensions:[1,2,1],tolerance:.1,pivot:{node:'ActorRoot',position:[0,0,0]},sockets:[],collision:{kind:'box',purpose:'fixture'}},animation:{mode:'transform',required:['action']}};
const art={version:1,id:'fixture',style:'engineering',palette:['#88bbaa'],units:'meters',up:'+Y',forward:'-Z',budgets:{triangles:1000,nodes:20,materials:2,textureSize:512}};
app.whenReady().then(async()=>{const results=[];try{
 await mkdir(out,{recursive:true});const reference=await readFile('examples/image-threejs/wind-beacon.png');
 for(const item of cases){
  const source=buildSource(item.setup,item.track);await writeFile(join(out,item.name+'.mjs'),source);
  if(item.blocked){await assert.rejects(()=>renderReferenceModel({source,reference,mimeType:'image/png',animation:false}),/GODOT_SKIN_TRACK/);results.push({name:item.name,blocked:true});console.log('ANIMATION_PORTABILITY_REJECTED',item.name);continue}
  const result=await renderReferenceModel({source,reference,mimeType:'image/png',animation:false});
  const clip=result.inspection.clips[0];results.push({name:item.name,clip});
  await writeFile(join(out,item.name+'.glb'),result.glb);await writeFile(join(out,item.name+'.png'),result.views.perspective);
  assert.equal(clip.motionObserved,item.motion,item.name+' rendered movement');assert.equal(clip.skinMotionObserved,item.skin,item.name+' weighted deformation');
  const validate=mode=>validateModelInspection({...spec,animation:{mode,required:['action']}},art,result);
  if(item.motion)assert.doesNotThrow(()=>validate('transform'));else assert.throws(()=>validate('transform'),/static/);
  if(item.skin)assert.doesNotThrow(()=>validate('skeletal'));else assert.throws(()=>validate('skeletal'),/skin|static/);
  if(item.name==='weighted-bone'||item.name==='unused-bone'){
   const inspect=()=>renderReferenceModel({source:'',reference,mimeType:'image/png',animation:true,glb:result.glb});
   if(item.skin)await inspect();else await assert.rejects(inspect,/weighted vertex deformation/);
  }
  console.log('ANIMATION_CASE_OK',item.name,clip.maxVertexDisplacement,clip.maxSkinDisplacement);
 }
 await writeFile(join(out,'report.json'),JSON.stringify({passed:true,results,scope:'Independent GLB deformation sampling, not gait or game acceptance'},null,2));
 await writeFile('.noobi-private/stage-07/animation-latest.json',JSON.stringify({out,passed:true,cases:results.length},null,2));
 console.log('ANIMATION_OK',out);app.exit(0);
}catch(e){await writeFile(join(out,'failure.json'),JSON.stringify({error:String(e.stack??e),results},null,2));console.error(e);app.exit(1)}});

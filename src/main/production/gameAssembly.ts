import { createHash } from 'node:crypto';
import { readProjectBytes } from '../referenceModel3d.js';
import { parseArtBible } from '../modelAssetSpec.js';
import { parseProgression } from './progressionGraph.js';
import type { ProgressionDefinition } from '../../shared/progression.js';
export const ASSEMBLY_VALIDATOR_VERSION = 'assembly-v1';
export interface GameAssembly {
  version: 1; gameId: string; contentVersion: number; title: string; subtitle: string; controls: string;
  playerScene: string;
  regions: Record<string, { scene: string; spawn: string; quests: Record<string,{node:string;kind:'interact'|'defeat'}>; exits: Record<string,string> }>;
  labels: {regions:Record<string,string>;quests:Record<string,string>;items:Record<string,string>;abilities:Record<string,string>};
  style: { artBibleId:string; artBibleHash:string; references:string[]; colors:Record<string,string> };
}
const roles = ['background','surface','text','accent','accentText','border','success'];
const object = (v: any): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);
const label = (v: any,max=200) => typeof v === 'string' && v.trim().length>0 && v.length<=max;
const id = (v: any) => typeof v === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(v);
const path = (v: any) => typeof v === 'string' && v.length<240 && /^[a-zA-Z0-9_./-]+$/.test(v) && !v.startsWith('/') && v.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');
const nodePath = (v:any) => typeof v==='string' && v.length<=240 && /^[\p{L}\p{N}_ -]+(?:\/[\p{L}\p{N}_ -]+)*$/u.test(v);
function demand(ok:unknown,message:string): asserts ok { if(!ok) throw Error('ASSEMBLY: '+message); }
const exact = (value:any,keys:string[]) => object(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
function contrast(a:string,b:string):number {
  const luminance=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i]!,0);
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function parseGameAssembly(value:unknown,definition:ProgressionDefinition):GameAssembly {
  const v=value as any;
  demand(object(v)&&v.version===1&&id(v.gameId)&&Number.isSafeInteger(v.contentVersion)&&v.contentVersion>=1&&v.contentVersion<=1000000,'Invalid version or game identity');
  for(const field of ['title','subtitle','controls'])demand(label(v[field]),'Missing '+field);
  demand(path(v.playerScene)&&v.playerScene.endsWith('.tscn'),'Invalid player scene path');
  demand(exact(v.regions,definition.regions),'Every progression region needs exactly one scene binding');
  for(const region of definition.regions){
    const r=v.regions[region];demand(object(r)&&path(r.scene)&&r.scene.endsWith('.tscn')&&nodePath(r.spawn),'Invalid scene/spawn for '+region);
    const quests=definition.quests.filter(q=>q.region===region).map(q=>q.id);
    const exits=definition.links.filter(e=>e.from===region||(e.bidirectional&&e.to===region)).map(e=>e.id);
    demand(exact(r.quests,quests)&&exact(r.exits,exits),'Missing or extra objective/exit binding for '+region);
    const nodes=[r.spawn];
    for(const q of Object.values(r.quests) as any[]){demand(object(q)&&['interact','defeat'].includes(q.kind)&&nodePath(q.node),'Invalid quest trigger');nodes.push(q.node)}
    for(const p of Object.values(r.exits)){demand(nodePath(p),'Invalid exit node');nodes.push(p)}
    demand(new Set(nodes).size===nodes.length,'Spawn, objectives and exits must be distinct nodes');
  }
  demand(object(v.labels),'Missing labels');
  for(const [key,ids] of Object.entries({regions:definition.regions,quests:definition.quests.map(q=>q.id),items:Object.keys(definition.items),abilities:definition.abilities}))
    demand(exact(v.labels[key],ids)&&Object.values(v.labels[key]).every(x=>label(x,100)),'Missing display labels for '+key);
  const s=v.style;
  demand(object(s)&&label(s.artBibleId,120)&&typeof s.artBibleHash==='string'&&/^[a-f0-9]{64}$/.test(s.artBibleHash),'Missing bound ArtBible identity/hash');
  demand(Array.isArray(s.references)&&s.references.length<=8&&new Set(s.references).size===s.references.length&&s.references.every((p:any)=>path(p)&&/\.(png|jpg|jpeg|webp)$/i.test(p)),'Invalid reference image paths');
  demand(exact(s.colors,roles)&&Object.values(s.colors).every(x=>typeof x==='string'&&/^#[a-f0-9]{6}$/i.test(x)),'Missing UI palette roles');
  demand(contrast(s.colors.text,s.colors.surface)>=4.5&&contrast(s.colors.accentText,s.colors.accent)>=4.5,'UI text contrast below project minimum 4.5');
  return structuredClone(v) as GameAssembly;
}
export async function checkGameAssembly(root:string):Promise<Record<string,unknown>|null>{
  let raw:Buffer;
  try{raw=await readProjectBytes(root,'data/game-assembly.json',128*1024)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e}
  const progression=await readProjectBytes(root,'data/progression.json',64*1024);
  const definition=parseProgression(JSON.parse(progression.toString('utf8')));
  const assembly=parseGameAssembly(JSON.parse(raw.toString('utf8')),definition);
  const artRaw=await readProjectBytes(root,'.noobi/art-bible.json',64*1024);
  const art=parseArtBible(JSON.parse(artRaw.toString('utf8')));
  const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
  demand(assembly.style.artBibleId===art.id&&assembly.style.artBibleHash===digest(artRaw),'ArtBible changed; rebind the selected style');
  const palette=new Set(art.palette.map(x=>x.toLowerCase()));
  demand(Object.values(assembly.style.colors).every(c=>palette.has(c.toLowerCase())),'UI colors must derive from the bound ArtBible palette');
  const files:Record<string,string>={'data/game-assembly.json':digest(raw),'data/progression.json':digest(progression),'.noobi/art-bible.json':digest(artRaw)};
  for(const file of new Set([assembly.playerScene,...Object.values(assembly.regions).map(r=>r.scene)])){
    const bytes=await readProjectBytes(root,file,1024*1024);demand(bytes.toString('utf8').startsWith('[gd_scene'),'Invalid packed scene '+file);files[file]=digest(bytes);
  }
  for(const file of assembly.style.references)files[file]=digest(await readProjectBytes(root,file,16*1024*1024));
  return {ok:true,version:ASSEMBLY_VALIDATOR_VERSION,gameId:assembly.gameId,files,regions:definition.regions.length,
    limitation:'Bindings/files and palette provenance only; runtime nodes, objectives, geometry, art and reference likeness need independent playtesting'};
}

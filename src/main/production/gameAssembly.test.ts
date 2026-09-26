import {readFile,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {it,expect,afterEach} from 'vitest';
import {parseGameAssembly,checkGameAssembly} from './gameAssembly.js';
import {parseProgression} from './progressionGraph.js';
const d=parseProgression(JSON.parse(await readFile(new URL('../../../examples/progression/three-regions.json',import.meta.url),'utf8')));
const colors={background:'#182434',surface:'#25384a',text:'#fff8e7',accent:'#ffd172',accentText:'#17202a',border:'#7592aa',success:'#86d5ac'};
const art=JSON.stringify({version:1,id:'fixture',style:'Engineering fixture',palette:Object.values(colors),units:'meters',up:'+Y',forward:'-Z',budgets:{triangles:1000,nodes:50,materials:8,textureSize:512}});
const sha=createHash('sha256').update(art).digest('hex');
function fixture(){return {version:1,gameId:'assembly-fixture',contentVersion:1,title:'工程',subtitle:'装配验证',controls:'WASD',playerScene:'player.tscn',
 regions:Object.fromEntries(d.regions.map(r=>[r,{scene:r+'.tscn',spawn:'Spawn',quests:Object.fromEntries(d.quests.filter(q=>q.region===r).map(q=>[q.id,{node:q.id,kind:'interact'}])),exits:Object.fromEntries(d.links.filter(e=>e.from===r||(e.bidirectional&&e.to===r)).map(e=>[e.id,e.id]))}])),
 labels:{regions:Object.fromEntries(d.regions.map(x=>[x,x])),quests:Object.fromEntries(d.quests.map(x=>[x.id,x.id])),items:Object.fromEntries(Object.keys(d.items).map(x=>[x,x])),abilities:Object.fromEntries(d.abilities.map(x=>[x,x]))},
 style:{artBibleId:'fixture',artBibleHash:sha,references:[],colors:{...colors}}};}
it('requires physical bindings for every quest and both directions of a link',()=>{const a=fixture();expect(parseGameAssembly(a,d).regions.ruins?.exits['camp-ruins']).toBe('camp-ruins');delete a.regions.ruins!.exits['camp-ruins'];expect(()=>parseGameAssembly(a,d)).toThrow('binding')});
it('rejects shared nodes and path traversal',()=>{const a=fixture();a.regions.camp!.quests['camp-key']!.node='Spawn';expect(()=>parseGameAssembly(a,d)).toThrow('distinct');const b=fixture();b.playerScene='../old-game.tscn';expect(()=>parseGameAssembly(b,d)).toThrow('path')});
it('does not accept unreadable primary text or missing UI roles',()=>{const a=fixture();a.style.colors.accentText=a.style.colors.accent;expect(()=>parseGameAssembly(a,d)).toThrow('contrast');const b=fixture();delete (b.style.colors as any).text;expect(()=>parseGameAssembly(b,d)).toThrow('palette')});
it('requires display labels and supported objectives',()=>{const a=fixture();delete a.labels.quests.finale;expect(()=>parseGameAssembly(a,d)).toThrow('labels');const b=fixture();b.regions.camp!.quests['camp-key']!.kind='fake';expect(()=>parseGameAssembly(b,d)).toThrow('trigger')});
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(r=>rm(r,{recursive:true,force:true})))});
async function project(){const root=await mkdtemp(join(tmpdir(),'noobi-assembly-'));roots.push(root);await mkdir(join(root,'data'));await mkdir(join(root,'.noobi'));await writeFile(join(root,'data/game-assembly.json'),JSON.stringify(fixture()));await writeFile(join(root,'data/progression.json'),JSON.stringify(d));await writeFile(join(root,'.noobi/art-bible.json'),art);for(const f of ['player',...d.regions])await writeFile(join(root,f+'.tscn'),'[gd_scene format=3]\n[node name="Test" type="Node3D"]\n');return root}
it('binds actual scene and style bytes but explicitly does not certify art',async()=>{const r=await checkGameAssembly(await project());expect(r?.ok).toBe(true);expect(r?.regions).toBe(3);expect(r?.limitation).toContain('independent playtesting')});
it('rejects changed ArtBible even with a matching palette',async()=>{const root=await project();await writeFile(join(root,'.noobi/art-bible.json'),art+'\n');await expect(checkGameAssembly(root)).rejects.toThrow('ArtBible changed')});
it('rejects off-palette UI and missing scene instead of silently assembling',async()=>{const root=await project();const a=fixture();a.style.colors.border='#ffffff';await writeFile(join(root,'data/game-assembly.json'),JSON.stringify(a));await expect(checkGameAssembly(root)).rejects.toThrow('palette');await writeFile(join(root,'data/game-assembly.json'),JSON.stringify(fixture()));await rm(join(root,'ruins.tscn'));await expect(checkGameAssembly(root)).rejects.toThrow()});
it('leaves older projects without this opt-in profile alone',async()=>{const root=await mkdtemp(join(tmpdir(),'noobi-no-assembly-'));roots.push(root);expect(await checkGameAssembly(root)).toBeNull()});

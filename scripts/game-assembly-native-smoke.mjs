// Real macOS input against the authored three-region assembly. No permission changes or state injection.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const input=JSON.parse(await readFile('.noobi-private/stage-08/assembly-latest.json','utf8'));
const out=join(input.out,'native-'+Date.now());await mkdir(out);
const helper=join(out,'input');await exec('/usr/bin/xcrun',['swiftc',resolve('scripts/native-game-input.swift'),'-o',helper]);
assert.equal((await exec(helper,[])).stdout.trim(),'trusted','Accessibility must already be granted');
const game=spawn('/opt/homebrew/bin/godot',['--path',input.out,'--','--noobi-assembly-demo','--noobi-native-probe'],{stdio:['ignore','pipe','pipe']});
let packet,buffer='',log='',errors='',exited=false;const steps=[],keyTrace=[];
game.on('exit',()=>exited=true);game.stderr.on('data',d=>errors+=d);
game.stdout.on('data',d=>{buffer+=d;log+=d;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.startsWith('ASSEMBLY_PROBE ')){try{packet=JSON.parse(line.slice(15))}catch{}}}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(predicate,label)=>{for(let i=0;i<100;i++){if(exited)throw Error('Native fixture exited');if(packet&&predicate(packet))return packet;await sleep(100)}throw Error(label+' timed out: '+JSON.stringify(packet))};
const keys={Enter:36,Escape:53,Tab:48,W:13,D:2,F:3,E:14,S:1,Space:49};
const key=async(name,ms=60)=>{keyTrace.push({name,ms,before:structuredClone(packet)});await exec(helper,[String(game.pid),String(keys[name]),String(Math.round(ms))]);await sleep(350)};
const click=async text=>{for(let i=0;i<25;i++){if(packet?.buttons.some(b=>b.text===text&&b.focused&&!b.disabled)){await key('Enter');return}await key('Tab')}throw Error('Cannot focus '+text)};
const capture=async(name,screen)=>{await wait(p=>p.screen===screen,name);const copy=structuredClone(packet);steps.push({name,...copy});await writeFile(join(out,name+'.json'),JSON.stringify(copy,null,2));return copy};
let passed=false;
const moveZ=async target=>{for(let i=0;i<20;i++){const diff=packet.position[2]-target;if(Math.abs(diff)<0.25)return;await key(diff>0?'W':'S',Math.max(20,Math.min(140,Math.abs(diff)/5*900)))}throw Error('Did not reach z '+target)};
try{
 await capture('01-title','title');
 if(process.argv.includes('--continue-only')) {
  await click('继续冒险');await capture('02-ending-after-new-process','victory');assert.equal(packet.completed.length,3);assert.equal(packet.inventory.gem,2);
 } else {
  await click('开始新的冒险');if(packet.screen==='confirm_new')await click('确认新冒险');
  await capture('02-start','playing');assert.equal(packet.region,'camp');
  await moveZ(-1.7);await key('E');await wait(p=>p.event==='invalid','locked exit');await capture('03-locked-exit','playing');assert.equal(packet.completed.length,0);
  await moveZ(.4);await key('E');await wait(p=>p.completed.length===1,'quest one');await capture('04-first-objective','playing');assert.equal(packet.inventory.key,1);
  await key('E');assert.equal(packet.inventory.key,1);
  await moveZ(-1.7);await key('E');await wait(p=>p.region==='ruins','region two');await capture('05-region-two','playing');assert.equal(packet.inventory.key,0);
  await moveZ(.4);await key('E');await wait(p=>p.completed.length===2,'quest two');await capture('06-second-objective','playing');
  await key('Escape');const paused=await capture('07-pause','pause');await key('W',200);assert.deepEqual(packet.position,paused.position);
  await click('保存进度');await click('返回标题');await wait(p=>p.screen==='confirm_title','confirm title');await click('不保存，返回标题');await wait(p=>p.screen==='title','title');
  await click('继续冒险');await capture('08-region-checkpoint-restored','playing');assert.equal(packet.region,'ruins');assert.equal(packet.completed.length,2);assert(packet.position[2]>2);
  await moveZ(.4);await key('E');assert.equal(packet.inventory.gem,1);
  await moveZ(-1.7);await key('E');await wait(p=>p.region==='summit','region three');await capture('09-region-three','playing');
  await moveZ(.4);await key('E');await capture('10-victory','victory');assert.equal(packet.completed.length,3);assert.equal(packet.inventory.gem,2);
  await click('保存这段旅程');await click('返回标题');await wait(p=>p.screen==='confirm_title','ending title');await click('不保存，返回标题');await wait(p=>p.screen==='title','title');
  await click('继续冒险');await capture('11-ending-save-restored','victory');assert.equal(packet.completed.length,3);
 }
 assert(!/SCRIPT ERROR|Parse Error|ERROR:/u.test(errors));passed=true;
}catch(e){errors+='\n'+e.message;console.error(e.message)}finally{
 if(!exited){game.kill('SIGTERM');await sleep(500)}
 await writeFile(join(out,'key-trace.json'),JSON.stringify(keyTrace,null,2));await writeFile(join(out,'runtime.log'),log);await writeFile(join(out,'errors.log'),errors);
 await writeFile(join(out,'report.json'),JSON.stringify({passed,steps,project:input.out,scope:'Real macOS keyboard; authored three-region assembly with third-party character and formal UI, not autonomous game or clean device'},null,2));
 console.log(JSON.stringify({passed,out,steps:steps.length}));process.exitCode=passed?0:1;
}

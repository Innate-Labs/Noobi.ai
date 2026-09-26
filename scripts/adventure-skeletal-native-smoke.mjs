// Real macOS input against the new skeletal/UI integration. No permission changes or state injection.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile);
const input=JSON.parse(await readFile('.noobi-private/stage-07/skeletal-latest.json','utf8'));
const out=join(input.out,'native-'+Date.now());await mkdir(out);
const helper=join(out,'input');await exec('/usr/bin/xcrun',['swiftc',resolve('scripts/native-game-input.swift'),'-o',helper]);
assert.equal((await exec(helper,[])).stdout.trim(),'trusted','Accessibility must already be granted');
const game=spawn('/opt/homebrew/bin/godot',['--path',input.out,'--','--noobi-rig-demo','--noobi-native-probe'],{stdio:['ignore','pipe','pipe']});
let packet,buffer='',log='',errors='',exited=false;const steps=[],keyTrace=[];
game.on('exit',()=>exited=true);game.stderr.on('data',d=>errors+=d);
game.stdout.on('data',d=>{buffer+=d;log+=d;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.startsWith('RIG_DEMO ')){try{packet=JSON.parse(line.slice(9))}catch{}}}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(predicate,label)=>{for(let i=0;i<100;i++){if(exited)throw Error('Native fixture exited');if(packet&&predicate(packet))return packet;await sleep(100)}throw Error(label+' timed out: '+JSON.stringify(packet))};
const keys={Enter:36,Escape:53,Tab:48,W:13,D:2,F:3,Space:49};
const key=async(name,ms=60)=>{keyTrace.push({name,ms,before:structuredClone(packet)});await exec(helper,[String(game.pid),String(keys[name]),String(ms)]);await sleep(350)};
const click=async text=>{for(let i=0;i<25;i++){if(packet?.buttons.some(b=>b.text===text&&b.focused&&!b.disabled)){await key('Enter');return}await key('Tab')}throw Error('Cannot focus '+text)};
const capture=async(name,screen)=>{await wait(p=>p.screen===screen,name);const copy=structuredClone(packet);steps.push({name,...copy});await writeFile(join(out,name+'.json'),JSON.stringify(copy,null,2));return copy};
let passed=false;
try{
 await capture('01-title','title');
 if(process.argv.includes('--continue-only')) {
 await click('继续冒险');await capture('02-completed-save-restored','victory');assert.equal(packet.targetHealth,0);
 } else {
 await click('开始新的冒险');await sleep(350);if(packet.screen==='confirm_new')await click('确认新冒险');
 await capture('02-start','playing');assert.equal(packet.targetHealth,3);
 const x=packet.actorPosition[0];await key('D',180);await wait(p=>p.actorPosition[0]>x+0.15,'movement');
 await capture('03-physical-movement','playing');await key('Space');await wait(p=>p.actorPosition[1]>0.15&&p.animation==='jump','skeletal jump');
 await capture('04-skeletal-jump','playing');await sleep(1200);
 await key('W',180);await key('F');await wait(p=>p.targetHealth===2,'delayed strike');await capture('05-punch-damage','playing');
 await key('Escape');const paused=await capture('06-pause','pause');await sleep(250);assert.equal(packet.clipTime,paused.clipTime);
 await click('保存进度');await sleep(300);await click('继续冒险');await capture('07-resume','playing');await sleep(1000);
 await key('F');await wait(p=>p.targetHealth===1,'second strike');await sleep(1100);await key('F');
 await capture('08-victory','victory');assert.equal(packet.targetHealth,0);
 await click('返回标题');await wait(p=>p.screen==='confirm_title','title confirmation');await click('不保存，返回标题');await wait(p=>p.screen==='title','title');
 await click('继续冒险');await capture('09-restore','playing');assert.equal(packet.targetHealth,2);assert.equal(packet.actorHealth,3);
 await sleep(1100);await key('F');await wait(p=>p.targetHealth===1,'restored second strike');await sleep(1100);await key('F');await wait(p=>p.screen==='victory','restored victory');
 await click('保存这段旅程');await sleep(350);
 await click('返回标题');await wait(p=>p.screen==='confirm_title','saved ending title confirmation');await click('不保存，返回标题');await wait(p=>p.screen==='title','saved ending title');
 await click('继续冒险');await capture('10-completed-save-restored','victory');assert.equal(packet.targetHealth,0);
 }
 assert(!/SCRIPT ERROR|Parse Error|ERROR:/u.test(errors));passed=true;
}catch(e){errors+='\n'+e.message;console.error(e.message)}finally{
 if(!exited){game.kill('SIGTERM');await sleep(500)}
 await writeFile(join(out,'key-trace.json'),JSON.stringify(keyTrace,null,2));await writeFile(join(out,'runtime.log'),log);await writeFile(join(out,'errors.log'),errors);
 await writeFile(join(out,'report.json'),JSON.stringify({passed,steps,project:input.out,scope:'Real macOS keyboard; third-party character plus formal UI engineering scene, not autonomous game or clean device'},null,2));
 console.log(JSON.stringify({passed,out,steps:steps.length}));process.exitCode=passed?0:1;
}

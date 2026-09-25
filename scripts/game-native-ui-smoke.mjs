// Sends real macOS keyboard events only to the exported engineering game's PID.
// Requires already-granted Accessibility permission; never opens a permission prompt.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
const exec=promisify(execFile),input=JSON.parse(await readFile('.noobi-private/stage-10/native-latest.json','utf8'));
const out=join(input.out,'native-input-'+Date.now());await mkdir(out);
const helper=join(out,'input');await exec('/usr/bin/xcrun',['swiftc',resolve('scripts/native-game-input.swift'),'-o',helper]);
assert.equal((await exec(helper,[])).stdout.trim(),'trusted','Accessibility must already be granted');
const game=spawn(input.executable,['--','--noobi-native-probe'],{cwd:join(input.out,'empty-cwd'),stdio:['ignore','pipe','pipe']});
let packet,buffer='',log='',errors='',exited=false;const steps=[];
game.on('exit',()=>{exited=true});game.stderr.on('data',d=>{errors+=d});
game.stdout.on('data',d=>{buffer+=d;log+=d;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(line.startsWith('NOOBI_RUNTIME ')){try{packet=JSON.parse(line.slice(14))}catch{}}}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(predicate,label)=>{for(let i=0;i<100;i++){if(exited)throw Error('Native game exited');if(packet&&predicate(packet))return packet;await sleep(100)}throw Error(label+' timed out; last state '+packet?.state?.state)};
const keys={Enter:36,Escape:53,Tab:48,W:13,E:14,I:34,J:38,M:46,S:1};
const key=async(k,ms=80)=>{if(exited)throw Error('Native game exited');await exec(helper,[String(game.pid),String(keys[k]),String(ms)]);await sleep(350)};
const click=async text=>{for(let i=0;i<20;i++){if(packet?.nodes.some(n=>n.class==='Button'&&n.text===text&&n.visible&&n.focused&&!n.disabled)){await key('Enter');return}await key('Tab')}throw Error('Keyboard could not focus '+text)};
const capture=async(name,state)=>{await wait(p=>p.state.state===state,name);await writeFile(join(out,name+'.json'),JSON.stringify(packet,null,2));steps.push({name,state:packet.state,paused:packet.paused});return structuredClone(packet)};
let passed=false;
try{
 await sleep(800);
 await exec(helper,[String(game.pid),'56','20']);
 await capture('01-title','title');
 if(process.argv.includes('--continue-only')) {
  await click('继续冒险'); await capture('02-restored','playing'); assert.equal(packet.state.collected,1);
 } else {
 await click('开始新的冒险');await sleep(350);if(packet.state.state==='confirm_new')await click('确认新冒险');
 await capture('02-start','playing');await key('W',400);await key('E');await wait(p=>p.state.collected===1,'pickup');
 await key('I');const inventory=await capture('03-inventory','inventory');assert.ok(inventory.nodes.some(n=>n.visible&&String(n.text).includes('草原遗物  x1')));await key('Escape');
 await key('J');await capture('04-quests','quests');await key('Escape');await key('M');await capture('05-map','map');await key('Escape');
 await key('Escape');await capture('06-pause','pause');await click('保存进度');await click('设置');await capture('07-settings','settings');await key('Escape');await click('继续冒险');await capture('08-resume','playing');
 await key('S',2300);await capture('09-failure','failure');await click('从检查点重试');await capture('10-retry','playing');assert.equal(packet.state.collected,1);
 await key('W',1450);await key('E');await capture('11-victory','victory');
 await click('返回标题');await capture('12-confirm-title','confirm_title');await click('不保存，返回标题');await capture('13-title','title');
 await click('继续冒险');await capture('14-continue','playing');assert.equal(packet.state.collected,1);
 }
 assert.ok(!/SCRIPT ERROR|Parse Error|ERROR:/u.test(errors));passed=true;
}catch(e){errors+='\n'+e.message;console.error(e.message)}finally{
 if(!exited){game.kill('SIGTERM');await sleep(500)}
 await writeFile(join(out,'runtime.log'),log);await writeFile(join(out,'errors.log'),errors);
 await writeFile(join(out,'result.json'),JSON.stringify({passed,steps,nativeManifest:input.manifest,mode:process.argv.includes('--continue-only')?'new-process-continue':'full-input-flow',scope:'Actual macOS keyboard; engineering scene only; not new OS user or multi-device acceptance'},null,2));
 console.log(JSON.stringify({passed,out,steps:steps.length}));process.exitCode=passed?0:1;
}

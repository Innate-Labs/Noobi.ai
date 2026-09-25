import { app, BrowserWindow } from 'electron';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { VideoReferenceStore, videoCommand } from '../dist/main/videoReferenceStore.js';
import { VisualReferenceStore } from '../dist/main/visualReferenceStore.js';
import { decodeVisualReference } from '../dist/main/visualReferenceDecoder.js';

// Six deliberately simple engineering videos with known state and real input
// dispatch. These test understanding, not the quality of generated games.
app.on('window-all-closed', () => {});
const output = resolve(process.argv[2] ?? '.noobi-private/stage-04');
const ffmpeg = process.env.NOOBI_FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  await app.whenReady(); await mkdir(output, { recursive: true });
  const window = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
  let code = 0;
  try {
    const records = [];
    for (const mode of ['play', 'cut', 'occlusion', 'fast', 'replay', 'cutscene']) {
      const mp4 = join(output, `${mode}.mp4`);
      const existing = await readFile(mp4).catch(() => null);
      if (!existing) {
        await window.loadURL('data:text/html,<canvas width="640" height="360"></canvas>');
        await window.webContents.executeJavaScript(`(()=>{
          const mode=${JSON.stringify(mode)},c=document.querySelector('canvas'),x=c.getContext('2d');
          let px=70,stamina=100,rolling=0,keys=new Set(),started=performance.now(),history=[];
          window.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Space'&&stamina>=30){rolling=mode==='fast'?0.12:0.7;stamina-=30}});window.addEventListener('keyup',e=>keys.delete(e.code));
          const chunks=[],stream=c.captureStream(20),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});rec.ondataavailable=e=>chunks.push(e.data);window.recorded=new Promise(resolve=>rec.onstop=async()=>{const b=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));stream.getTracks().forEach(t=>t.stop());resolve(btoa(s))});
          let last=performance.now(),cut=false;const draw=()=>{const now=performance.now(),dt=Math.min(.1,(now-last)/1000),t=(now-started)/1000;last=now;
            if(mode!=='cutscene'){if(keys.has('ArrowRight'))px+=dt*(rolling>0?240:65);px=Math.min(560,px);rolling=Math.max(0,rolling-dt);stamina=Math.min(100,stamina+dt*4)}
            if(mode==='cut'&&t>3&&!cut){px=80;cut=true}
            history.push(px);if(mode==='replay'&&t>3)px=history[Math.max(0,Math.floor(60-(t-3)*20))]??px;
            x.fillStyle=mode==='cut'&&t>3?'#496e8e':'#243b32';x.fillRect(0,0,640,360);x.fillStyle='#aacb99';x.fillRect(20,260,600,75);
            x.fillStyle='#f2db7e';x.fillRect(550,205,25,55);x.fillStyle=rolling>0?'#ffd97c':'#c9a5ef';x.beginPath();x.ellipse(px,235,rolling>0?24:15,rolling>0?12:24,0,0,7);x.fill();
            if(mode==='occlusion'&&t>2.5&&t<5){x.fillStyle='#658ca5';x.fillRect(160,160,280,110)}
            x.fillStyle='#f7efd9';x.font='18px sans-serif';x.fillText('ENGINEERING VIDEO FIXTURE',20,27);x.fillText('STAMINA',20,64);x.fillStyle='#1e2724';x.fillRect(125,45,204,24);x.fillStyle='#8ac76b';x.fillRect(127,47,stamina*2,20);
            x.fillStyle='#fff';x.fillText('Goal: reach the golden gate',20,100);if(rolling>0)x.fillText('ROLL',px-20,185);
            if(mode==='replay'&&t>3){x.fillStyle='#e4a461';x.fillText('REPLAY',490,60)}
            if(mode==='cutscene'){x.fillStyle='#111';x.fillRect(0,120,640,50);x.fillStyle='#fff';x.fillText('CUTSCENE - The forest gate awakens',100,153)}
            if(t<6)requestAnimationFrame(draw);else rec.stop();
          };rec.start();draw();return true;
        })()`);
        window.webContents.debugger.attach('1.3');
        await pause(900);
        await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
        await pause(600);
        await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await pause(100);
        await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await pause(2500);
        await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
        window.webContents.debugger.detach();
        const encoded = await window.webContents.executeJavaScript('window.recorded');
        const webm = join(output, `${mode}.webm`); await writeFile(webm, Buffer.from(encoded, 'base64'));
        await videoCommand(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', mp4]);
      }
      const images = new VisualReferenceStore(join(output, 'images'), decodeVisualReference);
      const videos = new VideoReferenceStore(join(output, 'videos'), images);
      const source = await videos.import(mp4);
      const clip = await videos.prepare({ sourceId: source.id, start: 0, end: Math.min(6, source.duration), requestId: randomUUID() });
      assert.ok(clip.frames.length >= 4 && clip.frames.length <= 10);
      const cached = await videos.prepare({ sourceId: source.id, start: 0, end: clip.end, requestId: randomUUID() });
      assert.deepEqual(cached.frames, clip.frames);
      records.push({ mode, path: mp4, clip, annotation: { engineered: true, duration: 6, rightInputAt: 0.9, rollInputAt: 1.5, staminaCostKnownToFixture: 30, limitation: 'Exact keys/cost are fixture ground truth, not confirmed from video. Modes cut/replay/cutscene deliberately alter visible state.' } });
      await writeFile(join(output, 'clips.json'), JSON.stringify(records, null, 2));
      console.log('VIDEO_DECODE_CACHE_PASS', mode, clip.frames.length);
    }
    const images = new VisualReferenceStore(join(output, 'images'), decodeVisualReference);
    const videos = new VideoReferenceStore(join(output, 'videos'), images);
    const source = await videos.import(join(output, 'play.mp4'));
    await assert.rejects(videos.prepare({ sourceId: source.id, start: 0, end: 121, requestId: randomUUID() }));
    const requestId = randomUUID();
    const processing = videos.prepare({ sourceId: source.id, start: 0.1, end: 5, requestId });
    videos.cancel(requestId); await assert.rejects(processing); assert.equal(videos.jobs.size, 0);
    const broken = join(output, 'damaged.mp4'); await writeFile(broken, (await readFile(join(output, 'play.mp4'))).subarray(0, 48));
    await assert.rejects(videos.import(broken)); assert.equal(videos.jobs.size, 0);
    const long = join(output, 'duration-control.mp4');
    await videoCommand(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180:r=10:d=121', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', long]);
    const longSource = await videos.import(long);
    await assert.rejects(videos.prepare({ sourceId: longSource.id, start: 0, end: 121, requestId: randomUUID() }));
    const maximum = await videos.prepare({ sourceId: longSource.id, start: 0, end: 120, requestId: randomUUID() });
    assert.equal(maximum.end, 120); assert.ok(maximum.frames.at(-1).time > 119);
    await mkdir(join(output, 'videos/.processing-interrupted'), { recursive: true }); await videos.init();
    assert.equal((await readdir(join(output, 'videos'))).some(name => name.startsWith('.processing-')), false);
    console.log('VIDEO_CANCEL_CORRUPT_RANGE_RECOVERY_PASS');
    console.log('VIDEO_REFERENCE_NATIVE_SMOKE_OK');
  } catch (error) { console.error(error); code = 1; }
  finally { if (!window.isDestroyed()) window.destroy(); }
  app.exit(code);
}
void main();

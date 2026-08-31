import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { app, BrowserWindow, nativeImage } from 'electron';

import {
  GameplayExperienceEvaluator,
  sampledBitmapDifference,
} from '../dist/main/gameplayExperienceEvaluator.js';
import { PreviewServer } from '../dist/main/previewServer.js';

const smokeResultPath = process.env.NOOBI_PLAYTEST_SMOKE_RESULT?.trim() || null;
const keepSmokeWorkspace = process.env.NOOBI_PLAYTEST_SMOKE_KEEP === '1';

const GAME_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Noobi playtest smoke</title>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#071018}
    body{display:grid;place-items:center}canvas{width:min(92vw,900px);height:auto;border:2px solid #5de4a3}
  </style>
</head>
<body>
  <canvas id="game" data-game-root width="900" height="520"></canvas>
  <script>
    const canvas = document.querySelector('#game');
    const context = canvas.getContext('2d');
    const keys = new Set();
    let mode = 'ready';
    let x = 150;
    let pulse = 0;
    let animationTime = 0;
    let previous = performance.now();

    function tokens(event) {
      return [event.code, event.key, typeof event.key === 'string' ? event.key.toUpperCase() : ''];
    }

    addEventListener('keydown', (event) => {
      for (const token of tokens(event)) keys.add(token);
      if (keys.has('Enter')) mode = 'playing';
      if ((keys.has('Space') || keys.has(' ')) && mode === 'playing') pulse = 1;
      if (keys.has('Escape') && mode !== 'ready') mode = mode === 'paused' ? 'playing' : 'paused';
      if (keys.has('KeyR') || keys.has('R')) { mode = 'ready'; x = 150; pulse = 0; animationTime = 0; }
    });
    addEventListener('keyup', (event) => {
      for (const token of tokens(event)) keys.delete(token);
    });

    function frame(now) {
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      if (mode === 'playing') {
        animationTime += delta;
        if (keys.has('KeyD') || keys.has('D')) x = Math.min(790, x + 260 * delta);
        pulse = Math.max(0, pulse - delta * 1.5);
      }
      context.fillStyle = '#071018';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = '#173042';
      for (let gx = 0; gx < canvas.width; gx += 50) {
        context.beginPath(); context.moveTo(gx, 0); context.lineTo(gx, canvas.height); context.stroke();
      }
      for (let gy = 0; gy < canvas.height; gy += 50) {
        context.beginPath(); context.moveTo(0, gy); context.lineTo(canvas.width, gy); context.stroke();
      }
      const bob = mode === 'playing' ? Math.sin(animationTime * 7) * 7 : 0;
      context.fillStyle = '#5de4a3';
      context.beginPath(); context.arc(x, 280 + bob, 24, 0, Math.PI * 2); context.fill();
      if (pulse > 0) {
        context.strokeStyle = '#ffbc42'; context.lineWidth = 8;
        context.beginPath(); context.arc(x, 280 + bob, 36 + (1 - pulse) * 80, 0, Math.PI * 2); context.stroke();
      }
      context.fillStyle = '#f6f2e8'; context.font = '700 24px sans-serif';
      context.fillText('NOOBI PLAYTEST', 28, 44);
      context.font = '18px sans-serif';
      context.fillText('Enter start · D move · Space action · Esc pause · R restart', 28, 78);
      if (mode !== 'playing') {
        context.fillStyle = 'rgba(0,0,0,.72)'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = mode === 'paused' ? '#ffbc42' : '#5de4a3';
        context.font = '800 54px sans-serif'; context.textAlign = 'center';
        context.fillText(mode === 'paused' ? 'PAUSED' : 'PRESS ENTER', canvas.width / 2, canvas.height / 2);
        context.textAlign = 'left';
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  </script>
</body>
</html>`;

function playtestManifest(now) {
  const screenChange = (description, baselineStepId) => ({
    kind: 'screen-change', description, baselineStepId,
  });
  return {
    schemaVersion: 1,
    updatedAt: now,
    engine: 'web',
    entrypoint: { path: 'dist/index.html', readyTimeoutMs: 5_000 },
    actions: {
      start: { inputs: [{ type: 'key', code: 'Enter', holdMs: 60 }] },
      move: { inputs: [{ type: 'key', code: 'KeyD', holdMs: 650 }] },
      primary: { inputs: [{ type: 'key', code: 'Space', holdMs: 60 }] },
      pause: { inputs: [{ type: 'key', code: 'Escape', holdMs: 60 }] },
      restart: { inputs: [{ type: 'key', code: 'KeyR', holdMs: 60 }] },
    },
    journey: [
      { id: 'launch-ready', action: 'launch', inputs: [{ type: 'wait', ms: 250 }], observe: [{ kind: 'canvas-not-blank', description: 'Ready frame is visible.' }], capture: '00-launch.png' },
      { id: 'start-game', action: 'start', inputs: [], observe: [screenChange('Game enters play.', 'launch-ready')], capture: '01-start.png' },
      { id: 'move-player', action: 'move', inputs: [], observe: [screenChange('Player moves.', 'start-game')], capture: '02-move.png' },
      { id: 'primary-action', action: 'primary', inputs: [], observe: [screenChange('Action pulse appears.', 'move-player')], capture: '03-action.png' },
      { id: 'pause-game', action: 'pause', inputs: [], observe: [screenChange('Pause overlay appears.', 'primary-action')], capture: '04-pause.png' },
      { id: 'resume-game', action: 'pause', inputs: [], observe: [screenChange('Game resumes.', 'pause-game')], capture: '05-resume.png' },
      { id: 'restart-game', action: 'restart', inputs: [], observe: [screenChange('Ready state is restored.', 'resume-game')], capture: '06-restart.png' },
    ],
    success: [
      { kind: 'canvas-not-blank', description: 'Restarted game remains visible.' },
      screenChange('Movement changed the game state.', 'start-game'),
      screenChange('Primary action was visible.', 'move-player'),
    ],
    limits: { maxRunMs: 30_000, stepTimeoutMs: 5_000 },
  };
}

let root;
const preview = new PreviewServer();

try {
  await app.whenReady();
  root = await mkdtemp(join(tmpdir(), 'noobi-playtest-smoke-'));
  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, '.noobi'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), GAME_HTML);
  await writeFile(
    join(root, '.noobi/playtest.json'),
    `${JSON.stringify(playtestManifest(new Date().toISOString()), null, 2)}\n`,
  );
  const previewUrl = await preview.start('playtest-smoke', root, {
    directory: 'dist',
    sourceFallback: false,
    sourceAssetOverlay: false,
  });
  const evaluator = new GameplayExperienceEvaluator({
    createWindow: (options) => new BrowserWindow(options),
    decodePng: (png) => nativeImage.createFromBuffer(png),
  });
  const report = await evaluator.evaluate({
    projectRoot: root,
    previewUrl,
    expectedEngine: 'web',
    expectedEntrypoint: 'dist/index.html',
  });
  const persisted = JSON.parse(await readFile(join(root, report.reportPath), 'utf8'));
  if (report.verdict !== 'pass' || persisted.verdict !== 'pass') {
    const startImage = nativeImage.createFromBuffer(await readFile(join(
      root,
      'artifacts/playtest/latest/screenshots/01-start.png',
    )));
    const moveImage = nativeImage.createFromBuffer(await readFile(join(
      root,
      'artifacts/playtest/latest/screenshots/02-move.png',
    )));
    const pngSize = startImage.getSize(1);
    const pngDifference = sampledBitmapDifference(
      Buffer.from(startImage.toBitmap({ scaleFactor: 1 })),
      Buffer.from(moveImage.toBitmap({ scaleFactor: 1 })),
      pngSize.width,
      pngSize.height,
    );
    throw new Error(`Playtest smoke failed (PNG diff ${JSON.stringify(pngDifference)}): ${JSON.stringify(report)}`);
  }
  if (smokeResultPath) {
    await writeFile(smokeResultPath, `${JSON.stringify({ ok: true, root, report }, null, 2)}\n`);
  }
  process.stdout.write(`Noobi experience playtest passed: ${report.score}/100 · ${report.durationMs}ms\n`);
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  if (smokeResultPath) {
    await writeFile(smokeResultPath, `${JSON.stringify({ ok: false, root, error: message }, null, 2)}\n`).catch(() => undefined);
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await preview.stopAll().catch(() => undefined);
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  if (root && !keepSmokeWorkspace) await rm(root, { recursive: true, force: true });
  app.quit();
}

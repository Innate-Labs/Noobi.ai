const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const out = path.resolve(process.env.NOOBI_QUALITY_OUTPUT || '.tmp/quality-browser-smoke');
fs.mkdirSync(out, { recursive: true });
app.setName('Noobi Quality Verification');
app.setPath('userData', path.join(out, 'browser-profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const { GameplayExperienceEvaluator } = await import('../dist/main/gameplayExperienceEvaluator.js');
  const { PreviewServer } = await import('../dist/main/previewServer.js');
  const config = JSON.parse(fs.readFileSync(process.env.NOOBI_QUALITY_INPUT, 'utf8'));
  const previews = new PreviewServer();
  try {
    const previewUrl = await previews.start('quality-smoke', config.snapshotRoot, {
      directory: 'build/web', sourceFallback: false, sourceAssetOverlay: false, hideGodotSplash: true,
    });
    const evaluator = new GameplayExperienceEvaluator({
      createWindow: (options) => new BrowserWindow(options),
      decodePng: (png) => nativeImage.createFromBuffer(png),
    });
    const report = await evaluator.evaluate({ projectRoot: config.projectRoot,
      manifestRoot: config.manifestRoot || config.snapshotRoot, previewUrl, expectedEngine: 'godot',
      expectedEntrypoint: 'build/web/index.html', build: config.build,
      interactionMode: config.interactionMode || 'real-time',
    });
    const packets = report.runtimeEvidence?.filter((e) => e.packet) ?? [];
    const summary = { verdict: report.verdict, checks: report.checks,
      runtimePackets: packets.length, errors: report.errors,
      findings: packets.flatMap((e) => e.packet.findings),
      evidence: path.join(config.projectRoot, report.reportPath) };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ verdict: report.verdict, runtimePackets: packets.length,
      errors: report.errors.length, result: path.join(out, 'result.json') }));
    if (!packets.length) throw new Error('No matching runtime packets were captured from the real Web export');
  } finally { await previews.stopAll(); }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1); });

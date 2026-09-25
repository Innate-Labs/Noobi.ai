// Bounded, isolated repair trial through the actual Noobi Harness and Godot
// services. No source is copied back automatically and no result is called an
// unassisted generation benchmark. Existing art only; music entitlement remains
// blocked and cannot be waived by this diagnostic.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const taskRoot = path.resolve('.tmp');
fs.mkdirSync(taskRoot, { recursive: true });
const output = fs.mkdtempSync(path.join(taskRoot, 'production-pilot-'));
const userData = path.resolve('.noobi-private/user-data');
const projects = JSON.parse(fs.readFileSync(path.join(userData, 'projects.json'), 'utf8'));
const original = (Array.isArray(projects) ? projects : projects.projects).find(p => p.id === '60e8486d-877d-4d06-8e8a-bc1308ab007a');
if (!original || original.status === 'running') throw Error('Pilot source is missing or has an active writer');
const project = { ...original, root: path.join(output, 'game') };
const skip = new Set(['.git', '.godot', 'artifacts', 'build', 'node_modules']);
const sourceRoot = process.env.NOOBI_QUALITY_SOURCE ? fs.realpathSync(process.env.NOOBI_QUALITY_SOURCE) : original.root;
fs.cpSync(sourceRoot, project.root, { recursive: true, filter: p => !skip.has(path.basename(p)) });
const privateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'noobi-production-auth-'));
fs.chmodSync(privateHome, 0o700);
fs.copyFileSync(path.join(userData, 'codex-home/auth.json'), path.join(privateHome, 'auth.json'));
fs.chmodSync(path.join(privateHome, 'auth.json'), 0o600);
app.setName('Noobi Production Verification');
app.setPath('userData', path.join(output, 'browser-profile'));
app.on('window-all-closed', () => {});
let stopProduction; let finished = false;
app.on('before-quit', event => {
  if (!finished && stopProduction) {
    event.preventDefault();
    fs.writeFileSync(path.join(output, 'quit-request.json'), JSON.stringify({ at: new Date().toISOString() }));
    void stopProduction();
  }
});
console.log(JSON.stringify({ started: true, output, projectRoot: project.root }));
app.whenReady().then(async () => {
  const { CodexAppServer } = await import('../dist/main/codexAppServer.js');
  const { GameHarness } = await import('../dist/main/gameHarness.js');
  const { GodotToolBroker, GODOT_DYNAMIC_TOOLS } = await import('../dist/main/godotToolBroker.js');
  const { GodotEnvironmentService } = await import('../dist/main/godotEnvironmentService.js');
  const { GodotBuildStore } = await import('../dist/main/production/godotBuildStore.js');
  const { buildGodotCandidate } = await import('../dist/main/production/godotBuilder.js');
  const { ProductionCheckpointStore } = await import('../dist/main/production/productionCheckpointStore.js');
  const { GameplayExperienceEvaluator } = await import('../dist/main/gameplayExperienceEvaluator.js');
  const { PreviewServer } = await import('../dist/main/previewServer.js');
  const { gameQualitySpec } = await import('../dist/main/production/gameQualitySpec.js');
  const { gameGoalFindings } = await import('../dist/main/quality/gameGoalEvidence.js');
  const { readVisualSample, visualSampleFindings } = await import('../dist/main/quality/visualSample.js');
  const { journeyFeedback } = await import('../dist/main/runtime/journeyFeedback.js');
  const { AssetStore } = await import('../dist/main/assetStore.js');
  const { ImageGenerationAttestationStore } = await import('../dist/main/imageGenerationAttestation.js');
  const { synchronizeWorkspaceHostPolicy } = await import('../dist/main/workspaceTemplate.js');
  const runtime = new CodexAppServer({ codexHome: privateHome });
  const harness = new GameHarness(runtime);
  stopProduction = () => harness.stop(project.id);
  const store = new GodotBuildStore(path.join(output, 'builds'));
  const checkpoints = new ProductionCheckpointStore(path.join(output, 'checkpoints'));
  const environment = new GodotEnvironmentService({ storageFile: path.join(userData, 'godot-environment.json') });
  const previews = new PreviewServer();
  const evaluator = new GameplayExperienceEvaluator({ createWindow: opts => new BrowserWindow(opts), decodePng: p => nativeImage.createFromBuffer(p) });
  const spec = gameQualitySpec(project);
  const threads = new Set(); let latestReport; let runningCheck;
  const log = value => fs.appendFileSync(path.join(output, 'events.jsonl'), JSON.stringify(value) + '\n');
  async function evaluate(signal) {
    if (runningCheck) return runningCheck;
    runningCheck = (async () => {
      const build = await buildGodotCandidate({ projectId: project.id, projectRoot: project.root, store, environment, signal, qualitySpec: spec });
      const previewUrl = await previews.start(project.id, build.root, { directory: 'build/web', sourceFallback: false, sourceAssetOverlay: false, hideGodotSplash: true });
      try {
        const report = await evaluator.evaluate({ projectRoot: project.root, manifestRoot: build.root, previewUrl, expectedEngine: 'godot',
          expectedEntrypoint: 'build/web/index.html', build: { buildId: build.record.buildId, sourceHash: build.record.sourceHash,
            artifactHash: build.record.artifactHash, testSuiteVersion: build.record.testSuiteVersion }, signal });
        await store.assertCurrent(build, signal); await store.verifyArtifacts(build); await store.recordReport(build, report);
        latestReport = report;
        log({ kind: 'host-evaluation', build: report.build, checks: report.checks, goals: gameGoalFindings(report, spec) });
        return report;
      } finally { await previews.stop(project.id); }
    })().finally(() => { runningCheck = undefined; });
    return runningCheck;
  }
  async function core(signal) {
    try {
      const report = await evaluate(signal);
      const findings = [...report.checks.filter(c => c.status === 'repair').map(c => `${c.label}: ${c.message}`), ...gameGoalFindings(report, spec)];
      if (report.verdict === 'pass' && !findings.length) await checkpoints.accept('core-loop', await store.latest(project.id));
      return { ok: report.verdict === 'pass' && !findings.length, findings };
    } catch (e) { if (signal.aborted) throw e; return { ok: false, findings: [String(e)] }; }
  }
  async function visual(signal, report) {
    try {
      report ||= await evaluate(signal);
      const build = await store.latest(project.id);
      const contract = await readVisualSample(build.root);
      const findings = [...report.checks.filter(c => c.status === 'repair').map(c => c.message), ...gameGoalFindings(report, spec), ...visualSampleFindings(contract, report)];
      return { ok: report.verdict === 'pass' && !findings.length, findings, sourceHash: build.record.sourceHash,
        buildId: build.record.buildId, artifactHash: build.record.artifactHash, evidencePath: report.reportPath };
    } catch (e) { if (signal.aborted) throw e; return { ok: false, findings: [String(e)] }; }
  }
  const broker = new GodotToolBroker({ server: runtime, resolveProject: async id => threads.has(id) ? project : null,
    check: async (p, mode, signal) => {
      if (mode === 'build') { const b = await buildGodotCandidate({ projectId: p.id, projectRoot: p.root, store, environment, signal, qualitySpec: spec }); return { ok: true, build: b.record }; }
      const report = await evaluate(signal);
      return { ok: report.verdict === 'pass' && !gameGoalFindings(report, spec).length, checks: report.checks,
        journey: journeyFeedback(report),
        goals: gameGoalFindings(report, spec), errors: report.errors, reportPath: report.reportPath,
        visualSample: await visual(signal, report) };
    } });
  runtime.on('serverRequest', request => {
    if (broker.handle(request)) return;
    log({ kind: 'unsupported-or-approval-request', method: request.method });
    if (request.method === 'item/tool/requestUserInput') runtime.respondToServerRequest(request.id, { answers: {} });
    else if (request.method === 'item/commandExecution/requestApproval' || request.method === 'item/fileChange/requestApproval') runtime.respondToServerRequest(request.id, { decision: 'decline' });
    else if (request.method === 'currentTime/read') runtime.respondToServerRequest(request.id, { currentTimeAt: Math.floor(Date.now()/1000) });
    else runtime.rejectServerRequest(request.id, -32601, 'This bounded existing-asset trial exposes only the Godot check tool; reuse the supplied assets.');
  });
  harness.on('thread', e => { if (e.role === 'implementer') threads.add(e.threadId); });
  harness.on('event', e => { log(e); if (/harness\/(?:core-loop|visual-sample|run)\//.test(e.method || '')) console.log(JSON.stringify({ method: e.method, message: e.message.slice(0, 500) })); });
  harness.on('state', e => log({ kind: 'state', ...e }));
  const timeout = setTimeout(() => { void harness.stop(project.id); }, 25*60*1000);
  try {
    await environment.init(); await synchronizeWorkspaceHostPolicy(project.root, project);
    const attestation = new ImageGenerationAttestationStore(path.join(userData, 'image-generation-attestations.json'));
    await attestation.init();
    const assets = await new AssetStore().list(project.id, project.root);
    const proof = await attestation.verify({ projectId: project.id, root: project.root, assets });
    if (!proof.ok) throw Error('Existing image provenance could not be verified: ' + proof.reason);
    const status = await runtime.start();
    const model = status.models.find(m => m.isDefault) || status.models[0];
    if (!model) throw Error('No model available');
    const skill = path.join(privateHome, 'skills/.system/imagegen/SKILL.md');
    const result = await harness.run({ projectId: project.id, cwd: project.root, model: model.model, effort: model.defaultEffort,
      prompt: project.idea + '\nThis is an assisted repair of an existing game, using existing art/SFX only. Preserve scope, do not start over. '
        + (process.env.NOOBI_QUALITY_SOURCE
          ? 'Continue this retained candidate: its real gameplay journey already passed all six runtime checks and reached damage, victory and post-win restart. Revalidate, preserve that loop and focus on the visual sample, consistent terrain, character and HUD, anchors, background seams and feedback. '
          : 'Known failures: HUD icon native minimum 384x512 instead of desired 42x56; missing heart glyph; background seams; current real input journey does not reach damage, victory or post-victory restart. ')
        + 'Repair actual route and journey without cheating or making walking alone win. '
        + 'Distinguish long safe and short risky routes. Use noobi_godot_check and inspect actual report/screenshots. '
        + 'The original MiniMax music request has a host-recorded 2153 entitlement failure (retryable=false). Do not retry or fabricate music; it remains externally blocked. '
        + 'This trial supplies only the Godot tool and existing assets. No new image/audio generation is in scope. Keep the existing media manifest and provenance.',
      dynamicTools: GODOT_DYNAMIC_TOOLS, imageGenerationSkill: { name: 'imagegen', path: skill },
      imageGenerationRequirement: { state: 'trusted-and-referenced', relativePath: proof.relativePath || assets.find(a => a.mimeType.startsWith('image/')).relativePath },
      audioGenerationRequirement: { state: 'fresh-generation-required' }, qualitySpecification: spec,
      validateCoreLoop: core, validateVisualSample: visual, workspaceFingerprint: () => store.fingerprint(project.root),
      acceptVisualSample: async e => { const b = await store.latest(project.id); await store.assertCurrent(b); if (b.record.buildId !== e.buildId) throw Error('Changed sample'); await checkpoints.accept('visual-sample', b); },
      externalBlockers: async () => ['MiniMax Music 2153: existing entitlement failure, no new service call attempted.'],
      validateHostDelivery: async signal => { const v = await visual(signal); return { ok: false, findings: [...v.findings, 'MINIMAX_MUSIC: 2153 entitlement remains blocked.'] }; },
    });
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ result, originalRoot: original.root, candidateRoot: project.root, autonomousCompleted: false }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ error: String(error), latestBuild: latestReport?.build,
      latestChecks: latestReport?.checks, core: await checkpoints.latest(project.id, 'core-loop'), visual: await checkpoints.latest(project.id, 'visual-sample'),
      candidateRoot: project.root, originalRoot: original.root, autonomousCompleted: false }, null, 2));
    console.log(JSON.stringify({ finished: true, error: String(error).slice(0, 1200), output }));
  } finally { finished = true; clearTimeout(timeout); broker.close(); await runtime.stop(); await previews.stopAll(); fs.rmSync(privateHome, { recursive: true, force: true }); }
}).then(() => app.exit(0)).catch(error => { fs.rmSync(privateHome, { recursive: true, force: true }); console.error(error); app.exit(1); });

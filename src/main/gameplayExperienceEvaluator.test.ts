import { EventEmitter } from 'node:events';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GameplayExperienceEvaluator,
  archiveLatestGameplayExperienceReport,
  parseLoopbackPreviewUrl,
  parseGameplayPlaytestManifest,
  readLatestGameplayExperienceReport,
  sampledBitmapDifference,
  type GameplayBrowserWindow,
  type GameplayBrowserWindowFactory,
  type GameplayCapturedImage,
  type GameplaySurfaceSnapshot,
  type GameplayWebContents,
} from './gameplayExperienceEvaluator.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('gameplay experience pure checks', () => {
  it('allows only credential-free HTTP loopback preview URLs', () => {
    expect(parseLoopbackPreviewUrl('http://127.0.0.1:43123/').origin).toBe('http://127.0.0.1:43123');
    expect(parseLoopbackPreviewUrl('http://localhost:9000/game').pathname).toBe('/game');
    expect(() => parseLoopbackPreviewUrl('https://127.0.0.1/game')).toThrow('HTTP loopback');
    expect(() => parseLoopbackPreviewUrl('http://example.com/game')).toThrow('127.0.0.1');
    expect(() => parseLoopbackPreviewUrl('http://user:secret@localhost/game')).toThrow('凭据');
    expect(() => parseLoopbackPreviewUrl('file:///tmp/game.html')).toThrow('HTTP loopback');
  });

  it('samples visible color changes while ignoring alpha-only noise', () => {
    const width = 12;
    const height = 12;
    const before = Buffer.alloc(width * height * 4, 0);
    const after = Buffer.from(before);
    after[0] = 80;
    after[(6 * width + 6) * 4 + 2] = 200;
    after[3] = 255;

    const changed = sampledBitmapDifference(before, after, width, height, 6);

    expect(changed.sampledPixels).toBe(4);
    expect(changed.changedPixelRatio).toBe(0.5);
    expect(changed.meanChannelDelta).toBeGreaterThan(0);
    const alphaOnly = Buffer.from(before);
    alphaOnly[3] = 255;
    expect(sampledBitmapDifference(before, alphaOnly, width, height, 6).changedPixelRatio).toBe(0);
  });

  it('rejects executable and path-escaping fields before the browser can run them', () => {
    const manifest = validManifest();
    expect(() => parseGameplayPlaytestManifest({ ...manifest, command: 'open /tmp' })).toThrow('不允许');
    expect(() => parseGameplayPlaytestManifest({
      ...manifest,
      entrypoint: { ...manifest.entrypoint, path: '../outside.html' },
    })).toThrow('逃逸');
    expect(() => parseGameplayPlaytestManifest({
      ...manifest,
      journey: manifest.journey.map((step, index) => index === 0
        ? { ...step, inputs: [{ type: 'key', code: 'Unidentified', holdMs: 1 }] }
        : step),
    })).toThrow('KeyboardEvent.code');
  });

  it('accepts only bounded look and drag inputs with exact fields', () => {
    const manifest = validManifest() as any;
    manifest.limits.stepTimeoutMs = 5_000;
    manifest.actions.move.inputs = [
      { type: 'look', deltaX: 240, deltaY: -90, durationMs: 480 },
    ];
    manifest.actions.primary.inputs = [
      {
        type: 'drag',
        fromXRatio: 0.1,
        fromYRatio: 0.2,
        toXRatio: 0.9,
        toYRatio: 0.8,
        button: 0,
        durationMs: 640,
      },
    ];

    const parsed = parseGameplayPlaytestManifest(manifest);

    expect(parsed.actions.move.inputs[0]).toEqual({
      type: 'look',
      deltaX: 240,
      deltaY: -90,
      durationMs: 480,
    });
    expect(parsed.actions.primary.inputs[0]).toEqual(expect.objectContaining({
      type: 'drag',
      fromXRatio: 0.1,
      toXRatio: 0.9,
      durationMs: 640,
    }));

    const withUnknownField = structuredClone(manifest);
    withUnknownField.actions.move.inputs[0].script = 'window.close()';
    expect(() => parseGameplayPlaytestManifest(withUnknownField)).toThrow('不允许');

    const excessiveLook = structuredClone(manifest);
    excessiveLook.actions.move.inputs[0].deltaX = 1_001;
    expect(() => parseGameplayPlaytestManifest(excessiveLook)).toThrow('-1000 到 1000');

    const excessiveDrag = structuredClone(manifest);
    excessiveDrag.actions.primary.inputs[0].durationMs = 3_001;
    expect(() => parseGameplayPlaytestManifest(excessiveDrag)).toThrow('16 到 3000');

    const exceedsStepDeadline = structuredClone(manifest);
    exceedsStepDeadline.limits.stepTimeoutMs = 250;
    exceedsStepDeadline.actions.move.inputs[0].durationMs = 251;
    expect(() => parseGameplayPlaytestManifest(exceedsStepDeadline)).toThrow('16 到 250');
  });

  it('requires ordered adjacent baselines and collision-free lowercase evidence names', () => {
    const futureBaseline = structuredClone(validManifest());
    (futureBaseline.journey[2].observe as Array<Record<string, unknown>>)[0].baselineStepId = 'primary-action';
    expect(() => parseGameplayPlaytestManifest(futureBaseline)).toThrow('此前步骤');

    const nonAdjacentBaseline = structuredClone(validManifest());
    (nonAdjacentBaseline.journey[2].observe as Array<Record<string, unknown>>)[0].baselineStepId = 'launch-ready';
    expect(() => parseGameplayPlaytestManifest(nonAdjacentBaseline)).toThrow('紧邻步骤 start-game');

    const reservedCapture = structuredClone(validManifest());
    reservedCapture.journey[0].capture = 'before.png';
    expect(() => parseGameplayPlaytestManifest(reservedCapture)).toThrow('宿主保留');

    const caseAlias = structuredClone(validManifest());
    caseAlias.journey[0].capture = 'Launch.png';
    expect(() => parseGameplayPlaytestManifest(caseAlias)).toThrow('小写安全');

    const idAlias = structuredClone(validManifest());
    idAlias.journey[0].id = 'Launch-Ready';
    expect(() => parseGameplayPlaytestManifest(idAlias)).toThrow('小写稳定');

    for (const reservedId of ['success', 'post-action-settle']) {
      const reservedStep = structuredClone(validManifest());
      reservedStep.journey[0].id = reservedId;
      expect(() => parseGameplayPlaytestManifest(reservedStep)).toThrow('宿主保留步骤');
    }
  });
});

describe('GameplayExperienceEvaluator', () => {
  it('drives a hidden game with bounded inputs, captures evidence, and passes a responsive render', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    await seedLatestEvidence(root, 'previous-pass');
    const window = new MockWindow((index) => animatedFrame(index));
    const evaluator = evaluatorFor(window);

    const report = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41001/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    expect(report.verdict).toBe('pass');
    expect(report.score).toBe(100);
    expect(report.checks.map((check) => [check.id, check.status])).toEqual([
      ['load', 'pass'],
      ['runtime-errors', 'pass'],
      ['visible-surface', 'pass'],
      ['input-response', 'pass'],
      ['continuous-render', 'pass'],
      ['restart', 'pass'],
    ]);
    expect(report.actions).toHaveLength(validManifest().journey.length + 1);
    expect(report.observations).toContainEqual(expect.objectContaining({
      description: '暂停后玩法画面基本冻结',
      status: 'pass',
    }));
    expect(report.observations).toContainEqual(expect.objectContaining({
      description: '再次触发暂停键后恢复运行',
      status: 'pass',
    }));
    expect(report.temporalSamples.map((sample) => sample.action)).toEqual(['move', 'primary', 'resume']);
    expect(window.destroyed).toBe(true);
    expect(window.web.inputs.some((input) => input.type === 'mouseDown')).toBe(true);
    expect(window.web.inputs.some((input) => input.type === 'keyDown' && input.keyCode === 'W')).toBe(true);
    expect(window.web.inputs.some((input) => input.type === 'keyDown' && input.keyCode === 'Up')).toBe(true);
    const moveDown = window.web.timeline.indexOf('keyDown:W');
    const moveUp = window.web.timeline.indexOf('keyUp:W');
    expect(window.web.timeline.slice(moveDown + 1, moveUp).filter((event) => event === 'capture')).toHaveLength(2);
    const files = await readdir(join(root, 'artifacts/playtest/latest'));
    expect(files).toContain('report.json');
    const screenshots = await readdir(join(root, 'artifacts/playtest/latest/screenshots'));
    expect(screenshots).toContain('before.png');
    expect(screenshots).toContain('after.png');
    expect(screenshots).toContain('restart.png');
    const persisted = JSON.parse(await readFile(join(root, report.reportPath), 'utf8')) as { verdict: string };
    expect(persisted.verdict).toBe('pass');
    expect((await readLatestGameplayExperienceReport(root))?.verdict).toBe('pass');
    const history = await readdir(join(root, 'artifacts/playtest/history'));
    expect(history).toHaveLength(1);
    expect(JSON.parse(await readFile(
      join(root, 'artifacts/playtest/history', history[0], 'report.json'),
      'utf8',
    ))).toMatchObject({ summary: 'previous-pass' });
    expect(await readFile(
      join(root, 'artifacts/playtest/history', history[0], 'screenshots', 'previous.png'),
      'utf8',
    )).toBe('previous-pass-image');
    expect(await readdir(join(root, 'artifacts/playtest/staging'))).toEqual([]);
  });

  it('dispatches look and drag as bounded multi-step mouse input', async () => {
    const root = await temporaryRoot();
    const manifest = validManifest() as any;
    manifest.actions.move.inputs = [
      { type: 'look', deltaX: 180, deltaY: -60, durationMs: 48 },
    ];
    manifest.actions.primary.inputs = [
      {
        type: 'drag',
        fromXRatio: 0.1,
        fromYRatio: 0.2,
        toXRatio: 0.9,
        toYRatio: 0.8,
        button: 0,
        durationMs: 48,
      },
    ];
    await mkdir(join(root, '.noobi'), { recursive: true });
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, '.noobi/playtest.json'), `${JSON.stringify(manifest)}\n`);
    await writeFile(join(root, 'dist/index.html'), '<!doctype html><canvas></canvas>');
    const window = new MockWindow((index) => animatedFrame(index));

    const report = await evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41014/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    const lookMoves = window.web.inputs.filter((input) =>
      input.type === 'mouseMove'
      && typeof input.movementX === 'number'
      && input.button === undefined);
    expect(lookMoves).toHaveLength(3);
    expect(lookMoves.reduce((sum, input) => sum + Number(input.movementX), 0)).toBe(180);
    expect(lookMoves.reduce((sum, input) => sum + Number(input.movementY), 0)).toBe(-60);

    const dragDown = window.web.inputs.find((input) => input.type === 'mouseDown');
    const dragMoves = window.web.inputs.filter((input) =>
      input.type === 'mouseMove' && input.button === 'left');
    const dragUp = window.web.inputs.find((input) => input.type === 'mouseUp');
    expect(dragDown).toMatchObject({ x: 90, y: 110, button: 'left' });
    expect(dragMoves).toHaveLength(3);
    expect(dragUp).toMatchObject({ x: 730, y: 410, button: 'left' });
    expect(report.temporalSamples.map((sample) => sample.action)).toEqual(['move', 'primary', 'resume']);
    expect(report.verdict).toBe('pass');
  });

  it('returns repair for console errors, static input, missing animation, and a dead restart', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    await seedLatestEvidence(root, 'previous-before-repair');
    const window = new MockWindow(() => solidFrame(0), () => {
      window.web.emit('console-message', {
        level: 'error',
        message: 'Uncaught TypeError: broken update loop',
        sourceId: 'http://127.0.0.1:41002/game.js',
        lineNumber: 42,
      });
    });
    const evaluator = evaluatorFor(window);

    const report = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://localhost:41002/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    expect(report.verdict).toBe('repair');
    expect(report.score).toBeLessThan(100);
    expect(report.checks.some((check) => check.status === 'repair')).toBe(true);
    expect(report.errors).toContainEqual(expect.objectContaining({
      kind: 'console',
      message: 'Uncaught TypeError: broken update loop',
      line: 42,
    }));
    expect(checkStatus(report, 'runtime-errors')).toBe('repair');
    expect(checkStatus(report, 'input-response')).toBe('repair');
    expect(checkStatus(report, 'continuous-render')).toBe('repair');
    expect(checkStatus(report, 'restart')).toBe('repair');
    expect(window.destroyed).toBe(true);
    expect((await readLatestGameplayExperienceReport(root))?.verdict).toBe('repair');
    const history = await readdir(join(root, 'artifacts/playtest/history'));
    expect(history).toHaveLength(1);
    expect(JSON.parse(await readFile(
      join(root, 'artifacts/playtest/history', history[0], 'report.json'),
      'utf8',
    ))).toMatchObject({ summary: 'previous-before-repair' });
    expect(await readdir(join(root, 'artifacts/playtest/staging'))).toEqual([]);
  });

  it('rejects static pose jumps when core actions have no temporal in-between frames', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const evaluator = evaluatorFor(new MockWindow((index) => staticJumpFrame(index)));

    const report = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41011/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    expect(report.verdict).toBe('repair');
    expect(report.temporalSamples.every((sample) => sample.changedPixelRatio === 0)).toBe(true);
    expect(checkStatus(report, 'continuous-render')).toBe('repair');
  });

  it('enforces the total timeout and destroys a preview that never finishes loading', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const window = new MockWindow(() => solidFrame(0));
    window.loadURL = async () => new Promise<void>(() => undefined);
    const evaluator = evaluatorFor(window);

    const report = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41003/',
      timeoutMs: 8,
    });

    expect(report.verdict).toBe('repair');
    expect(report.timedOut).toBe(true);
    expect(checkStatus(report, 'load')).toBe('repair');
    expect(report.errors).toContainEqual(expect.objectContaining({ kind: 'timeout', fatal: true }));
    expect(window.destroyed).toBe(true);
  });

  it('honors an external abort signal and immediately destroys the hidden window', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    await seedLatestEvidence(root, 'previous-before-cancel');
    const controller = new AbortController();
    const window = new MockWindow(() => solidFrame(0));
    window.loadURL = async () => {
      controller.abort();
      return new Promise<void>(() => undefined);
    };

    await expect(evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41012/',
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(window.destroyed).toBe(true);
    expect(await readLatestGameplayExperienceReport(root)).toMatchObject({
      verdict: 'pass',
      summary: 'previous-before-cancel',
    });
    expect(await readFile(
      join(root, 'artifacts/playtest/latest/screenshots/previous.png'),
      'utf8',
    )).toBe('previous-before-cancel-image');
    expect(await readdir(join(root, 'artifacts/playtest/staging'))).toEqual([]);
  });

  it('cleans a crashed run without replacing the previous latest evidence', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    await seedLatestEvidence(root, 'previous-before-crash');
    const evaluator = new GameplayExperienceEvaluator({
      createWindow: () => {
        throw new Error('BrowserWindow failed unexpectedly');
      },
    });

    await expect(evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41022/',
    })).rejects.toThrow('BrowserWindow failed unexpectedly');

    expect(await readLatestGameplayExperienceReport(root)).toMatchObject({
      verdict: 'pass',
      summary: 'previous-before-crash',
    });
    expect(await readFile(
      join(root, 'artifacts/playtest/latest/screenshots/previous.png'),
      'utf8',
    )).toBe('previous-before-crash-image');
    expect(await readdir(join(root, 'artifacts/playtest/staging'))).toEqual([]);
  });

  it('enforces stepTimeoutMs as a real per-step deadline', async () => {
    const root = await temporaryRoot();
    const manifest = validManifest() as any;
    manifest.limits.stepTimeoutMs = 250;
    for (const action of Object.values(manifest.actions) as Array<{ inputs: Array<Record<string, unknown>> }>) {
      for (const input of action.inputs) {
        if (input.type === 'key') input.holdMs = 0;
      }
    }
    await mkdir(join(root, '.noobi'), { recursive: true });
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, '.noobi/playtest.json'), `${JSON.stringify(manifest)}\n`);
    await writeFile(join(root, 'dist/index.html'), '<!doctype html><canvas></canvas>');
    const window = new MockWindow((index) => animatedFrame(index));
    const evaluator = new GameplayExperienceEvaluator({
      createWindow: () => window,
      sleep: async (milliseconds, signal) => {
        if (milliseconds <= 0) return;
        await new Promise<void>((_resolvePromise, rejectPromise) => {
          signal.addEventListener('abort', () => rejectPromise(signal.reason), { once: true });
        });
      },
    });

    const report = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41013/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 1,
      settleDelayMs: 0,
    });

    expect(report.verdict).toBe('repair');
    expect(report.errors).toContainEqual(expect.objectContaining({
      kind: 'timeout',
      message: expect.stringContaining('launch-ready'),
    }));
    expect(window.destroyed).toBe(true);
  });

  it('prevents navigation away from the exact preview origin', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const window = new MockWindow((index) => animatedFrame(index));
    const evaluator = evaluatorFor(window);
    await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41004/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });
    let prevented = false;
    window.web.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://example.com/steal');

    expect(prevented).toBe(true);
  });

  it('allows pointer lock only for the isolated preview origin and denies other permissions', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const window = new MockWindow((index) => animatedFrame(index));
    await evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41015/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    const permissionCheck = window.web.session.permissionCheckHandler!;
    expect(permissionCheck(
      window.web,
      'pointerLock',
      'http://127.0.0.1:41015',
      { requestingUrl: 'http://127.0.0.1:41015/game' },
    )).toBe(true);
    expect(permissionCheck(
      window.web,
      'pointerLock',
      'https://example.com',
      { requestingUrl: 'https://example.com/game' },
    )).toBe(false);
    expect(permissionCheck(
      window.web,
      'geolocation',
      'http://127.0.0.1:41015',
      { requestingUrl: 'http://127.0.0.1:41015/game' },
    )).toBe(false);

    let granted: boolean | undefined;
    window.web.session.permissionRequestHandler!(
      window.web,
      'pointerLock',
      (value) => { granted = value; },
      { requestingUrl: 'http://127.0.0.1:41015/game' },
    );
    expect(granted).toBe(true);
    window.web.session.permissionRequestHandler!(
      window.web,
      'media',
      (value) => { granted = value; },
      { requestingUrl: 'http://127.0.0.1:41015/game' },
    );
    expect(granted).toBe(false);
  });

  it('polls readiness until a visible, capturable game surface appears', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const window = new MockWindow((index) => animatedFrame(index));
    window.web.surfaceFailuresRemaining = 2;

    const report = await evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41009/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    expect(report.verdict).toBe('pass');
    expect(window.web.surfaceFailuresRemaining).toBe(0);
  });

  it('returns a repair report without creating a window when the manifest is missing', async () => {
    const root = await temporaryRoot();
    let created = false;
    const evaluator = new GameplayExperienceEvaluator({
      createWindow: () => {
        created = true;
        return new MockWindow(() => solidFrame(0));
      },
    });

    const report = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41005/',
    });

    expect(report.verdict).toBe('repair');
    expect(report.errors[0]).toMatchObject({ kind: 'configuration' });
    expect(created).toBe(false);
    expect(report.reportPath).toBe('artifacts/playtest/latest/report.json');
  });

  it('rejects manifest engine and entrypoint values that disagree with host expectations', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    let created = false;
    const evaluator = new GameplayExperienceEvaluator({
      createWindow: () => {
        created = true;
        return new MockWindow(() => solidFrame(0));
      },
    });

    const engineMismatch = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41016/',
      expectedEngine: 'godot',
    });
    expect(engineMismatch.verdict).toBe('repair');
    expect(engineMismatch.errors[0]).toMatchObject({
      kind: 'configuration',
      message: expect.stringContaining('宿主项目引擎'),
    });

    const entrypointMismatch = await evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41016/',
      expectedEngine: 'web',
      expectedEntrypoint: 'dist/alternate.html',
    });
    expect(entrypointMismatch.verdict).toBe('repair');
    expect(entrypointMismatch.errors[0]).toMatchObject({
      kind: 'configuration',
      message: expect.stringContaining('宿主正式入口'),
    });
    expect(created).toBe(false);
  });

  it('interrupts a hung capture at the per-step deadline and destroys the window', async () => {
    const root = await temporaryRoot();
    const manifest = validManifest() as any;
    manifest.limits.stepTimeoutMs = 250;
    for (const action of Object.values(manifest.actions) as Array<{ inputs: Array<Record<string, unknown>> }>) {
      for (const input of action.inputs) {
        if (input.type === 'key') input.holdMs = 0;
      }
    }
    await mkdir(join(root, '.noobi'), { recursive: true });
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, '.noobi/playtest.json'), `${JSON.stringify(manifest)}\n`);
    await writeFile(join(root, 'dist/index.html'), '<!doctype html><canvas></canvas>');
    const window = new MockWindow((index) => animatedFrame(index));
    const capturePage = window.web.capturePage.bind(window.web);
    window.web.capturePage = async () => {
      if (window.web.captureCount >= 3) return new Promise<GameplayCapturedImage>(() => undefined);
      return capturePage();
    };
    const startedAt = Date.now();

    const report = await evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41017/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(report.errors).toContainEqual(expect.objectContaining({
      kind: 'timeout',
      message: expect.stringContaining('launch-ready'),
    }));
    expect(window.destroyed).toBe(true);
  });

  it('does not treat baseline background animation as working player controls', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);

    const report = await evaluatorFor(new MockWindow((index) => backgroundOnlyFrame(index))).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41018/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    expect(report.verdict).toBe('repair');
    expect(report.score).toBeLessThan(100);
    expect(checkStatus(report, 'input-response')).toBe('repair');
    expect(checkStatus(report, 'continuous-render')).toBe('repair');
  });

  it('caps hostile console error floods and terminates the hidden renderer', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const window = new MockWindow((index) => animatedFrame(index), () => {
      for (let index = 0; index < 150; index += 1) {
        window.web.emit('console-message', {
          level: 'error',
          message: `hostile error ${index}`,
          sourceId: 'http://127.0.0.1:41019/game.js',
          lineNumber: index,
        });
      }
    });

    const report = await evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41019/',
      initialDelayMs: 0,
    });

    expect(report.verdict).toBe('repair');
    expect(report.errors).toHaveLength(100);
    expect(report.droppedErrors).toBe(50);
    expect(window.destroyed).toBe(true);
  });

  it('deduplicates repeated diagnostics while counting every dropped error', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    const window = new MockWindow((index) => animatedFrame(index), () => {
      for (let index = 0; index < 150; index += 1) {
        window.web.emit('console-message', {
          level: 'error',
          message: 'same hostile error',
          sourceId: 'http://127.0.0.1:41020/game.js',
          lineNumber: 9,
        });
      }
    });

    const report = await evaluatorFor(window).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41020/',
      initialDelayMs: 0,
    });

    expect(report.errors).toHaveLength(1);
    expect(report.droppedErrors).toBe(149);
    expect(window.destroyed).toBe(true);
  });

  it('refuses to follow a pre-existing report symlink outside the project', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeManifest(root);
    await mkdir(join(root, 'artifacts/playtest/latest/screenshots'), { recursive: true });
    const outsideFile = join(outside, 'outside-report.json');
    await writeFile(outsideFile, 'do-not-overwrite');
    await symlink(outsideFile, join(root, 'artifacts/playtest/latest/report.json'));
    const evaluator = evaluatorFor(new MockWindow((index) => animatedFrame(index)));

    await expect(evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41006/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    })).rejects.toThrow();

    expect(await readFile(outsideFile, 'utf8')).toBe('do-not-overwrite');
  });

  it('refuses a screenshot symlink and leaves its outside target untouched', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeManifest(root);
    await mkdir(join(root, 'artifacts/playtest/latest/screenshots'), { recursive: true });
    const outsideFile = join(outside, 'outside-image.png');
    await writeFile(outsideFile, 'do-not-overwrite');
    await symlink(outsideFile, join(root, 'artifacts/playtest/latest/screenshots/before.png'));
    const evaluator = evaluatorFor(new MockWindow((index) => animatedFrame(index)));

    await expect(evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41007/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    })).rejects.toThrow('符号链接');

    expect(await readFile(outsideFile, 'utf8')).toBe('do-not-overwrite');
    expect(await readdir(join(root, 'artifacts/playtest/staging'))).toEqual([]);
  });

  it('refuses a pre-existing hard-linked report instead of truncating its inode', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeManifest(root);
    await mkdir(join(root, 'artifacts/playtest/latest/screenshots'), { recursive: true });
    const outsideFile = join(outside, 'outside-hardlink.json');
    await writeFile(outsideFile, 'do-not-overwrite');
    await link(outsideFile, join(root, 'artifacts/playtest/latest/report.json'));
    const evaluator = evaluatorFor(new MockWindow((index) => animatedFrame(index)));

    await expect(evaluator.evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41008/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    })).rejects.toThrow('硬链接');

    expect(await readFile(outsideFile, 'utf8')).toBe('do-not-overwrite');
  });

  it('atomically archives latest host evidence before a new harness run', async () => {
    const root = await temporaryRoot();
    await writeManifest(root);
    await evaluatorFor(new MockWindow((index) => animatedFrame(index))).evaluate({
      projectRoot: root,
      previewUrl: 'http://127.0.0.1:41010/',
      initialDelayMs: 0,
      keyHoldMs: 0,
      actionDelayMs: 0,
      settleDelayMs: 0,
    });

    await archiveLatestGameplayExperienceReport(root);

    expect(await readLatestGameplayExperienceReport(root)).toBeNull();
    const history = await readdir(join(root, 'artifacts/playtest/history'));
    expect(history).toHaveLength(1);
    expect(JSON.parse(await readFile(
      join(root, 'artifacts/playtest/history', history[0], 'report.json'),
      'utf8',
    ))).toMatchObject({ version: 1, verdict: 'pass' });
    expect(await readdir(join(root, 'artifacts/playtest/latest/screenshots'))).toEqual([]);
  });
});

class MockWebContents extends EventEmitter implements GameplayWebContents {
  readonly inputs: Array<Record<string, unknown>> = [];
  readonly timeline: string[] = [];
  readonly #frame: (index: number) => GameplayCapturedImage;
  captureCount = 0;
  muted = false;
  surfaceFailuresRemaining = 0;
  readonly session = new MockSession();

  constructor(frame: (index: number) => GameplayCapturedImage) {
    super();
    this.#frame = frame;
  }

  setWindowOpenHandler(_handler: (details: { url: string }) => { action: 'deny' }): void {}

  async executeJavaScript<T>(code: string, _userGesture?: boolean): Promise<T> {
    if (code.includes("const selectors = 'canvas")) {
      if (this.surfaceFailuresRemaining > 0) {
        this.surfaceFailuresRemaining -= 1;
        return { ...SURFACE, found: false, bounds: null, selector: null, tagName: null } as T;
      }
      return SURFACE as T;
    }
    if (code.includes('document.createTreeWalker') || code.includes('document.querySelector')) return true as T;
    return SURFACE as T;
  }

  async capturePage(): Promise<GameplayCapturedImage> {
    this.timeline.push('capture');
    const image = this.#frame(this.captureCount);
    this.captureCount += 1;
    return image;
  }

  sendInputEvent(input: Record<string, unknown>): void {
    this.inputs.push(input);
    this.timeline.push(`${String(input.type)}:${String(input.keyCode ?? input.button ?? '')}`);
  }

  setAudioMuted(muted: boolean): void {
    this.muted = muted;
  }
}

class MockSession {
  permissionRequestHandler?: (
    webContents: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details?: { requestingUrl?: string },
  ) => void;
  permissionCheckHandler?: (
    webContents: unknown | null,
    permission: string,
    requestingOrigin: string,
    details: { requestingUrl?: string },
  ) => boolean;

  setPermissionRequestHandler(handler: NonNullable<MockSession['permissionRequestHandler']>): void {
    this.permissionRequestHandler = handler;
  }

  setPermissionCheckHandler(handler: NonNullable<MockSession['permissionCheckHandler']>): void {
    this.permissionCheckHandler = handler;
  }
}

class MockWindow extends EventEmitter implements GameplayBrowserWindow {
  readonly web: MockWebContents;
  readonly webContents: MockWebContents;
  destroyed = false;
  readonly #onLoad?: () => void;

  constructor(frame: (index: number) => GameplayCapturedImage, onLoad?: () => void) {
    super();
    this.web = new MockWebContents(frame);
    this.webContents = this.web;
    this.#onLoad = onLoad;
  }

  async loadURL(_url: string): Promise<void> {
    this.#onLoad?.();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

const SURFACE: GameplaySurfaceSnapshot = {
  found: true,
  selector: 'canvas',
  tagName: 'canvas',
  bounds: { x: 10, y: 10, width: 800, height: 500 },
  viewport: { width: 1024, height: 640 },
  visibleCanvasCount: 1,
  visibleCandidateCount: 1,
};

function evaluatorFor(window: GameplayBrowserWindow): GameplayExperienceEvaluator {
  const createWindow: GameplayBrowserWindowFactory = () => window;
  return new GameplayExperienceEvaluator({
    createWindow,
    sleep: async (_milliseconds, signal) => {
      if (signal.aborted) {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }
    },
  });
}

function animatedFrame(index: number): GameplayCapturedImage {
  const visualIndex = index === 2 ? 1 : index === 12 ? 11 : index;
  const width = 24;
  const height = 18;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4;
      bitmap[offset] = (x * 17 + visualIndex * 31) % 256;
      bitmap[offset + 1] = (y * 23 + visualIndex * 47) % 256;
      bitmap[offset + 2] = ((x + y) * 11 + visualIndex * 59) % 256;
      bitmap[offset + 3] = 255;
    }
  }
  return fakeImage(bitmap, width, height);
}

function solidFrame(value: number): GameplayCapturedImage {
  const width = 24;
  const height = 18;
  const bitmap = Buffer.alloc(width * height * 4, value);
  for (let offset = 3; offset < bitmap.length; offset += 4) bitmap[offset] = 255;
  return fakeImage(bitmap, width, height);
}

function staticJumpFrame(index: number): GameplayCapturedImage {
  const visualIndexByCapture = [0, 0, 0, 1, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7];
  const visualIndex = visualIndexByCapture[index] ?? visualIndexByCapture.at(-1)!;
  const width = 24;
  const height = 18;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4;
      bitmap[offset] = (x * 13 + visualIndex * 41) % 256;
      bitmap[offset + 1] = (y * 19 + visualIndex * 37) % 256;
      bitmap[offset + 2] = ((x + y) * 7 + visualIndex * 53) % 256;
      bitmap[offset + 3] = 255;
    }
  }
  return fakeImage(bitmap, width, height);
}

function backgroundOnlyFrame(index: number): GameplayCapturedImage {
  const width = 24;
  const height = 18;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4;
      bitmap[offset] = (x * 17) % 256;
      bitmap[offset + 1] = (y * 23) % 256;
      bitmap[offset + 2] = ((x + y) * 11) % 256;
      bitmap[offset + 3] = 255;
    }
  }
  bitmap[0] = (index * 37) % 256;
  bitmap[1] = (index * 53) % 256;
  bitmap[2] = (index * 71) % 256;
  return fakeImage(bitmap, width, height);
}

function fakeImage(bitmap: Buffer, width = 24, height = 18): GameplayCapturedImage {
  return {
    getSize: () => ({ width, height }),
    toBitmap: () => Buffer.from(bitmap),
    toPNG: () => Buffer.from(`mock-png-${bitmap[0]}`),
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-playtest-'));
  temporaryRoots.push(root);
  return root;
}

async function writeManifest(root: string): Promise<void> {
  await mkdir(join(root, '.noobi'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(join(root, '.noobi/playtest.json'), `${JSON.stringify(validManifest(), null, 2)}\n`);
  await writeFile(join(root, 'dist/index.html'), '<!doctype html><canvas></canvas>');
}

async function seedLatestEvidence(root: string, marker: string): Promise<void> {
  const latest = join(root, 'artifacts/playtest/latest');
  await mkdir(join(latest, 'screenshots'), { recursive: true });
  const report = {
    version: 1,
    verdict: 'pass',
    score: 100,
    checkedAt: '2026-08-29T06:00:00.000Z',
    reportPath: 'artifacts/playtest/latest/report.json',
    summary: marker,
    checks: [
      { id: 'load', label: '加载与启动', status: 'pass', message: 'ok' },
      { id: 'runtime-errors', label: '运行稳定性', status: 'pass', message: 'ok' },
      { id: 'visible-surface', label: '可见游戏画面', status: 'pass', message: 'ok' },
      { id: 'input-response', label: '操作反馈', status: 'pass', message: 'ok' },
      { id: 'continuous-render', label: '持续渲染与动画', status: 'pass', message: 'ok' },
      { id: 'restart', label: '重新开始', status: 'pass', message: 'ok' },
    ],
  };
  await writeFile(join(latest, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(latest, 'screenshots/previous.png'), `${marker}-image`);
}

function validManifest(): Record<string, unknown> & {
  entrypoint: { path: string; readyTimeoutMs: number };
  journey: Array<Record<string, unknown>>;
} {
  const key = (code: string, holdMs = 0) => ({ type: 'key', code, holdMs });
  return {
    schemaVersion: 1,
    updatedAt: '2026-08-30T07:00:00.000Z',
    engine: 'web',
    entrypoint: { path: 'dist/index.html', readyTimeoutMs: 1_000 },
    actions: {
      start: { inputs: [key('Enter')] },
      move: { inputs: [key('KeyW', 650), key('KeyA'), key('KeyS'), key('KeyD'), key('ArrowUp')] },
      primary: { inputs: [key('Space', 300), { type: 'pointer', xRatio: 0.5, yRatio: 0.5, button: 0 }] },
      pause: { inputs: [key('Escape')] },
      restart: { inputs: [key('KeyR')] },
    },
    journey: [
      {
        id: 'launch-ready',
        action: 'launch',
        inputs: [],
        observe: [{ kind: 'canvas-not-blank', description: '游戏画面不是空白' }],
        capture: 'launch.png',
      },
      {
        id: 'start-game',
        action: 'start',
        inputs: [],
        observe: [{ kind: 'screen-change', description: '开始后进入游戏', baselineStepId: 'launch-ready' }],
        capture: 'start.png',
      },
      {
        id: 'move-player',
        action: 'move',
        inputs: [],
        observe: [{ kind: 'screen-change', description: '角色发生移动', baselineStepId: 'start-game' }],
        capture: 'move.png',
      },
      {
        id: 'primary-action',
        action: 'primary',
        inputs: [],
        observe: [{ kind: 'screen-change', description: '主要动作有反馈', baselineStepId: 'move-player' }],
        capture: 'primary.png',
      },
      {
        id: 'pause-game',
        action: 'pause',
        inputs: [],
        observe: [{ kind: 'text-visible', description: '暂停菜单可见', value: '暂停' }],
        capture: 'pause.png',
      },
      {
        id: 'resume-game',
        action: 'pause',
        inputs: [],
        observe: [{ kind: 'screen-change', description: '恢复后游戏继续', baselineStepId: 'pause-game' }],
        capture: 'resume.png',
      },
      {
        id: 'restart-game',
        action: 'restart',
        inputs: [],
        observe: [{ kind: 'screen-change', description: '重新开始回到可玩状态', baselineStepId: 'resume-game' }],
        capture: 'restart.png',
      },
    ],
    success: [
      { kind: 'canvas-not-blank', description: '最终游戏画面有效' },
      { kind: 'element-visible', description: '游戏根节点仍然可见', value: 'canvas' },
    ],
    limits: { maxRunMs: 5_000, stepTimeoutMs: 1_000 },
  };
}

function checkStatus(
  report: Awaited<ReturnType<GameplayExperienceEvaluator['evaluate']>>,
  id: string,
): string | undefined {
  return report.checks.find((check) => check.id === id)?.status;
}

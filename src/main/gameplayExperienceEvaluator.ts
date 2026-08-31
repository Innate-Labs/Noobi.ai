import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, rm, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import type {
  BrowserWindow as ElectronBrowserWindow,
  BrowserWindowConstructorOptions,
  KeyboardInputEvent,
  MouseInputEvent,
  MouseWheelInputEvent,
  Rectangle,
} from 'electron';
import type {
  GameplayExperienceCheck,
  GameplayExperienceReport as SharedGameplayExperienceReport,
} from '../shared/contracts.js';

const DEFAULT_INITIAL_DELAY_MS = 350;
const DEFAULT_KEY_HOLD_MS = 90;
const DEFAULT_ACTION_DELAY_MS = 140;
const DEFAULT_SETTLE_DELAY_MS = 450;
const MAX_TOTAL_TIMEOUT_MS = 180_000;
const MAX_INPUTS_PER_ACTION = 12;
const MAX_RUNTIME_ERRORS = 100;
const INPUT_CHANGE_RATIO = 0.002;
const CONTINUOUS_CHANGE_RATIO = 0.00035;
const PAUSE_FROZEN_MAX_RATIO = 0.015;
const CORE_TEMPORAL_SAMPLE_MS = 140;
const MIN_HELD_TEMPORAL_MS = 240;
const PIXEL_CHANNEL_CHANGE = 14;

export interface GameplayExperienceRuntimeError {
  kind: 'configuration' | 'load' | 'renderer-gone' | 'unresponsive' | 'console' | 'capture' | 'timeout';
  message: string;
  source?: string;
  line?: number;
  fatal: boolean;
}

export interface GameplaySurfaceSnapshot {
  found: boolean;
  selector: string | null;
  tagName: string | null;
  bounds: Rectangle | null;
  viewport: { width: number; height: number };
  visibleCanvasCount: number;
  visibleCandidateCount: number;
}

export type GameplayActionRole = 'start' | 'move' | 'primary' | 'pause' | 'restart' | 'other';

export type GameplayPlaytestInput =
  | { type: 'key'; code: string; holdMs: number }
  | { type: 'pointer'; xRatio: number; yRatio: number; button: 0 | 1 | 2 }
  | { type: 'look'; deltaX: number; deltaY: number; durationMs: number }
  | {
    type: 'drag';
    fromXRatio: number;
    fromYRatio: number;
    toXRatio: number;
    toYRatio: number;
    button: 0 | 1 | 2;
    durationMs: number;
  }
  | { type: 'wait'; ms: number };

export type GameplayObservationKind =
  | 'canvas-not-blank'
  | 'screen-change'
  | 'text-visible'
  | 'element-visible';

export interface GameplayPlaytestObservation {
  kind: GameplayObservationKind;
  description: string;
  value?: string;
  baselineStepId?: string;
}

export type GameplayJourneyAction =
  | 'launch'
  | 'start'
  | 'move'
  | 'primary'
  | 'pause'
  | 'restart'
  | 'wait';

export interface GameplayPlaytestJourneyStep {
  id: string;
  action: GameplayJourneyAction;
  inputs: readonly GameplayPlaytestInput[];
  observe: readonly GameplayPlaytestObservation[];
  capture: string;
}

export interface GameplayPlaytestManifest {
  schemaVersion: 1;
  updatedAt: string;
  engine: string;
  entrypoint: { path: string; readyTimeoutMs: number };
  actions: Record<'start' | 'move' | 'primary' | 'pause' | 'restart', {
    inputs: readonly GameplayPlaytestInput[];
  }>;
  journey: readonly GameplayPlaytestJourneyStep[];
  success: readonly GameplayPlaytestObservation[];
  limits: { maxRunMs: number; stepTimeoutMs: number };
}

/**
 * A parsed, host-approved action from `.noobi/playtest.json`. Only the finite
 * input vocabulary above is accepted; no JavaScript or workspace command can
 * be supplied through this structure.
 */
export interface GameplayExperienceAction {
  id: string;
  label: string;
  role: GameplayActionRole;
  inputs: readonly GameplayPlaytestInput[];
  waitAfterMs?: number;
}

export interface GameplayActionObservation {
  id: string;
  label: string;
  role: GameplayActionRole;
  screenshotPath: string | null;
  changedPixelRatio: number;
  meanChannelDelta: number;
  sampledPixels: number;
}

export interface GameplayObservationResult {
  stepId: string;
  kind: GameplayObservationKind;
  description: string;
  status: 'pass' | 'repair';
  message: string;
}

export interface GameplayJourneyStepResult {
  id: string;
  action: GameplayJourneyAction;
  screenshotPath: string | null;
  durationMs: number;
  observations: GameplayObservationResult[];
}

export interface GameplayTemporalSample {
  stepId: string;
  action: 'move' | 'primary' | 'resume';
  screenshotPath: string;
  changedPixelRatio: number;
  meanChannelDelta: number;
  sampledPixels: number;
}

export interface GameplayExperienceReport extends SharedGameplayExperienceReport {
  version: 1;
  durationMs: number;
  surface: GameplaySurfaceSnapshot | null;
  actions: GameplayActionObservation[];
  journey: GameplayJourneyStepResult[];
  observations: GameplayObservationResult[];
  temporalSamples: GameplayTemporalSample[];
  screenshots: {
    before: string | null;
    idle: string | null;
    after: string | null;
    action: string[];
  };
  errors: GameplayExperienceRuntimeError[];
  droppedErrors: number;
  timedOut: boolean;
  entrypoint?: string;
}

export interface GameplayExperienceEvaluationOptions {
  projectRoot: string;
  previewUrl: string;
  expectedEngine?: 'web' | 'godot';
  expectedEntrypoint?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  initialDelayMs?: number;
  keyHoldMs?: number;
  actionDelayMs?: number;
  settleDelayMs?: number;
}

export interface GameplayCapturedImage {
  getSize(scaleFactor?: number): { width: number; height: number };
  toBitmap(options?: { scaleFactor?: number }): Buffer;
  toPNG(): Buffer;
  crop?(rectangle: Rectangle): GameplayCapturedImage;
}

export interface GameplayWebContents {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void;
  executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>;
  capturePage(): Promise<GameplayCapturedImage>;
  sendInputEvent(event: KeyboardInputEvent | MouseInputEvent | MouseWheelInputEvent): void;
  setAudioMuted?(muted: boolean): void;
  session?: {
    webRequest?: {
      onBeforeRequest(
        filter: { urls: string[] },
        listener: (
          details: { url: string },
          callback: (response: { cancel: boolean }) => void,
        ) => void,
      ): void;
    };
    setPermissionRequestHandler?(
      handler: (
        webContents: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details?: { requestingUrl?: string },
      ) => void,
    ): void;
    setPermissionCheckHandler?(
      handler: (
        webContents: unknown | null,
        permission: string,
        requestingOrigin: string,
        details: { requestingUrl?: string },
      ) => boolean,
    ): void;
    on?(
      event: 'will-download',
      listener: (event: unknown, item: { cancel(): void }) => void,
    ): unknown;
  };
}

export interface GameplayBrowserWindow {
  readonly webContents: GameplayWebContents;
  loadURL(url: string): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  isDestroyed(): boolean;
  destroy(): void;
}

export type GameplayBrowserWindowFactory = (
  options: BrowserWindowConstructorOptions,
) => GameplayBrowserWindow | ElectronBrowserWindow;

export interface GameplayExperienceEvaluatorDependencies {
  createWindow: GameplayBrowserWindowFactory;
  /** Re-decodes capturePage PNG bytes into an immutable bitmap. Electron's
   * capture NativeImage can otherwise expose a stale compositor bitmap while
   * toPNG already contains the current frame on HiDPI/offscreen renderers. */
  decodePng?: (png: Buffer) => GameplayCapturedImage;
  now?: () => Date;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

export interface SampledBitmapDifference {
  changedPixelRatio: number;
  meanChannelDelta: number;
  sampledPixels: number;
}

interface CapturedFrame {
  image: GameplayCapturedImage;
  bitmap: Buffer;
  width: number;
  height: number;
  path: string;
}

interface EvaluationState {
  startedAt: number;
  projectRoot: string;
  screenshotDirectory: string;
  reportPath: string;
  errors: GameplayExperienceRuntimeError[];
  droppedErrors: number;
  errorFingerprints: Set<string>;
  screenshots: GameplayExperienceReport['screenshots'];
  actions: GameplayActionObservation[];
  journey: GameplayJourneyStepResult[];
  observations: GameplayObservationResult[];
  temporalSamples: GameplayTemporalSample[];
  framesByStepId: Map<string, CapturedFrame>;
  surface: GameplaySurfaceSnapshot | null;
  baselineDifference: SampledBitmapDifference | null;
  loadCompleted: boolean;
  loadDurationMs?: number;
  timedOut: boolean;
  entrypoint?: string;
}

interface StagedGameplayEvidence {
  runId: string;
  directory: string;
  screenshotDirectory: string;
  reportPath: string;
}

const SURFACE_INSPECTION_SCRIPT = `(() => {
  const selectors = 'canvas, [data-game-root], [data-game], #game, #game-root, #app, main';
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const candidates = Array.from(document.querySelectorAll(selectors));
  const visible = candidates.map((node) => {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const isVisible = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number.parseFloat(style.opacity || '1') > 0.02
      && rect.width >= 160
      && rect.height >= 90
      && rect.bottom > 0
      && rect.right > 0
      && rect.top < viewport.height
      && rect.left < viewport.width;
    const priority = node.hasAttribute('data-game-root') || node.hasAttribute('data-game')
      ? 0
      : node.tagName === 'CANVAS'
        ? 1
        : node.id === 'game' || node.id === 'game-root'
          ? 2
          : node.id === 'app'
            ? 3
            : 4;
    return { node, rect, isVisible, priority };
  }).filter((entry) => entry.isVisible);
  visible.sort((left, right) => left.priority - right.priority
    || (right.rect.width * right.rect.height) - (left.rect.width * left.rect.height));
  const selected = visible[0] || null;
  const selectorFor = (node) => {
    if (!node) return null;
    if (node.id) return '#' + node.id;
    if (node.hasAttribute('data-game-root')) return '[data-game-root]';
    if (node.hasAttribute('data-game')) return '[data-game]';
    return node.tagName.toLowerCase();
  };
  return {
    found: Boolean(selected),
    selector: selectorFor(selected && selected.node),
    tagName: selected ? selected.node.tagName.toLowerCase() : null,
    bounds: selected ? {
      x: selected.rect.x,
      y: selected.rect.y,
      width: selected.rect.width,
      height: selected.rect.height,
    } : null,
    viewport,
    visibleCanvasCount: visible.filter((entry) => entry.node.tagName === 'CANVAS').length,
    visibleCandidateCount: visible.length,
  };
})()`;

/** Validates that a preview is an HTTP loopback URL without embedded credentials. */
export function parseLoopbackPreviewUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('试玩地址不是有效 URL');
  }
  if (parsed.protocol !== 'http:') throw new Error('试玩只允许使用 HTTP loopback 地址');
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error('试玩只允许访问 127.0.0.1 或 localhost');
  }
  if (parsed.username || parsed.password) throw new Error('试玩地址不能包含凭据');
  return parsed;
}

export async function readGameplayPlaytestManifest(projectRoot: string): Promise<GameplayPlaytestManifest> {
  const root = await resolveSafeProjectRoot(projectRoot);
  const path = join(root, '.noobi', 'playtest.json');
  const text = await readBoundedNoFollowFile(path, 256 * 1024, root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error('缺少 .noobi/playtest.json 自动试玩配置');
    if (error.message.startsWith('试玩配置')) throw error;
    throw new Error(`无法安全读取 .noobi/playtest.json${error.code ? ` (${error.code})` : ''}`);
  });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('.noobi/playtest.json 不是有效 UTF-8 JSON');
  }
  const manifest = parseGameplayPlaytestManifest(value);
  await validateManifestAgainstWorkspace(root, manifest);
  return manifest;
}

export function parseGameplayPlaytestManifest(value: unknown): GameplayPlaytestManifest {
  const root = requireRecord(value, 'playtest');
  requireOnlyKeys(root, [
    'schemaVersion', 'updatedAt', 'engine', 'entrypoint', 'actions', 'journey', 'success', 'limits',
  ], 'playtest');
  if (root.schemaVersion !== 1) throw new Error('playtest.schemaVersion 必须是 1');
  const updatedAt = requireBoundedString(root.updatedAt, 'playtest.updatedAt', 64);
  if (Number.isNaN(Date.parse(updatedAt))) throw new Error('playtest.updatedAt 必须是 ISO-8601 时间');
  const engine = requireBoundedString(root.engine, 'playtest.engine', 16);
  if (engine !== 'web' && engine !== 'godot') throw new Error('playtest.engine 必须是 web 或 godot');

  const entrypointRecord = requireRecord(root.entrypoint, 'playtest.entrypoint');
  requireOnlyKeys(entrypointRecord, ['path', 'readyTimeoutMs'], 'playtest.entrypoint');
  const entrypoint = {
    path: validateProjectRelativeHtmlPath(
      requireBoundedString(entrypointRecord.path, 'playtest.entrypoint.path', 240),
    ),
    readyTimeoutMs: requireIntegerInRange(
      entrypointRecord.readyTimeoutMs,
      'playtest.entrypoint.readyTimeoutMs',
      1_000,
      30_000,
    ),
  };

  const limitsRecord = requireRecord(root.limits, 'playtest.limits');
  requireOnlyKeys(limitsRecord, ['maxRunMs', 'stepTimeoutMs'], 'playtest.limits');
  const limits = {
    maxRunMs: requireIntegerInRange(limitsRecord.maxRunMs, 'playtest.limits.maxRunMs', 5_000, 180_000),
    stepTimeoutMs: requireIntegerInRange(
      limitsRecord.stepTimeoutMs,
      'playtest.limits.stepTimeoutMs',
      250,
      30_000,
    ),
  };

  const actionsRecord = requireRecord(root.actions, 'playtest.actions');
  const actionNames = ['start', 'move', 'primary', 'pause', 'restart'] as const;
  requireOnlyKeys(actionsRecord, actionNames, 'playtest.actions');
  const actions = Object.fromEntries(actionNames.map((name) => {
    const actionRecord = requireRecord(actionsRecord[name], `playtest.actions.${name}`);
    requireOnlyKeys(actionRecord, ['inputs'], `playtest.actions.${name}`);
    const inputs = parseInputs(actionRecord.inputs, `playtest.actions.${name}.inputs`, limits.stepTimeoutMs, false);
    if (inputs.length === 0) throw new Error(`playtest.actions.${name}.inputs 不能为空`);
    return [name, { inputs }];
  })) as unknown as GameplayPlaytestManifest['actions'];

  if (!Array.isArray(root.journey) || root.journey.length === 0 || root.journey.length > 24) {
    throw new Error('playtest.journey 必须包含 1 到 24 个步骤');
  }
  const stepIds = new Set<string>(['launch']);
  const captures = new Set<string>();
  let previousStepId = 'launch';
  const journey = root.journey.map((rawStep, index) => {
    const path = `playtest.journey[${index}]`;
    const step = requireRecord(rawStep, path);
    requireOnlyKeys(step, ['id', 'action', 'inputs', 'observe', 'capture'], path);
    const id = requireIdentifier(step.id, `${path}.id`);
    if (id === 'success' || id === 'post-action-settle') {
      throw new Error(`${path}.id 与宿主保留步骤冲突：${id}`);
    }
    if (stepIds.has(id)) throw new Error(`${path}.id 重复：${id}`);
    const action = requireBoundedString(step.action, `${path}.action`, 16);
    if (!isJourneyAction(action)) throw new Error(`${path}.action 无效`);
    const inputs = parseInputs(step.inputs, `${path}.inputs`, limits.stepTimeoutMs, true);
    const observe = parseObservations(step.observe, `${path}.observe`, true);
    for (const observation of observe) {
      if (observation.baselineStepId && !stepIds.has(observation.baselineStepId)) {
        throw new Error(
          `${path} 的 screen-change baselineStepId 必须引用 launch 或此前步骤：${observation.baselineStepId}`,
        );
      }
    }
    if (
      (action === 'start' || action === 'move' || action === 'primary' || action === 'restart')
      && !observe.some((observation) =>
        observation.kind === 'screen-change' && observation.baselineStepId === previousStepId)
    ) {
      throw new Error(`${path} 的 ${action} 必须相对紧邻步骤 ${previousStepId} 声明 screen-change`);
    }
    const capture = requireSafeCaptureName(step.capture, `${path}.capture`);
    if (captures.has(capture)) throw new Error(`${path}.capture 重复：${capture}`);
    captures.add(capture);
    stepIds.add(id);
    previousStepId = id;
    return { id, action, inputs, observe, capture };
  });
  if (journey[0]?.action !== 'launch') throw new Error('playtest.journey 第一步必须是 launch');
  for (const requiredAction of ['launch', 'start', 'move', 'primary', 'pause', 'restart'] as const) {
    if (!journey.some((step) => step.action === requiredAction)) {
      throw new Error(`playtest.journey 缺少 ${requiredAction} 步骤`);
    }
  }
  if (journey.filter((step) => step.action === 'pause').length < 2) {
    throw new Error('playtest.journey 必须分别包含暂停和恢复两个 pause 步骤');
  }
  if (!Array.isArray(root.success) || root.success.length === 0 || root.success.length > 16) {
    throw new Error('playtest.success 必须包含 1 到 16 个可观察结果');
  }
  const success = parseObservations(root.success, 'playtest.success', false);
  for (const observation of success) {
    if (observation.baselineStepId && !stepIds.has(observation.baselineStepId)) {
      throw new Error(`screen-change baselineStepId 不存在：${observation.baselineStepId}`);
    }
  }
  return { schemaVersion: 1, updatedAt, engine, entrypoint, actions, journey, success, limits };
}

export async function readLatestGameplayExperienceReport(
  projectRoot: string,
): Promise<SharedGameplayExperienceReport | null> {
  const root = await resolveSafeProjectRoot(projectRoot);
  const path = join(root, 'artifacts', 'playtest', 'latest', 'report.json');
  let text: string;
  try {
    text = await readBoundedNoFollowFile(path, 1024 * 1024, root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return parseLatestGameplayExperienceReport(value);
}

export async function writeGameplayExperienceFailureReport(
  projectRoot: string,
  message: string,
): Promise<SharedGameplayExperienceReport> {
  const root = await resolveSafeProjectRoot(projectRoot);
  const staging = await createStagedGameplayEvidence(root);
  const safeMessage = sanitizeReportMessage(message, root);
  const report: SharedGameplayExperienceReport = {
    version: 1,
    verdict: 'repair',
    score: 0,
    checkedAt: new Date().toISOString(),
    reportPath: 'artifacts/playtest/latest/report.json',
    summary: safeMessage.slice(0, 500),
    checks: [
      { id: 'load', label: '加载与启动', status: 'repair', message: safeMessage.slice(0, 500) },
      { id: 'runtime-errors', label: '运行稳定性', status: 'skipped', message: '预览未启动，未执行运行检查。' },
      { id: 'visible-surface', label: '可见游戏画面', status: 'skipped', message: '预览未启动。' },
      { id: 'input-response', label: '操作反馈', status: 'skipped', message: '预览未启动。' },
      { id: 'continuous-render', label: '持续渲染与动画', status: 'skipped', message: '预览未启动。' },
      { id: 'restart', label: '重新开始', status: 'skipped', message: '预览未启动。' },
    ],
  };
  let published = false;
  try {
    await safeWriteProjectFile(root, staging.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await publishStagedGameplayEvidence(root, staging, report.checkedAt);
    published = true;
    return report;
  } finally {
    if (!published) await cleanupStagedGameplayEvidence(root, staging);
  }
}

export async function archiveLatestGameplayExperienceReport(projectRoot: string): Promise<void> {
  const root = await resolveSafeProjectRoot(projectRoot);
  const artifacts = join(root, 'artifacts');
  const playtest = join(artifacts, 'playtest');
  const latest = join(playtest, 'latest');
  for (const directory of [artifacts, playtest, latest]) {
    let metadata;
    try {
      metadata = await lstat(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('自动试玩 latest 路径不能是符号链接或非目录');
    }
  }
  await assertNoSymlinkPath(root, latest);
  await assertSafeEvidenceTree(root, latest, false);
  const previous = await readLatestGameplayExperienceReport(root).catch(() => null);
  const timestamp = safeHistoryTimestamp(previous?.checkedAt);
  const history = await ensureSafeDirectoryChain(root, ['artifacts', 'playtest', 'history']);
  const destination = join(history, `${timestamp}-${randomUUID().slice(0, 8)}`);
  assertPathInside(root, destination);
  await rename(latest, destination);
  await ensureSafeDirectoryChain(root, ['artifacts', 'playtest', 'latest', 'screenshots']);
}

/**
 * Compares raw BGRA/RGBA bitmaps on a fixed grid. Alpha is intentionally
 * ignored so transparent backing-store noise cannot fake visible movement.
 */
export function sampledBitmapDifference(
  before: Uint8Array,
  after: Uint8Array,
  width: number,
  height: number,
  sampleStride = 6,
): SampledBitmapDifference {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Bitmap dimensions must be positive integers');
  }
  const requiredBytes = width * height * 4;
  if (before.byteLength < requiredBytes || after.byteLength < requiredBytes) {
    throw new Error('Bitmap buffer is smaller than its dimensions');
  }
  const stride = Math.max(1, Math.floor(sampleStride));
  let samples = 0;
  let changed = 0;
  let channelDelta = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = ((y * width) + x) * 4;
      const delta0 = Math.abs(before[offset] - after[offset]);
      const delta1 = Math.abs(before[offset + 1] - after[offset + 1]);
      const delta2 = Math.abs(before[offset + 2] - after[offset + 2]);
      const maximum = Math.max(delta0, delta1, delta2);
      if (maximum >= PIXEL_CHANNEL_CHANGE) changed += 1;
      channelDelta += delta0 + delta1 + delta2;
      samples += 1;
    }
  }
  return {
    changedPixelRatio: samples === 0 ? 0 : changed / samples,
    meanChannelDelta: samples === 0 ? 0 : channelDelta / (samples * 3 * 255),
    sampledPixels: samples,
  };
}

export class GameplayExperienceEvaluator {
  readonly #createWindow: GameplayBrowserWindowFactory;
  readonly #decodePng?: (png: Buffer) => GameplayCapturedImage;
  readonly #now: () => Date;
  readonly #sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>;

  constructor(dependencies: GameplayExperienceEvaluatorDependencies) {
    this.#createWindow = dependencies.createWindow;
    this.#decodePng = dependencies.decodePng;
    this.#now = dependencies.now ?? (() => new Date());
    this.#sleep = dependencies.sleep ?? abortableDelay;
  }

  async evaluate(options: GameplayExperienceEvaluationOptions): Promise<GameplayExperienceReport> {
    if (options.signal?.aborted) throw abortError();
    const preview = parseLoopbackPreviewUrl(options.previewUrl);
    const projectRoot = await resolveSafeProjectRoot(options.projectRoot);
    const staging = await createStagedGameplayEvidence(projectRoot);
    const reportPath = 'artifacts/playtest/latest/report.json';
    let published = false;
    try {
    const startedAt = Date.now();
    const state: EvaluationState = {
      startedAt,
      projectRoot,
      screenshotDirectory: staging.screenshotDirectory,
      reportPath,
      errors: [],
      droppedErrors: 0,
      errorFingerprints: new Set(),
      screenshots: { before: null, idle: null, after: null, action: [] },
      actions: [],
      journey: [],
      observations: [],
      temporalSamples: [],
      framesByStepId: new Map(),
      surface: null,
      baselineDifference: null,
      loadCompleted: false,
      timedOut: false,
      entrypoint: undefined,
    };
    let manifest: GameplayPlaytestManifest;
    try {
      manifest = await readGameplayPlaytestManifest(projectRoot);
      if (options.expectedEngine !== undefined && manifest.engine !== options.expectedEngine) {
        throw new Error(
          `playtest.engine 为 ${manifest.engine}，与宿主项目引擎 ${options.expectedEngine} 不一致`,
        );
      }
      if (
        options.expectedEntrypoint !== undefined
        && manifest.entrypoint.path !== validateProjectRelativeHtmlPath(options.expectedEntrypoint)
      ) {
        throw new Error(
          `playtest.entrypoint.path 为 ${manifest.entrypoint.path}，与宿主正式入口 ${options.expectedEntrypoint} 不一致`,
        );
      }
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      recordRuntimeError(state, {
        kind: 'configuration',
        message: sanitizeReportMessage(error instanceof Error ? error.message : String(error), projectRoot),
        fatal: true,
      });
      const invalidReport = buildReport(state, this.#now());
      await safeWriteProjectFile(
        projectRoot,
        staging.reportPath,
        `${JSON.stringify(invalidReport, null, 2)}\n`,
      );
      await publishStagedGameplayEvidence(projectRoot, staging, invalidReport.checkedAt);
      published = true;
      return invalidReport;
    }
    if (options.signal?.aborted) throw abortError();
    const entrypoint = previewEntrypoint(preview, manifest.entrypoint.path);
    state.entrypoint = manifest.entrypoint.path;
    const controller = new AbortController();
    const totalTimeoutMs = boundedInteger(
      options.timeoutMs,
      manifest.limits.maxRunMs,
      1,
      Math.min(MAX_TOTAL_TIMEOUT_MS, manifest.limits.maxRunMs),
    );
    let window: GameplayBrowserWindow | null = null;
    let runtimeStarted = false;
    let timeout: NodeJS.Timeout | undefined;
    let rejectExternalAbort: ((error: Error) => void) | undefined;
    const externalAbortPromise = new Promise<never>((_resolvePromise, rejectPromise) => {
      rejectExternalAbort = rejectPromise;
    });
    const onExternalAbort = (): void => {
      controller.abort();
      if (window && !window.isDestroyed()) window.destroy();
      rejectExternalAbort?.(abortError());
    };
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });
    if (options.signal?.aborted) {
      options.signal.removeEventListener('abort', onExternalAbort);
      controller.abort();
      throw abortError();
    }

    try {
      window = this.#createWindow(hiddenPlaytestWindowOptions()) as GameplayBrowserWindow;
      installSafetyAndDiagnostics(window, entrypoint, state);
      runtimeStarted = true;
      const timeoutPromise = new Promise<never>((_resolvePromise, rejectPromise) => {
        timeout = setTimeout(() => {
          state.timedOut = true;
          recordRuntimeError(state, {
            kind: 'timeout',
            message: `自动试玩超过 ${totalTimeoutMs}ms 总时限`,
            fatal: true,
          });
          controller.abort();
          if (window && !window.isDestroyed()) window.destroy();
          rejectPromise(new PlaytestTimeoutError());
        }, totalTimeoutMs);
      });
      const evaluation = this.#run(window, entrypoint, manifest, options, state, controller);
      await Promise.race([evaluation, timeoutPromise, externalAbortPromise]);
    } catch (error) {
      if (!runtimeStarted) throw error;
      if (isAbortError(error) && options.signal?.aborted) throw error;
      if (error instanceof PlaytestStepTimeoutError) {
        recordRuntimeError(state, { kind: 'timeout', message: error.message, fatal: true });
      } else if (!(error instanceof PlaytestTimeoutError) && !isAbortError(error)) {
        recordRuntimeError(state, {
          kind: 'load',
          message: sanitizeReportMessage(
            error instanceof Error ? error.message : String(error),
            projectRoot,
          ),
          fatal: true,
        });
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onExternalAbort);
      controller.abort();
      if (window && !window.isDestroyed()) window.destroy();
    }

    const report = buildReport(state, this.#now());
    await safeWriteProjectFile(projectRoot, staging.reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await publishStagedGameplayEvidence(projectRoot, staging, report.checkedAt);
    published = true;
    return report;
    } finally {
      if (!published) await cleanupStagedGameplayEvidence(projectRoot, staging);
    }
  }

  async #run(
    window: GameplayBrowserWindow,
    preview: URL,
    manifest: GameplayPlaytestManifest,
    options: GameplayExperienceEvaluationOptions,
    state: EvaluationState,
    controller: AbortController,
  ): Promise<void> {
    const signal = controller.signal;
    const loadStartedAt = Date.now();
    await window.loadURL(preview.toString());
    state.loadCompleted = true;
    state.loadDurationMs = Date.now() - loadStartedAt;
    await this.#sleep(
      boundedInteger(
        options.initialDelayMs,
        Math.min(DEFAULT_INITIAL_DELAY_MS, manifest.entrypoint.readyTimeoutMs),
        0,
        manifest.entrypoint.readyTimeoutMs,
      ),
      signal,
    );
    ensureActive(window, signal);
    state.surface = await waitForVisibleSurface(
      window,
      manifest.entrypoint.readyTimeoutMs,
      this.#sleep,
      signal,
    );

    const before = await captureFrame(
      state.projectRoot,
      window,
      join(state.screenshotDirectory, 'before.png'),
      'artifacts/playtest/latest/screenshots/before.png',
      state.surface?.bounds,
      state.surface?.viewport,
      this.#decodePng,
      signal,
    );
    state.screenshots.before = before.path;
    await this.#sleep(boundedInteger(options.settleDelayMs, DEFAULT_SETTLE_DELAY_MS, 0, 2_000), signal);
    ensureActive(window, signal);
    const idle = await captureFrame(
      state.projectRoot,
      window,
      join(state.screenshotDirectory, 'idle.png'),
      'artifacts/playtest/latest/screenshots/idle.png',
      state.surface?.bounds,
      state.surface?.viewport,
      this.#decodePng,
      signal,
    );
    state.screenshots.idle = idle.path;
    state.baselineDifference = compareFrames(before, idle);
    state.framesByStepId.set('launch', idle);
    let previous = idle;
    let pauseActionCount = 0;

    for (const [index, step] of manifest.journey.entries()) {
      const stepTimeout = setTimeout(() => {
        controller.abort(new PlaytestStepTimeoutError(step.id, manifest.limits.stepTimeoutMs));
        if (!window.isDestroyed()) window.destroy();
      }, manifest.limits.stepTimeoutMs);
      const clearStepTimeout = (): void => clearTimeout(stepTimeout);
      signal.addEventListener('abort', clearStepTimeout, { once: true });
      ensureActive(window, signal);
      const stepStartedAt = Date.now();
      const inputs = inputsForJourneyStep(manifest, step);
      const action: GameplayExperienceAction = {
        id: step.id,
        label: step.id,
        role: roleForJourneyAction(step.action),
        inputs,
        waitAfterMs: Math.min(options.actionDelayMs ?? DEFAULT_ACTION_DELAY_MS, manifest.limits.stepTimeoutMs),
      };
      const heldFrames: CapturedFrame[] = [];
      const shouldSampleHeldInput = step.action === 'move' || step.action === 'primary';
      const sampledDuringHold = await dispatchAction(
        window,
        action,
        state.surface,
        boundedInteger(options.keyHoldMs, DEFAULT_KEY_HOLD_MS, 0, manifest.limits.stepTimeoutMs),
        this.#sleep,
        signal,
        shouldSampleHeldInput
          ? async (sampleIndex) => {
            const heldName = `temporal-${safeArtifactSegment(step.id)}-held-${sampleIndex}.png`;
            const heldFrame = await captureFrame(
              state.projectRoot,
              window,
              join(state.screenshotDirectory, heldName),
              `artifacts/playtest/latest/screenshots/${heldName}`,
              state.surface?.bounds,
              state.surface?.viewport,
              this.#decodePng,
              signal,
            );
            heldFrames.push(heldFrame);
            state.screenshots.action.push(heldFrame.path);
          }
          : undefined,
      );
      await this.#sleep(
        boundedInteger(
          action.waitAfterMs ?? options.actionDelayMs,
          DEFAULT_ACTION_DELAY_MS,
          0,
          manifest.limits.stepTimeoutMs,
        ),
        signal,
      );
      ensureActive(window, signal);
      const filename = step.capture || `step-${String(index + 1).padStart(2, '0')}-${safeArtifactSegment(step.id)}.png`;
      const relativeScreenshotPath = `artifacts/playtest/latest/screenshots/${filename}`;
      const captured = await captureFrame(
        state.projectRoot,
        window,
        join(state.screenshotDirectory, filename),
        relativeScreenshotPath,
        state.surface?.bounds,
        state.surface?.viewport,
        this.#decodePng,
        signal,
      );
      const difference = compareFrames(previous, captured);
      state.actions.push({
        id: action.id,
        label: action.label,
        role: action.role,
        screenshotPath: captured.path,
        ...difference,
      });
      state.screenshots.action.push(captured.path);
      state.framesByStepId.set(step.id, captured);
      const observationResults = await evaluateObservations(
        window,
        step.id,
        step.observe,
        captured,
        previous,
        state.framesByStepId,
        visualChangeThreshold(state, INPUT_CHANGE_RATIO),
        signal,
      );
      state.observations.push(...observationResults);
      let nextPrevious = captured;
      if (sampledDuringHold && heldFrames.length >= 2 && (step.action === 'move' || step.action === 'primary')) {
        const temporalDifference = compareFrames(heldFrames[0], heldFrames[1]);
        state.temporalSamples.push({
          stepId: step.id,
          action: step.action,
          screenshotPath: heldFrames[1].path,
          ...temporalDifference,
        });
      } else if (step.action === 'move' || step.action === 'primary') {
        await this.#sleep(CORE_TEMPORAL_SAMPLE_MS, signal);
        ensureActive(window, signal);
        const temporalName = `temporal-${safeArtifactSegment(step.id)}.png`;
        const temporalProbe = await captureFrame(
          state.projectRoot,
          window,
          join(state.screenshotDirectory, temporalName),
          `artifacts/playtest/latest/screenshots/${temporalName}`,
          state.surface?.bounds,
          state.surface?.viewport,
          this.#decodePng,
          signal,
        );
        const temporalDifference = compareFrames(captured, temporalProbe);
        state.screenshots.action.push(temporalProbe.path);
        state.temporalSamples.push({
          stepId: step.id,
          action: step.action,
          screenshotPath: temporalProbe.path,
          ...temporalDifference,
        });
        nextPrevious = temporalProbe;
      }
      if (step.action === 'pause') {
        pauseActionCount += 1;
        const isPause = pauseActionCount % 2 === 1;
        const probeDelayMs = isPause ? 400 : CORE_TEMPORAL_SAMPLE_MS;
        await this.#sleep(probeDelayMs, signal);
        ensureActive(window, signal);
        const probePrefix = isPause ? 'pause-probe' : 'resume-probe';
        const probeName = `${probePrefix}-${safeArtifactSegment(step.id)}.png`;
        const probe = await captureFrame(
          state.projectRoot,
          window,
          join(state.screenshotDirectory, probeName),
          `artifacts/playtest/latest/screenshots/${probeName}`,
          state.surface?.bounds,
          state.surface?.viewport,
          this.#decodePng,
          signal,
        );
        state.screenshots.action.push(probe.path);
        const probeDifference = compareFrames(captured, probe);
        const passed = isPause
          ? probeDifference.changedPixelRatio <= PAUSE_FROZEN_MAX_RATIO
          : probeDifference.changedPixelRatio >= visualChangeThreshold(state, CONTINUOUS_CHANGE_RATIO);
        const pauseObservation: GameplayObservationResult = {
          stepId: step.id,
          kind: 'screen-change',
          description: isPause ? '暂停后玩法画面基本冻结' : '再次触发暂停键后恢复运行',
          status: passed ? 'pass' : 'repair',
          message: isPause
            ? passed
              ? `暂停采样仅变化 ${(probeDifference.changedPixelRatio * 100).toFixed(2)}%。`
              : `暂停后仍变化 ${(probeDifference.changedPixelRatio * 100).toFixed(2)}%，玩法可能未冻结。`
            : passed
              ? `恢复后的时间采样变化 ${(probeDifference.changedPixelRatio * 100).toFixed(2)}%。`
              : '再次触发暂停键后未检测到持续运行。',
        };
        observationResults.push(pauseObservation);
        state.observations.push(pauseObservation);
        if (!isPause) {
          state.temporalSamples.push({
            stepId: step.id,
            action: 'resume',
            screenshotPath: probe.path,
            ...probeDifference,
          });
        }
        nextPrevious = probe;
      }
      state.journey.push({
        id: step.id,
        action: step.action,
        screenshotPath: captured.path,
        durationMs: Date.now() - stepStartedAt,
        observations: observationResults,
      });
      previous = nextPrevious;
      clearStepTimeout();
      signal.removeEventListener('abort', clearStepTimeout);
    }

    await this.#sleep(boundedInteger(options.settleDelayMs, DEFAULT_SETTLE_DELAY_MS, 0, 2_000), signal);
    ensureActive(window, signal);
    const after = await captureFrame(
      state.projectRoot,
      window,
      join(state.screenshotDirectory, 'after.png'),
      'artifacts/playtest/latest/screenshots/after.png',
      state.surface?.bounds,
      state.surface?.viewport,
      this.#decodePng,
      signal,
    );
    state.screenshots.after = after.path;
    // A synthetic observation lets the report distinguish ongoing animation
    // after the final input from the final input response itself.
    const trailingDifference = compareFrames(previous, after);
    state.actions.push({
      id: 'post-action-settle',
      label: '操作后持续渲染',
      role: 'other',
      screenshotPath: after.path,
      ...trailingDifference,
    });
    const successResults = await evaluateObservations(
      window,
      'success',
      manifest.success,
      after,
      previous,
      state.framesByStepId,
      visualChangeThreshold(state, INPUT_CHANGE_RATIO),
      signal,
    );
    state.observations.push(...successResults);
  }
}

function hiddenPlaytestWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1024,
    height: 640,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      offscreen: true,
      spellcheck: false,
      partition: `noobi-playtest-${randomUUID()}`,
    },
  };
}

function installSafetyAndDiagnostics(
  window: GameplayBrowserWindow,
  preview: URL,
  state: EvaluationState,
): void {
  const expectedOrigin = preview.origin;
  window.webContents.setAudioMuted?.(true);
  const allowPointerLock = (
    requestingWebContents: unknown | null,
    permission: string,
    requestingUrl: string | undefined,
  ): boolean => permission === 'pointerLock'
    && requestingWebContents === window.webContents
    && sameOrigin(requestingUrl, expectedOrigin);
  window.webContents.session?.setPermissionCheckHandler?.((
    requestingWebContents,
    permission,
    requestingOrigin,
    details,
  ) => allowPointerLock(
    requestingWebContents,
    permission,
    details.requestingUrl ?? requestingOrigin,
  ));
  window.webContents.session?.setPermissionRequestHandler?.((
    requestingWebContents,
    permission,
    callback,
    details,
  ) => {
    callback(allowPointerLock(requestingWebContents, permission, details?.requestingUrl));
  });
  window.webContents.session?.on?.('will-download', (_event, item) => {
    item.cancel();
  });
  window.webContents.session?.webRequest?.onBeforeRequest(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      callback({ cancel: !isAllowedPlaytestResource(details.url, expectedOrigin) });
    },
  );
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const preventForeignNavigation = (...args: unknown[]): void => {
    const event = asPreventableEvent(args[0]);
    const target = typeof args[1] === 'string' ? args[1] : '';
    try {
      if (parseLoopbackPreviewUrl(target).origin !== expectedOrigin) event?.preventDefault();
    } catch {
      event?.preventDefault();
    }
  };
  window.webContents.on('will-navigate', preventForeignNavigation);
  window.webContents.on('will-redirect', preventForeignNavigation);
  window.webContents.on('did-fail-load', (...args: unknown[]) => {
    const errorCode = typeof args[1] === 'number' ? args[1] : 0;
    // Chromium reports intentional aborted navigations as -3; foreign
    // navigations are already prevented and should not fail the game itself.
    if (errorCode === -3) return;
    const description = typeof args[2] === 'string' ? args[2] : 'Preview failed to load';
    const url = typeof args[3] === 'string' ? args[3] : undefined;
    recordRuntimeError(state, {
      kind: 'load',
      message: sanitizeReportMessage(`${description} (${errorCode})`, state.projectRoot),
      source: safeRuntimeSource(url),
      fatal: true,
    }, window);
  });
  window.webContents.on('render-process-gone', (...args: unknown[]) => {
    const details = isRecord(args[1]) ? args[1] : {};
    recordRuntimeError(state, {
      kind: 'renderer-gone',
      message: `游戏渲染进程退出：${readString(details.reason) ?? 'unknown'}`,
      fatal: true,
    }, window);
  });
  window.webContents.on('console-message', (...args: unknown[]) => {
    const entry = parseConsoleError(args, state.projectRoot);
    if (entry) recordRuntimeError(state, entry, window);
  });
  window.on('unresponsive', () => {
    recordRuntimeError(
      state,
      { kind: 'unresponsive', message: '游戏窗口无响应', fatal: true },
      window,
    );
  });
}

function recordRuntimeError(
  state: EvaluationState,
  error: GameplayExperienceRuntimeError,
  window?: GameplayBrowserWindow,
): void {
  const fingerprint = JSON.stringify([
    error.kind,
    error.message,
    error.source ?? '',
    error.line ?? 0,
    error.fatal,
  ]);
  if (state.errorFingerprints.has(fingerprint)) {
    state.droppedErrors += 1;
    if (state.droppedErrors >= MAX_RUNTIME_ERRORS && window && !window.isDestroyed()) window.destroy();
    return;
  }
  if (state.errors.length >= MAX_RUNTIME_ERRORS) {
    state.droppedErrors += 1;
    if (window && !window.isDestroyed()) window.destroy();
    return;
  }
  state.errorFingerprints.add(fingerprint);
  state.errors.push(error);
  if (state.errors.length >= MAX_RUNTIME_ERRORS && window && !window.isDestroyed()) {
    window.destroy();
  }
}

function parseConsoleError(
  args: readonly unknown[],
  projectRoot: string,
): GameplayExperienceRuntimeError | null {
  const details = isRecord(args[0]) && typeof args[0].level === 'string'
    ? args[0]
    : isRecord(args[1]) ? args[1] : null;
  if (details) {
    const level = readString(details.level);
    if (level !== 'error') return null;
    return {
      kind: 'console',
      message: sanitizeReportMessage(readString(details.message) ?? 'Console error', projectRoot),
      source: safeRuntimeSource(readString(details.sourceId)),
      line: readNumber(details.lineNumber),
      fatal: true,
    };
  }
  const legacyLevel = typeof args[1] === 'number' ? args[1] : -1;
  if (legacyLevel !== 3) return null;
  return {
    kind: 'console',
    message: sanitizeReportMessage(
      typeof args[2] === 'string' ? args[2] : 'Console error',
      projectRoot,
    ),
    line: typeof args[3] === 'number' ? args[3] : undefined,
    source: safeRuntimeSource(typeof args[4] === 'string' ? args[4] : undefined),
    fatal: true,
  };
}

async function waitForVisibleSurface(
  window: GameplayBrowserWindow,
  timeoutMs: number,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): Promise<GameplaySurfaceSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let lastSurface: GameplaySurfaceSnapshot | null = null;
  let lastCaptureError: unknown;
  do {
    ensureActive(window, signal);
    try {
      lastSurface = await abortableOperation(
        window.webContents.executeJavaScript<GameplaySurfaceSnapshot>(
          SURFACE_INSPECTION_SCRIPT,
          false,
        ),
        signal,
      );
      if (lastSurface?.found) {
        const probe = await abortableOperation(window.webContents.capturePage(), signal);
        const size = probe.getSize(1);
        const bitmap = probe.toBitmap({ scaleFactor: 1 });
        if (size.width > 0 && size.height > 0 && bitmap.byteLength >= size.width * size.height * 4) {
          return lastSurface;
        }
      }
    } catch (error) {
      lastCaptureError = error;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(120, remaining), signal);
  } while (Date.now() <= deadline);
  const detail = lastCaptureError instanceof Error ? `：${lastCaptureError.message}` : '';
  throw new Error(`在 ${timeoutMs}ms 内没有检测到可见且可截图的游戏表面${detail}`);
}

async function captureFrame(
  projectRoot: string,
  window: GameplayBrowserWindow,
  absolutePath: string,
  projectRelativePath: string,
  comparisonBounds?: Rectangle | null,
  comparisonViewport?: { width: number; height: number } | null,
  decodePng?: (png: Buffer) => GameplayCapturedImage,
  signal?: AbortSignal,
): Promise<CapturedFrame> {
  // A hidden/offscreen renderer can finish game-state updates before Chromium
  // commits the corresponding compositor frame. Two host-created RAF turns
  // make capturePage observe the painted game rather than a stale surface.
  await abortableOperation(window.webContents.executeJavaScript<boolean>(
    'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
    false,
  ), signal);
  const image = await abortableOperation(window.webContents.capturePage(), signal);
  const logicalSize = image.getSize(1);
  if (logicalSize.width <= 0 || logicalSize.height <= 0) throw new Error('试玩截图尺寸为空');
  const png = image.toPNG();
  const bitmapImage = decodePng ? decodePng(png) : image;
  const size = bitmapImage.getSize(1);
  if (size.width <= 0 || size.height <= 0) throw new Error('试玩截图解码尺寸为空');
  // NativeImage may expose a view backed by Chromium-owned memory. Copy it so
  // later compositor captures cannot mutate an earlier comparison baseline.
  const fullBitmap = Buffer.from(bitmapImage.toBitmap({ scaleFactor: 1 }));
  const fullDimensions = bitmapDimensions(fullBitmap, size.width, size.height);
  const comparison = cropBitmapForComparison(
    fullBitmap,
    fullDimensions.width,
    fullDimensions.height,
    comparisonBounds,
    comparisonViewport?.width ?? logicalSize.width,
    comparisonViewport?.height ?? logicalSize.height,
  );
  await safeWriteProjectFile(projectRoot, absolutePath, png);
  return {
    image,
    bitmap: comparison.bitmap,
    width: comparison.width,
    height: comparison.height,
    path: projectRelativePath,
  };
}

function bitmapDimensions(
  bitmap: Buffer,
  logicalWidth: number,
  logicalHeight: number,
): { width: number; height: number } {
  if (bitmap.byteLength % 4 !== 0) throw new Error('试玩截图 bitmap 字节数无效');
  const pixelCount = bitmap.byteLength / 4;
  if (pixelCount === logicalWidth * logicalHeight) {
    return { width: logicalWidth, height: logicalHeight };
  }
  const scale = Math.sqrt(pixelCount / (logicalWidth * logicalHeight));
  const width = Math.round(logicalWidth * scale);
  const height = Math.round(logicalHeight * scale);
  if (width <= 0 || height <= 0 || width * height !== pixelCount) {
    throw new Error('试玩截图 bitmap 尺寸与像素缓冲区不一致');
  }
  return { width, height };
}

function cropBitmapForComparison(
  bitmap: Buffer,
  bitmapWidth: number,
  bitmapHeight: number,
  bounds: Rectangle | null | undefined,
  logicalWidth: number,
  logicalHeight: number,
): { bitmap: Buffer; width: number; height: number } {
  if (!bounds) return { bitmap, width: bitmapWidth, height: bitmapHeight };
  const scaleX = bitmapWidth / logicalWidth;
  const scaleY = bitmapHeight / logicalHeight;
  const x = Math.max(0, Math.min(bitmapWidth - 1, Math.floor(bounds.x * scaleX)));
  const y = Math.max(0, Math.min(bitmapHeight - 1, Math.floor(bounds.y * scaleY)));
  const width = Math.max(1, Math.min(bitmapWidth - x, Math.floor(bounds.width * scaleX)));
  const height = Math.max(1, Math.min(bitmapHeight - y, Math.floor(bounds.height * scaleY)));
  const cropped = Buffer.allocUnsafe(width * height * 4);
  const sourceStride = bitmapWidth * 4;
  const targetStride = width * 4;
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * sourceStride) + (x * 4);
    bitmap.copy(cropped, row * targetStride, sourceStart, sourceStart + targetStride);
  }
  return { bitmap: cropped, width, height };
}

function compareFrames(before: CapturedFrame, after: CapturedFrame): SampledBitmapDifference {
  if (before.width !== after.width || before.height !== after.height) {
    return { changedPixelRatio: 1, meanChannelDelta: 1, sampledPixels: 1 };
  }
  return sampledBitmapDifference(before.bitmap, after.bitmap, before.width, before.height);
}

async function dispatchAction(
  window: GameplayBrowserWindow,
  action: GameplayExperienceAction,
  surface: GameplaySurfaceSnapshot | null,
  keyHoldMs: number,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
  captureWhileHeld?: (sampleIndex: 1 | 2) => Promise<void>,
): Promise<boolean> {
  let capturedWhileHeld = false;
  for (const input of action.inputs) {
    ensureActive(window, signal);
    if (input.type === 'wait') {
      await sleep(input.ms, signal);
      continue;
    }
    if (input.type === 'pointer') {
      const point = surfacePoint(surface, input.xRatio, input.yRatio);
      window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
      window.webContents.sendInputEvent({
        type: 'mouseDown',
        x: point.x,
        y: point.y,
        button: electronMouseButton(input.button),
        clickCount: 1,
      });
      window.webContents.sendInputEvent({
        type: 'mouseUp',
        x: point.x,
        y: point.y,
        button: electronMouseButton(input.button),
        clickCount: 1,
      });
      continue;
    }
    if (input.type === 'look') {
      const sampled = await dispatchLookInput(
        window,
        input,
        surface,
        sleep,
        signal,
        capturedWhileHeld ? undefined : captureWhileHeld,
      );
      capturedWhileHeld ||= sampled;
      continue;
    }
    if (input.type === 'drag') {
      const sampled = await dispatchDragInput(
        window,
        input,
        surface,
        sleep,
        signal,
        capturedWhileHeld ? undefined : captureWhileHeld,
      );
      capturedWhileHeld ||= sampled;
      continue;
    }
    const keyCode = electronKeyCode(input.code);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    const holdMs = input.holdMs > 0 ? input.holdMs : keyHoldMs;
    try {
      if (captureWhileHeld && !capturedWhileHeld && holdMs >= MIN_HELD_TEMPORAL_MS) {
        const firstSlice = Math.floor(holdMs / 3);
        const secondSlice = Math.floor(holdMs / 3);
        await sleep(firstSlice, signal);
        ensureActive(window, signal);
        await captureWhileHeld(1);
        // Chromium may batch synthetic key events for a hidden renderer until
        // the first capture/compositor flush. Reassert the held key as an OS-
        // style repeat so continuous controls observe it during the second
        // temporal interval instead of receiving keyDown/keyUp in one frame.
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
        await sleep(secondSlice, signal);
        ensureActive(window, signal);
        await captureWhileHeld(2);
        const remaining = holdMs - firstSlice - secondSlice;
        if (remaining > 0) await sleep(remaining, signal);
        capturedWhileHeld = true;
      } else if (holdMs > 0) {
        await sleep(holdMs, signal);
      }
    } finally {
      if (!window.isDestroyed()) window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    }
  }
  return capturedWhileHeld;
}

async function dispatchLookInput(
  window: GameplayBrowserWindow,
  input: Extract<GameplayPlaytestInput, { type: 'look' }>,
  surface: GameplaySurfaceSnapshot | null,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
  captureDuringMotion?: (sampleIndex: 1 | 2) => Promise<void>,
): Promise<boolean> {
  const start = surfacePoint(surface, 0.5, 0.5);
  const viewport = surface?.viewport ?? { width: 1024, height: 640 };
  const steps = motionStepCount(input.durationMs);
  const firstSampleStep = Math.max(1, Math.floor(steps / 3));
  const secondSampleStep = Math.max(firstSampleStep + 1, Math.floor((steps * 2) / 3));
  let cumulativeX = 0;
  let cumulativeY = 0;
  let capturedSamples = 0;
  for (let step = 1; step <= steps; step += 1) {
    ensureActive(window, signal);
    const movementX = distributedMotionDelta(input.deltaX, step, steps);
    const movementY = distributedMotionDelta(input.deltaY, step, steps);
    cumulativeX += movementX;
    cumulativeY += movementY;
    window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: clampCoordinate(start.x + cumulativeX, viewport.width),
      y: clampCoordinate(start.y + cumulativeY, viewport.height),
      movementX,
      movementY,
    });
    await sleep(distributedDuration(input.durationMs, step, steps), signal);
    if (captureDuringMotion && capturedSamples === 0 && step >= firstSampleStep) {
      ensureActive(window, signal);
      await captureDuringMotion(1);
      capturedSamples = 1;
    }
    if (captureDuringMotion && capturedSamples === 1 && step >= secondSampleStep) {
      ensureActive(window, signal);
      await captureDuringMotion(2);
      capturedSamples = 2;
    }
  }
  return capturedSamples === 2;
}

async function dispatchDragInput(
  window: GameplayBrowserWindow,
  input: Extract<GameplayPlaytestInput, { type: 'drag' }>,
  surface: GameplaySurfaceSnapshot | null,
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
  captureDuringMotion?: (sampleIndex: 1 | 2) => Promise<void>,
): Promise<boolean> {
  const from = surfacePoint(surface, input.fromXRatio, input.fromYRatio);
  const to = surfacePoint(surface, input.toXRatio, input.toYRatio);
  const button = electronMouseButton(input.button);
  const steps = motionStepCount(input.durationMs);
  const firstSampleStep = Math.max(1, Math.floor(steps / 3));
  const secondSampleStep = Math.max(firstSampleStep + 1, Math.floor((steps * 2) / 3));
  let current = from;
  let capturedSamples = 0;
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x: from.x,
    y: from.y,
    button,
    clickCount: 1,
  });
  try {
    for (let step = 1; step <= steps; step += 1) {
      ensureActive(window, signal);
      const next = {
        x: Math.round(from.x + ((to.x - from.x) * step) / steps),
        y: Math.round(from.y + ((to.y - from.y) * step) / steps),
      };
      window.webContents.sendInputEvent({
        type: 'mouseMove',
        x: next.x,
        y: next.y,
        movementX: next.x - current.x,
        movementY: next.y - current.y,
        button,
      });
      current = next;
      await sleep(distributedDuration(input.durationMs, step, steps), signal);
      if (captureDuringMotion && capturedSamples === 0 && step >= firstSampleStep) {
        ensureActive(window, signal);
        await captureDuringMotion(1);
        capturedSamples = 1;
      }
      if (captureDuringMotion && capturedSamples === 1 && step >= secondSampleStep) {
        ensureActive(window, signal);
        await captureDuringMotion(2);
        capturedSamples = 2;
      }
    }
  } finally {
    if (!window.isDestroyed()) {
      window.webContents.sendInputEvent({
        type: 'mouseUp',
        x: current.x,
        y: current.y,
        button,
        clickCount: 1,
      });
    }
  }
  return capturedSamples === 2;
}

function motionStepCount(durationMs: number): number {
  return Math.max(2, Math.min(120, Math.ceil(durationMs / 16)));
}

function distributedMotionDelta(total: number, step: number, steps: number): number {
  return (total * step) / steps - (total * (step - 1)) / steps;
}

function distributedDuration(total: number, step: number, steps: number): number {
  return Math.round((total * step) / steps) - Math.round((total * (step - 1)) / steps);
}

function clampCoordinate(value: number, extent: number): number {
  return Math.max(0, Math.min(Math.max(0, extent - 1), Math.round(value)));
}

async function evaluateObservations(
  window: GameplayBrowserWindow,
  stepId: string,
  observations: readonly GameplayPlaytestObservation[],
  current: CapturedFrame,
  previous: CapturedFrame,
  framesByStepId: ReadonlyMap<string, CapturedFrame>,
  screenChangeThreshold: number,
  signal: AbortSignal,
): Promise<GameplayObservationResult[]> {
  const results: GameplayObservationResult[] = [];
  for (const observation of observations) {
    if (observation.kind === 'canvas-not-blank') {
      const stats = sampledBitmapVisualStats(current.bitmap, current.width, current.height);
      const passed = stats.uniqueColors >= 3 && stats.luminanceRange >= 0.015;
      results.push({
        stepId,
        kind: observation.kind,
        description: observation.description,
        status: passed ? 'pass' : 'repair',
        message: passed
          ? `截图包含 ${stats.uniqueColors} 种采样颜色，亮度范围 ${(stats.luminanceRange * 100).toFixed(1)}%。`
          : '截图接近单色或空白，无法证明游戏画面已渲染。',
      });
      continue;
    }
    if (observation.kind === 'screen-change') {
      const baseline = observation.baselineStepId
        ? framesByStepId.get(observation.baselineStepId)
        : previous;
      const difference = baseline ? compareFrames(baseline, current) : null;
      const passed = Boolean(difference && difference.changedPixelRatio >= screenChangeThreshold);
      results.push({
        stepId,
        kind: observation.kind,
        description: observation.description,
        status: passed ? 'pass' : 'repair',
        message: difference
          ? passed
            ? `相对 ${observation.baselineStepId ?? '上一步'} 的画面变化为 ${(difference.changedPixelRatio * 100).toFixed(2)}%。`
            : `画面变化仅 ${(difference.changedPixelRatio * 100).toFixed(2)}%，低于动态阈值 ${(screenChangeThreshold * 100).toFixed(2)}%。`
          : `找不到基线步骤 ${observation.baselineStepId ?? ''}。`,
      });
      continue;
    }
    if (observation.kind === 'text-visible') {
      const expected = observation.value ?? '';
      const visible = await inspectTextVisibility(window, expected, signal);
      results.push({
        stepId,
        kind: observation.kind,
        description: observation.description,
        status: visible ? 'pass' : 'repair',
        message: visible ? `检测到可见文字“${expected}”。` : `没有检测到可见文字“${expected}”。`,
      });
      continue;
    }
    const selector = observation.value ?? '';
    const visible = await inspectElementVisibility(window, selector, signal);
    results.push({
      stepId,
      kind: observation.kind,
      description: observation.description,
      status: visible ? 'pass' : 'repair',
      message: visible ? `元素 ${selector} 可见。` : `元素 ${selector} 不存在或不可见。`,
    });
  }
  return results;
}

export interface SampledBitmapVisualStats {
  sampledPixels: number;
  uniqueColors: number;
  luminanceRange: number;
}

export function sampledBitmapVisualStats(
  bitmap: Uint8Array,
  width: number,
  height: number,
  sampleStride = 6,
): SampledBitmapVisualStats {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Bitmap dimensions must be positive integers');
  }
  if (bitmap.byteLength < width * height * 4) throw new Error('Bitmap buffer is smaller than its dimensions');
  const colors = new Set<number>();
  let minimumLuminance = 1;
  let maximumLuminance = 0;
  let sampledPixels = 0;
  const stride = Math.max(1, Math.floor(sampleStride));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = ((y * width) + x) * 4;
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      const luminance = ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) / 255;
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
      colors.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      sampledPixels += 1;
    }
  }
  return {
    sampledPixels,
    uniqueColors: colors.size,
    luminanceRange: sampledPixels === 0 ? 0 : maximumLuminance - minimumLuminance,
  };
}

async function inspectTextVisibility(
  window: GameplayBrowserWindow,
  text: string,
  signal: AbortSignal,
): Promise<boolean> {
  const literal = JSON.stringify(text);
  return abortableOperation(window.webContents.executeJavaScript<boolean>(`(() => {
    const expected = ${literal};
    if (!expected) return false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent || !walker.currentNode.textContent?.includes(expected)) continue;
      const style = getComputedStyle(parent);
      const rect = parent.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.02
        && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0) return true;
    }
    return false;
  })()`, false), signal);
}

async function inspectElementVisibility(
  window: GameplayBrowserWindow,
  selector: string,
  signal: AbortSignal,
): Promise<boolean> {
  const literal = JSON.stringify(selector);
  return abortableOperation(window.webContents.executeJavaScript<boolean>(`(() => {
    const node = document.querySelector(${literal});
    if (!node) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.02
      && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0;
  })()`, false), signal);
}

function buildReport(state: EvaluationState, checkedAt: Date): GameplayExperienceReport {
  const idleDifference = differenceById(state.actions, 'post-action-settle');
  const normalActions = state.actions.filter((action) => action.id !== 'post-action-settle');
  const maximumActionChange = normalActions.reduce(
    (maximum, action) => Math.max(maximum, action.changedPixelRatio),
    0,
  );
  const maximumTemporalChange = state.temporalSamples.reduce(
    (maximum, sample) => Math.max(maximum, sample.changedPixelRatio),
    0,
  );
  const ongoingChange = state.temporalSamples.length > 0
    ? maximumTemporalChange
    : Math.max(
      state.baselineDifference?.changedPixelRatio ?? 0,
      idleDifference?.changedPixelRatio ?? 0,
    );
  const requiredTemporalActions = ['move', 'primary', 'resume'] as const;
  const temporalThreshold = visualChangeThreshold(state, CONTINUOUS_CHANGE_RATIO);
  const missingTemporalActions = requiredTemporalActions.filter((action) =>
    !state.temporalSamples.some((sample) =>
      sample.action === action && sample.changedPixelRatio >= temporalThreshold));
  const continuouslyRendered = missingTemporalActions.length === 0;
  const restartAction = [...normalActions].reverse().find((action) => action.role === 'restart');
  const responseThreshold = visualChangeThreshold(state, INPUT_CHANGE_RATIO);
  const restartResponded = restartAction
    ? restartAction.changedPixelRatio >= responseThreshold
    : null;
  const fatalErrors = state.errors.filter((error) => error.fatal);
  const visualObservationFailures = state.observations.filter((observation) =>
    observation.status === 'repair'
    && (observation.kind !== 'screen-change' || observation.stepId === 'success'));
  const requiredInputActions = ['start', 'move', 'primary'] as const;
  const missingInputFeedback = requiredInputActions.filter((action) =>
    !state.journey.some((step) => {
      if (step.action !== action) return false;
      const observations = step.observations.filter((observation) => observation.kind === 'screen-change');
      return observations.length > 0 && observations.every((observation) => observation.status === 'pass');
    }));
  const interactionObservationFailures = state.journey
    .filter((step) => step.action !== 'restart')
    .flatMap((step) => step.observations)
    .filter((observation) => observation.status === 'repair');
  const inputResponsePassed = missingInputFeedback.length === 0
    && interactionObservationFailures.length === 0;
  const restartObservationFailures = state.journey
    .filter((step) => step.action === 'restart')
    .flatMap((step) => step.observations)
    .filter((observation) => observation.status === 'repair');
  const restartObservations = state.journey
    .filter((step) => step.action === 'restart')
    .flatMap((step) => step.observations);
  const restartScreenObservations = restartObservations.filter(
    (observation) => observation.kind === 'screen-change',
  );
  const restartPassed = restartAction
    ? (restartScreenObservations.length > 0
      ? restartScreenObservations.every((observation) => observation.status === 'pass')
      : Boolean(restartResponded)) && restartObservationFailures.length === 0
    : null;
  const checks: GameplayExperienceCheck[] = [
    {
      id: 'load',
      label: '加载与启动',
      status: state.loadCompleted && !state.timedOut ? 'pass' : 'repair',
      message: state.loadCompleted && !state.timedOut
        ? '本地预览已完成加载。'
        : state.timedOut ? '试玩超过总时限。' : '本地预览未完成加载。',
      durationMs: state.loadDurationMs,
    },
    {
      id: 'runtime-errors',
      label: '运行稳定性',
      status: fatalErrors.length === 0 ? 'pass' : 'repair',
      message: fatalErrors.length === 0
        ? '未发现页面加载、控制台、卡死或渲染进程错误。'
        : `捕获 ${fatalErrors.length} 个运行错误。`,
    },
    {
      id: 'visible-surface',
      label: '可见游戏画面',
      status: state.surface?.found && visualObservationFailures.length === 0 ? 'pass' : 'repair',
      message: state.surface?.found && visualObservationFailures.length === 0
        ? `检测到可见游戏表面 ${state.surface.selector ?? state.surface.tagName ?? ''}，视觉断言通过。`
        : visualObservationFailures.length > 0
          ? `${visualObservationFailures.length} 个可见画面断言未通过。`
        : '没有检测到尺寸有效且可见的 Canvas 或游戏 DOM。',
    },
    {
      id: 'input-response',
      label: '操作反馈',
      status: normalActions.length === 0
        ? 'skipped'
        : inputResponsePassed ? 'pass' : 'repair',
      message: normalActions.length === 0
        ? '没有配置可执行的试玩操作。'
        : inputResponsePassed
          ? `开始、移动和主要动作均有声明且已验证的画面反馈；最大变化 ${(maximumActionChange * 100).toFixed(2)}%。`
          : interactionObservationFailures.length > 0
            ? `${interactionObservationFailures.length} 个试玩交互断言未通过。`
            : `缺少可验证的操作反馈：${missingInputFeedback.join('、') || '未知步骤'}。`,
    },
    {
      id: 'continuous-render',
      label: '持续渲染与动画',
      status: state.screenshots.after && state.actions.length > 0
        ? continuouslyRendered ? 'pass' : 'repair'
        : 'skipped',
      message: state.screenshots.after && state.actions.length > 0
        ? continuouslyRendered
          ? `操作后画面仍持续变化 ${(ongoingChange * 100).toFixed(2)}%。`
          : `以下核心动作没有检测到时间中间态：${missingTemporalActions.join('、')}；画面可能只是静态姿态跳变。`
        : '未取得连续采样画面。',
    },
    {
      id: 'restart',
      label: '重新开始',
      status: restartPassed === null
        ? 'skipped'
        : restartPassed ? 'pass' : 'repair',
      message: restartPassed === null
        ? '试玩计划没有提供 restart 操作。'
        : restartPassed
          ? '重新开始操作产生了明确画面反馈。'
          : '重新开始操作没有产生可检测的画面反馈。',
    },
  ];
  const repairRequired = checks.some((check) => check.status === 'repair')
    || state.observations.some((observation) => observation.status === 'repair');
  const applicable = checks.filter((check) => check.status !== 'skipped');
  const passed = applicable.filter((check) => check.status === 'pass').length;
  const rawScore = applicable.length === 0 ? 0 : Math.round((passed / applicable.length) * 100);
  const score = repairRequired ? Math.min(99, rawScore) : rawScore;
  return {
    version: 1,
    verdict: repairRequired ? 'repair' : 'pass',
    score,
    checkedAt: checkedAt.toISOString(),
    durationMs: Math.max(0, Date.now() - state.startedAt),
    reportPath: state.reportPath,
    summary: repairRequired
      ? `体验评测发现 ${checks.filter((check) => check.status === 'repair').length} 项需要修复。`
      : '自动试玩完成，加载、操作、动画与重开检查均通过。',
    checks,
    surface: state.surface,
    actions: state.actions,
    journey: state.journey,
    observations: state.observations,
    temporalSamples: state.temporalSamples,
    screenshots: state.screenshots,
    errors: state.errors,
    droppedErrors: state.droppedErrors,
    timedOut: state.timedOut,
    entrypoint: state.entrypoint,
  };
}

function visualChangeThreshold(state: EvaluationState, absoluteMinimum: number): number {
  return Math.max(
    absoluteMinimum,
    (state.baselineDifference?.changedPixelRatio ?? 0) * 1.25,
  );
}

function inputsForJourneyStep(
  manifest: GameplayPlaytestManifest,
  step: GameplayPlaytestJourneyStep,
): readonly GameplayPlaytestInput[] {
  if (step.inputs.length > 0) return step.inputs;
  if (
    step.action === 'start'
    || step.action === 'move'
    || step.action === 'primary'
    || step.action === 'pause'
    || step.action === 'restart'
  ) return manifest.actions[step.action].inputs;
  return [];
}

function roleForJourneyAction(action: GameplayJourneyAction): GameplayActionRole {
  return action === 'start'
    || action === 'move'
    || action === 'primary'
    || action === 'pause'
    || action === 'restart'
    ? action
    : 'other';
}

function electronMouseButton(button: 0 | 1 | 2): 'left' | 'middle' | 'right' {
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return 'left';
}

function electronKeyCode(code: string): string {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  switch (code) {
    case 'ArrowUp': return 'Up';
    case 'ArrowDown': return 'Down';
    case 'ArrowLeft': return 'Left';
    case 'ArrowRight': return 'Right';
    case 'ShiftLeft':
    case 'ShiftRight': return 'Shift';
    case 'ControlLeft':
    case 'ControlRight': return 'Control';
    case 'AltLeft':
    case 'AltRight': return 'Alt';
    default: return code;
  }
}

function surfacePoint(
  surface: GameplaySurfaceSnapshot | null,
  xRatio: number,
  yRatio: number,
): { x: number; y: number } {
  const viewport = surface?.viewport ?? { width: 1024, height: 640 };
  const bounds = surface?.bounds;
  const rawX = bounds ? bounds.x + (bounds.width * xRatio) : viewport.width * xRatio;
  const rawY = bounds ? bounds.y + (bounds.height * yRatio) : viewport.height * yRatio;
  return {
    x: Math.max(0, Math.min(Math.max(0, viewport.width - 1), Math.round(rawX))),
    y: Math.max(0, Math.min(Math.max(0, viewport.height - 1), Math.round(rawY))),
  };
}

function ensureActive(window: GameplayBrowserWindow, signal: AbortSignal): void {
  if (signal.aborted) throw abortSignalError(signal);
  if (window.isDestroyed()) throw abortError();
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortSignalError(signal));
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolvePromise();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      rejectPromise(abortSignalError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function abortableOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(abortSignalError(signal));
  return new Promise<T>((resolvePromise, rejectPromise) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => rejectPromise(abortSignalError(signal)));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    operation.then(
      (value) => finish(() => resolvePromise(value)),
      (error: unknown) => finish(() => rejectPromise(error)),
    );
  });
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function safeArtifactSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 64) || 'action';
}

function differenceById(
  actions: readonly GameplayActionObservation[],
  id: string,
): GameplayActionObservation | undefined {
  return actions.find((action) => action.id === id);
}

async function resolveSafeProjectRoot(projectRoot: string): Promise<string> {
  const root = await realpath(resolve(projectRoot));
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('项目根目录不可用');
  return root;
}

async function createStagedGameplayEvidence(
  projectRoot: string,
): Promise<StagedGameplayEvidence> {
  const runId = randomUUID().toLowerCase();
  const fallbackDirectory = join(projectRoot, 'artifacts', 'playtest', 'staging', runId);
  let staging: StagedGameplayEvidence = {
    runId,
    directory: fallbackDirectory,
    screenshotDirectory: join(fallbackDirectory, 'screenshots'),
    reportPath: join(fallbackDirectory, 'report.json'),
  };
  try {
    const directory = await ensureSafeDirectoryChain(projectRoot, [
      'artifacts',
      'playtest',
      'staging',
      runId,
    ]);
    staging = {
      runId,
      directory,
      screenshotDirectory: await ensureSafeDirectoryChain(projectRoot, [
        'artifacts',
        'playtest',
        'staging',
        runId,
        'screenshots',
      ]),
      reportPath: join(directory, 'report.json'),
    };
    return staging;
  } catch (error) {
    await cleanupStagedGameplayEvidence(projectRoot, staging).catch(() => undefined);
    throw error;
  }
}

async function cleanupStagedGameplayEvidence(
  projectRoot: string,
  staging: StagedGameplayEvidence,
): Promise<void> {
  const expectedParent = resolve(projectRoot, 'artifacts', 'playtest', 'staging');
  const target = resolve(staging.directory);
  assertPathInside(projectRoot, target);
  if (dirname(target) !== expectedParent || basename(target) !== staging.runId) {
    throw new Error('拒绝清理非本次自动试玩 staging 目录');
  }
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await assertNoSymlinkPath(projectRoot, expectedParent);
  if (metadata.isSymbolicLink()) {
    await unlink(target);
    return;
  }
  if (!metadata.isDirectory()) throw new Error('自动试玩 staging 目标不是目录');
  const canonical = await realpath(target);
  if (canonical !== target) throw new Error('自动试玩 staging 目录解析异常');
  await rm(target, { recursive: true, force: true });
}

async function publishStagedGameplayEvidence(
  projectRoot: string,
  staging: StagedGameplayEvidence,
  checkedAt: string,
): Promise<void> {
  await assertSafeEvidenceTree(projectRoot, staging.directory, true);
  const playtest = await ensureSafeDirectoryChain(projectRoot, ['artifacts', 'playtest']);
  const latest = join(playtest, 'latest');
  assertPathInside(projectRoot, latest);

  let archivedLatest: string | null = null;
  let latestMetadata;
  try {
    latestMetadata = await lstat(latest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (latestMetadata) {
    if (!latestMetadata.isDirectory() || latestMetadata.isSymbolicLink()) {
      throw new Error('自动试玩 latest 路径不能是符号链接或非目录');
    }
    await assertSafeEvidenceTree(projectRoot, latest, false);
    const previous = await readLatestGameplayExperienceReport(projectRoot).catch(() => null);
    const history = await ensureSafeDirectoryChain(projectRoot, ['artifacts', 'playtest', 'history']);
    archivedLatest = join(
      history,
      `${safeHistoryTimestamp(previous?.checkedAt ?? checkedAt)}-${randomUUID().slice(0, 8)}`,
    );
    assertPathInside(projectRoot, archivedLatest);
    await rename(latest, archivedLatest);
  }

  try {
    // Both directories share the same playtest filesystem. The rename makes a
    // fully-written run visible at `latest` as a single directory operation;
    // no screenshot or report is ever copied into the live evidence tree.
    await rename(staging.directory, latest);
  } catch (publishError) {
    if (archivedLatest) {
      try {
        await rename(archivedLatest, latest);
        archivedLatest = null;
      } catch (rollbackError) {
        throw new AggregateError(
          [publishError, rollbackError],
          '自动试玩证据发布失败，且旧 latest 无法回滚（旧证据仍保留在 history）',
        );
      }
    }
    throw publishError;
  }
}

async function assertSafeEvidenceTree(
  projectRoot: string,
  directory: string,
  requireReport: boolean,
): Promise<void> {
  const root = resolve(directory);
  assertPathInside(projectRoot, root);
  await assertNoSymlinkPath(projectRoot, root);
  let foundReport = false;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      assertPathInside(projectRoot, path);
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) throw new Error('宿主产物证据树不能包含符号链接');
      if (metadata.isDirectory()) {
        const canonical = await realpath(path);
        assertPathInside(projectRoot, canonical);
        pending.push(canonical);
        continue;
      }
      if (!metadata.isFile()) throw new Error('宿主产物证据树只能包含普通文件和目录');
      if (metadata.nlink !== 1) throw new Error('宿主产物证据树不能包含硬链接');
      if (current === root && entry.name === 'report.json') foundReport = true;
    }
  }
  if (requireReport && !foundReport) throw new Error('自动试玩 staging 缺少 report.json');
}

async function ensureSafeDirectoryChain(projectRoot: string, components: readonly string[]): Promise<string> {
  let current = projectRoot;
  for (const component of components) {
    if (!/^[a-z0-9._-]+$/iu.test(component) || component === '.' || component === '..') {
      throw new Error('宿主产物目录名称无效');
    }
    const next = join(current, component);
    try {
      await mkdir(next, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const metadata = await lstat(next);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('宿主产物目录不能是符号链接');
    }
    const canonical = await realpath(next);
    assertPathInside(projectRoot, canonical);
    current = canonical;
  }
  return current;
}

async function assertNoSymlinkPath(projectRoot: string, directory: string): Promise<void> {
  const target = resolve(directory);
  assertPathInside(projectRoot, target);
  const pathFromRoot = relative(projectRoot, target);
  if (!pathFromRoot) return;
  let current = projectRoot;
  for (const component of pathFromRoot.split(sep)) {
    current = join(current, component);
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('宿主产物目录不能是符号链接');
    }
  }
  assertPathInside(projectRoot, await realpath(target));
}

async function safeWriteProjectFile(
  projectRoot: string,
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  const target = resolve(path);
  assertPathInside(projectRoot, target);
  await assertNoSymlinkPath(projectRoot, dirname(target));
  try {
    const existing = await lstat(target);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error('宿主产物目标不能是符号链接或非普通文件');
    }
    if (existing.nlink !== 1) throw new Error('宿主产物目标不能是硬链接');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = join(
    dirname(target),
    `.${basename(target)}.noobi-${randomUUID()}.tmp`,
  );
  const flags = constants.O_WRONLY
    | constants.O_CREAT
    | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(temporary, flags, 0o600);
  try {
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.nlink !== 1) throw new Error('宿主临时产物不是独立普通文件');
      await handle.chmod(0o600);
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  try {
    // Re-check the parent immediately before the atomic replacement. rename()
    // replaces a final symlink/hardlink directory entry rather than following
    // its target, closing the truncation race left by O_TRUNC writes.
    await assertNoSymlinkPath(projectRoot, dirname(target));
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function readBoundedNoFollowFile(
  path: string,
  maximumBytes: number,
  projectRoot?: string,
): Promise<string> {
  if (projectRoot) await assertNoSymlinkPath(projectRoot, dirname(path));
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const handle = await open(path, flags);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('试玩配置不是普通文件');
    if (metadata.nlink !== 1) throw new Error('试玩配置不能是硬链接');
    if (metadata.size > maximumBytes) throw new Error(`试玩配置超过 ${maximumBytes} 字节限制`);
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

function assertPathInside(projectRoot: string, target: string): void {
  const pathFromRoot = relative(projectRoot, target);
  if (pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))) {
    return;
  }
  throw new Error('宿主产物路径逃逸项目目录');
}

function safeRuntimeSource(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = parseLoopbackPreviewUrl(value);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`.slice(0, 300);
  } catch {
    return undefined;
  }
}

function sanitizeReportMessage(value: string, projectRoot: string): string {
  return value
    .replaceAll(projectRoot, '<project>')
    .replace(/file:\/\/\/[^\s"'`)]+/giu, '<local-file>')
    .replace(/\/(?:Users|home|tmp|private|var)\/[^\s"'`)]+/gu, '<local-path>')
    .slice(0, 1_000);
}

function safeHistoryTimestamp(value: string | undefined): string {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().replace(/[-:.]/gu, '');
}

function isAllowedPlaytestResource(value: string, expectedOrigin: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'data:') return true;
    if (parsed.protocol === 'blob:') {
      return value.startsWith(`blob:${expectedOrigin}/`);
    }
    return parsed.protocol === 'http:'
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.origin === expectedOrigin;
  } catch {
    return false;
  }
}

function sameOrigin(value: string | undefined, expectedOrigin: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function previewEntrypoint(preview: URL, _entrypointPath: string): URL {
  // PreviewServer already resolves the project-relative production directory
  // and serves its selected entrypoint at `/`. Re-appending the workspace path
  // would address a non-existent nested URL. The manifest path is still
  // strictly validated and persisted as report evidence.
  return new URL(preview.toString());
}

async function validateManifestAgainstWorkspace(
  projectRoot: string,
  manifest: GameplayPlaytestManifest,
): Promise<void> {
  const entrypoint = join(projectRoot, ...manifest.entrypoint.path.split('/'));
  assertPathInside(projectRoot, entrypoint);
  await assertNoSymlinkPath(projectRoot, dirname(entrypoint));
  let entrypointMetadata;
  try {
    entrypointMetadata = await lstat(entrypoint);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`试玩入口不存在：${manifest.entrypoint.path}`);
    }
    throw error;
  }
  if (!entrypointMetadata.isFile() || entrypointMetadata.isSymbolicLink() || entrypointMetadata.nlink !== 1) {
    throw new Error('试玩入口必须是项目内独立普通文件');
  }
  assertPathInside(projectRoot, await realpath(entrypoint));
  if (entrypointMetadata.size === 0) throw new Error('试玩入口 HTML 为空');

  const godotProjectPath = join(projectRoot, 'project.godot');
  let hasGodotProject = false;
  try {
    const godotMetadata = await lstat(godotProjectPath);
    if (!godotMetadata.isFile() || godotMetadata.isSymbolicLink()) {
      throw new Error('project.godot 必须是项目内普通文件');
    }
    hasGodotProject = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (manifest.engine === 'godot' && !hasGodotProject) {
    throw new Error('playtest.engine 声明 godot，但项目没有 project.godot');
  }
  if (manifest.engine === 'web' && hasGodotProject) {
    throw new Error('项目包含 project.godot，playtest.engine 必须声明 godot');
  }
  const expectedPath = manifest.engine === 'godot' ? 'build/web/index.html' : 'dist/index.html';
  if (manifest.entrypoint.path !== expectedPath) {
    throw new Error(`playtest.entrypoint.path 必须是正式入口 ${expectedPath}`);
  }
  const updatedAtMs = Date.parse(manifest.updatedAt);
  if (updatedAtMs > Date.now() + 10 * 60 * 1_000) {
    throw new Error('playtest.updatedAt 不能晚于宿主时间超过 10 分钟');
  }
}

function parseInputs(
  value: unknown,
  path: string,
  stepTimeoutMs: number,
  allowEmpty: boolean,
): GameplayPlaytestInput[] {
  if (!Array.isArray(value) || value.length > MAX_INPUTS_PER_ACTION || (!allowEmpty && value.length === 0)) {
    throw new Error(`${path} 必须包含 ${allowEmpty ? '0 到' : '1 到'} ${MAX_INPUTS_PER_ACTION} 个输入`);
  }
  return value.map((rawInput, index) => {
    const inputPath = `${path}[${index}]`;
    const input = requireRecord(rawInput, inputPath);
    const type = input.type;
    if (type === 'key') {
      requireOnlyKeys(input, ['type', 'code', 'holdMs'], inputPath);
      const code = requireBoundedString(input.code, `${inputPath}.code`, 24);
      if (!isSafeKeyboardCode(code)) throw new Error(`${inputPath}.code 不是允许的 KeyboardEvent.code`);
      return {
        type,
        code,
        holdMs: requireIntegerInRange(
          input.holdMs,
          `${inputPath}.holdMs`,
          0,
          Math.min(5_000, stepTimeoutMs),
        ),
      };
    }
    if (type === 'pointer') {
      requireOnlyKeys(input, ['type', 'xRatio', 'yRatio', 'button'], inputPath);
      const button = requireIntegerInRange(input.button, `${inputPath}.button`, 0, 2);
      return {
        type,
        xRatio: requireNumberInRange(input.xRatio, `${inputPath}.xRatio`, 0, 1),
        yRatio: requireNumberInRange(input.yRatio, `${inputPath}.yRatio`, 0, 1),
        button: button as 0 | 1 | 2,
      };
    }
    if (type === 'look') {
      requireOnlyKeys(input, ['type', 'deltaX', 'deltaY', 'durationMs'], inputPath);
      return {
        type,
        deltaX: requireNumberInRange(input.deltaX, `${inputPath}.deltaX`, -1_000, 1_000),
        deltaY: requireNumberInRange(input.deltaY, `${inputPath}.deltaY`, -1_000, 1_000),
        durationMs: requireIntegerInRange(
          input.durationMs,
          `${inputPath}.durationMs`,
          16,
          Math.min(2_000, stepTimeoutMs),
        ),
      };
    }
    if (type === 'drag') {
      requireOnlyKeys(input, [
        'type',
        'fromXRatio',
        'fromYRatio',
        'toXRatio',
        'toYRatio',
        'button',
        'durationMs',
      ], inputPath);
      const button = requireIntegerInRange(input.button, `${inputPath}.button`, 0, 2);
      return {
        type,
        fromXRatio: requireNumberInRange(input.fromXRatio, `${inputPath}.fromXRatio`, 0, 1),
        fromYRatio: requireNumberInRange(input.fromYRatio, `${inputPath}.fromYRatio`, 0, 1),
        toXRatio: requireNumberInRange(input.toXRatio, `${inputPath}.toXRatio`, 0, 1),
        toYRatio: requireNumberInRange(input.toYRatio, `${inputPath}.toYRatio`, 0, 1),
        button: button as 0 | 1 | 2,
        durationMs: requireIntegerInRange(
          input.durationMs,
          `${inputPath}.durationMs`,
          16,
          Math.min(3_000, stepTimeoutMs),
        ),
      };
    }
    if (type === 'wait') {
      requireOnlyKeys(input, ['type', 'ms'], inputPath);
      return {
        type,
        ms: requireIntegerInRange(input.ms, `${inputPath}.ms`, 0, Math.min(10_000, stepTimeoutMs)),
      };
    }
    throw new Error(`${inputPath}.type 必须是 key、pointer、look、drag 或 wait`);
  });
}

function parseObservations(
  value: unknown,
  path: string,
  requireScreenBaseline: boolean,
): GameplayPlaytestObservation[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error(`${path} 必须是最多 12 项的数组`);
  return value.map((rawObservation, index) => {
    const observationPath = `${path}[${index}]`;
    const observation = requireRecord(rawObservation, observationPath);
    requireOnlyKeys(observation, ['kind', 'description', 'value', 'baselineStepId'], observationPath);
    const kind = requireBoundedString(observation.kind, `${observationPath}.kind`, 32);
    if (!isObservationKind(kind)) throw new Error(`${observationPath}.kind 无效`);
    const description = requireBoundedString(
      observation.description,
      `${observationPath}.description`,
      240,
    );
    const optionalValue = observation.value === undefined
      ? undefined
      : requireBoundedString(observation.value, `${observationPath}.value`, 160);
    const baselineStepId = observation.baselineStepId === undefined
      ? undefined
      : requireIdentifier(observation.baselineStepId, `${observationPath}.baselineStepId`);
    if (kind === 'screen-change' && requireScreenBaseline && !baselineStepId) {
      throw new Error(`${observationPath}.baselineStepId 是 screen-change 的必填项`);
    }
    if (kind === 'text-visible' && !optionalValue) {
      throw new Error(`${observationPath}.value 是 text-visible 的必填文字`);
    }
    if (kind === 'element-visible') {
      if (!optionalValue) throw new Error(`${observationPath}.value 是 element-visible 的必填选择器`);
      validateSafeSelector(optionalValue, `${observationPath}.value`);
    }
    if ((kind === 'canvas-not-blank' || kind === 'screen-change') && optionalValue !== undefined) {
      throw new Error(`${observationPath}.value 不适用于 ${kind}`);
    }
    return { kind, description, value: optionalValue, baselineStepId };
  });
}

function parseLatestGameplayExperienceReport(value: unknown): SharedGameplayExperienceReport | null {
  if (!isRecord(value) || value.version !== 1 || (value.verdict !== 'pass' && value.verdict !== 'repair')) return null;
  if (typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > 100) return null;
  if (typeof value.checkedAt !== 'string' || Number.isNaN(Date.parse(value.checkedAt))) return null;
  if (value.reportPath !== 'artifacts/playtest/latest/report.json') return null;
  if (!Array.isArray(value.checks)) return null;
  const validIds = new Set(['load', 'runtime-errors', 'visible-surface', 'input-response', 'continuous-render', 'restart']);
  const checks: GameplayExperienceCheck[] = [];
  for (const rawCheck of value.checks) {
    if (!isRecord(rawCheck) || !validIds.has(String(rawCheck.id))) return null;
    if (rawCheck.status !== 'pass' && rawCheck.status !== 'repair' && rawCheck.status !== 'skipped') return null;
    if (typeof rawCheck.label !== 'string' || typeof rawCheck.message !== 'string') return null;
    checks.push(rawCheck as unknown as GameplayExperienceCheck);
  }
  if (checks.length !== validIds.size || new Set(checks.map((check) => check.id)).size !== validIds.size) return null;
  return {
    version: 1,
    verdict: value.verdict,
    score: value.score,
    checkedAt: value.checkedAt,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : undefined,
    reportPath: value.reportPath,
    summary: typeof value.summary === 'string' ? value.summary : undefined,
    checks,
  };
}

function validateProjectRelativeHtmlPath(value: string): string {
  if (value.includes('\\') || value.includes('\0') || value.includes('?') || value.includes('#')) {
    throw new Error('playtest.entrypoint.path 包含非法字符');
  }
  if (value.includes('://') || value.startsWith('/') || /^[a-z]:/iu.test(value)) {
    throw new Error('playtest.entrypoint.path 必须是项目相对路径');
  }
  const normalized = posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('playtest.entrypoint.path 不能逃逸项目目录');
  }
  if (posix.extname(normalized).toLowerCase() !== '.html') {
    throw new Error('playtest.entrypoint.path 必须指向 HTML');
  }
  return normalized;
}

function validateSafeSelector(value: string, path: string): void {
  if (value.length > 120 || !/^[a-z0-9_#.[\]="'\-\s>]+$/iu.test(value)) {
    throw new Error(`${path} 不是允许的简单 CSS 选择器`);
  }
  if (/\[\s*(?:src|href|style|onclick)/iu.test(value) || value.includes('..') || value.includes('>>')) {
    throw new Error(`${path} 不能访问游戏文档以外的内容`);
  }
}

function requireSafeCaptureName(value: unknown, path: string): string {
  const name = requireBoundedString(value, path, 80);
  if (!/^[a-z0-9][a-z0-9._-]*\.png$/u.test(name) || name.includes('..')) {
    throw new Error(`${path} 必须是小写安全 PNG 文件名`);
  }
  if (
    name === 'before.png'
    || name === 'idle.png'
    || name === 'after.png'
    || name.startsWith('temporal-')
    || name.startsWith('pause-probe-')
    || name.startsWith('resume-probe-')
  ) {
    throw new Error(`${path} 与宿主保留证据文件名冲突`);
  }
  return name;
}

function requireIdentifier(value: unknown, path: string): string {
  const id = requireBoundedString(value, path, 64);
  if (!/^[a-z0-9][a-z0-9_-]*$/u.test(id)) throw new Error(`${path} 必须是小写稳定安全的 id`);
  return id;
}

function isJourneyAction(value: string): value is GameplayJourneyAction {
  return value === 'launch'
    || value === 'start'
    || value === 'move'
    || value === 'primary'
    || value === 'pause'
    || value === 'restart'
    || value === 'wait';
}

function isObservationKind(value: string): value is GameplayObservationKind {
  return value === 'canvas-not-blank'
    || value === 'screen-change'
    || value === 'text-visible'
    || value === 'element-visible';
}

function isSafeKeyboardCode(value: string): boolean {
  return /^Key[A-Z]$/u.test(value)
    || /^Digit[0-9]$/u.test(value)
    || value === 'Enter'
    || value === 'Space'
    || value === 'Escape'
    || value === 'Tab'
    || value === 'ArrowUp'
    || value === 'ArrowDown'
    || value === 'ArrowLeft'
    || value === 'ArrowRight'
    || value === 'ShiftLeft'
    || value === 'ShiftRight'
    || value === 'ControlLeft'
    || value === 'ControlRight'
    || value === 'AltLeft'
    || value === 'AltRight';
}

function requireOnlyKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedSet.has(key));
  if (unknown) throw new Error(`${path}.${unknown} 是不允许的字段`);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} 必须是对象`);
  return value;
}

function requireBoundedString(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string') throw new Error(`${path} 必须是字符串`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(trimmed)) {
    throw new Error(`${path} 长度或字符无效`);
  }
  return trimmed;
}

function requireIntegerInRange(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${path} 必须是 ${minimum} 到 ${maximum} 的整数`);
  }
  return value as number;
}

function requireNumberInRange(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} 必须是 ${minimum} 到 ${maximum} 的数字`);
  }
  return value;
}

function asPreventableEvent(value: unknown): { preventDefault(): void } | null {
  if (!isRecord(value) || typeof value.preventDefault !== 'function') return null;
  return value as unknown as { preventDefault(): void };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function abortError(): Error {
  const error = new Error('Playtest aborted');
  error.name = 'AbortError';
  return error;
}

function abortSignalError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : abortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

class PlaytestTimeoutError extends Error {
  constructor() {
    super('Playtest timed out');
    this.name = 'PlaytestTimeoutError';
  }
}

class PlaytestStepTimeoutError extends Error {
  constructor(stepId: string, timeoutMs: number) {
    super(`试玩步骤 ${stepId} 超过 ${timeoutMs}ms 时限`);
    this.name = 'PlaytestStepTimeoutError';
  }
}

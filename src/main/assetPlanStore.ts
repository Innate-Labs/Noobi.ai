import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type {
  AssetPlanError,
  AssetPlanRecord,
  AssetPlanRoute,
  GameAssetKind,
  GameAssetRecord,
} from '../shared/contracts.js';
import { findProductionAssetReference } from './imageGenerationAttestation.js';

const DOCUMENT_VERSION = 1 as const;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PLANS = 5_000;
const MAX_PROJECT_PLANS = 200;
const MAX_OPTIONS = 32;
const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const PLAN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTES = new Set<AssetPlanRoute>([
  'configured-api',
  'codex-imagegen',
  'procedural-audio',
  'threejs-fallback',
  'workspace-agent',
]);

interface AssetPlanDocument {
  version: typeof DOCUMENT_VERSION;
  plans: AssetPlanRecord[];
}

export interface AssetPlanUpsertInput {
  id: string;
  projectId: string;
  name: string;
  kind: GameAssetKind;
  prompt: string;
  required?: boolean;
  model?: string;
  options?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * App-private expected-asset ledger. It intentionally lives outside Agent-
 * writable workspaces: asset-pack.json remains a manifest of real, validated
 * files and can never be used to forge generation progress or provider errors.
 */
export class AssetPlanStore {
  readonly #storageFile: string;
  #plans: AssetPlanRecord[] = [];
  #loaded = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(storageFile: string) {
    if (!isAbsolute(storageFile)) throw new Error('Asset plan storage path must be absolute');
    this.#storageFile = resolve(storageFile);
  }

  init(): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#loaded) return;
      await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
      try {
        const info = await stat(this.#storageFile);
        if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Asset plan ledger is invalid');
        this.#plans = parseDocument(await readFile(this.#storageFile, 'utf8'));
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) throw error;
        this.#plans = [];
        await this.#persist();
      }
      const now = new Date().toISOString();
      let recovered = false;
      this.#plans = this.#plans.map((plan) => {
        if (plan.status !== 'generating') return plan;
        recovered = true;
        return {
          ...plan,
          status: 'failed',
          error: {
            code: 'generation-interrupted',
            message: '上次生成在应用退出前未完成，可以重新生成。',
            retryable: true,
          },
          updatedAt: now,
        };
      });
      this.#loaded = true;
      if (recovered) await this.#persist();
    });
  }

  list(projectId: string): Promise<AssetPlanRecord[]> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      assertProjectId(projectId);
      return structuredClone(this.#plans.filter((plan) => plan.projectId === projectId));
    });
  }

  get(projectId: string, planId: string): Promise<AssetPlanRecord> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      return structuredClone(this.#required(projectId, planId));
    });
  }

  removeProject(projectId: string): Promise<void> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      assertProjectId(projectId);
      const next = this.#plans.filter((plan) => plan.projectId !== projectId);
      if (next.length === this.#plans.length) return;
      this.#plans = next;
      await this.#persist();
    });
  }

  upsert(input: AssetPlanUpsertInput): Promise<AssetPlanRecord> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      const normalized = normalizeUpsert(input);
      const index = this.#plans.findIndex((plan) =>
        plan.projectId === normalized.projectId && plan.id === normalized.id);
      const now = new Date().toISOString();
      let plan: AssetPlanRecord;
      if (index < 0) {
        if (this.#plans.length >= MAX_PLANS) throw new Error('Asset plan ledger contains too many entries');
        if (this.#plans.filter((candidate) => candidate.projectId === normalized.projectId).length >= MAX_PROJECT_PLANS) {
          throw new Error('Project contains too many expected assets');
        }
        plan = {
          ...normalized,
          status: 'planned',
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        this.#plans.push(plan);
      } else {
        const current = this.#plans[index]!;
        const kindChanged = current.kind !== normalized.kind;
        plan = {
          ...current,
          ...normalized,
          required: input.required ?? current.required,
          ...(kindChanged ? {
            status: 'planned' as const,
            assetId: undefined,
            relativePath: undefined,
            sha256: undefined,
            referencedBy: undefined,
            route: undefined,
            error: undefined,
          } : {}),
          updatedAt: now,
        };
        this.#plans[index] = compactPlan(plan);
      }
      await this.#persist();
      return structuredClone(compactPlan(plan));
    });
  }

  queue(projectId: string, planId: string): Promise<AssetPlanRecord> {
    return this.#update(projectId, planId, (plan) => {
      if (plan.status === 'generating') throw new Error('Asset is already generating');
      return { ...plan, status: 'queued', error: undefined };
    });
  }

  begin(projectId: string, planId: string, route?: AssetPlanRoute): Promise<AssetPlanRecord> {
    return this.#update(projectId, planId, (plan) => {
      if (plan.status === 'generating') throw new Error('Asset is already generating');
      return {
        ...plan,
        status: 'generating',
        attemptCount: plan.attemptCount + 1,
        ...(route ? { route } : {}),
        error: undefined,
      };
    });
  }

  waitForAgent(projectId: string, planId: string, route: AssetPlanRoute): Promise<AssetPlanRecord> {
    return this.#update(projectId, planId, (plan) => ({
      ...plan,
      status: 'waiting-agent',
      route,
      error: undefined,
    }));
  }

  generated(
    projectId: string,
    planId: string,
    asset: Pick<GameAssetRecord, 'id' | 'kind' | 'relativePath' | 'sha256'>,
    route: AssetPlanRoute,
  ): Promise<AssetPlanRecord> {
    return this.#update(projectId, planId, (plan) => {
      if (asset.kind !== plan.kind) throw new Error('Generated asset kind does not match its plan');
      assertAssetReference(asset);
      return {
        ...plan,
        status: 'generated',
        assetId: asset.id,
        relativePath: asset.relativePath,
        sha256: asset.sha256,
        referencedBy: undefined,
        route,
        error: undefined,
      };
    });
  }

  fail(projectId: string, planId: string, error: AssetPlanError): Promise<AssetPlanRecord> {
    const safeError = validateError(error);
    return this.#update(projectId, planId, (plan) => ({
      ...plan,
      status: 'failed',
      error: safeError,
    }));
  }

  async reconcile(
    projectId: string,
    root: string,
    assets: readonly GameAssetRecord[],
  ): Promise<AssetPlanRecord[]> {
    const plans = await this.list(projectId);
    for (const plan of plans) {
      if (!plan.relativePath || !plan.sha256) continue;
      const asset = assets.find((candidate) =>
        candidate.kind === plan.kind
        && candidate.relativePath === plan.relativePath
        && candidate.sha256 === plan.sha256);
      if (!asset) {
        if (plan.status === 'generated' || plan.status === 'ready') {
          await this.#update(projectId, plan.id, (current) => compactPlan({
            ...current,
            status: 'failed',
            assetId: undefined,
            relativePath: undefined,
            sha256: undefined,
            referencedBy: undefined,
            error: {
              code: 'asset-missing',
              message: '生成的素材文件已不存在或内容发生变化，可以重新生成。',
              retryable: true,
            },
          }), plan);
        }
        continue;
      }
      const referencedBy = await findProductionAssetReference(root, asset.relativePath);
      await this.#update(projectId, plan.id, (current): AssetPlanRecord => compactPlan({
        ...current,
        assetId: asset.id,
        relativePath: asset.relativePath,
        sha256: asset.sha256,
        ...(referencedBy ? { referencedBy } : { referencedBy: undefined }),
        ...(['generated', 'ready'].includes(current.status)
          ? { status: referencedBy ? 'ready' as const : 'generated' as const }
          : {}),
      }), plan);
    }
    return this.list(projectId);
  }

  #required(projectId: string, planId: string): AssetPlanRecord {
    assertProjectId(projectId);
    assertPlanId(planId);
    const plan = this.#plans.find((candidate) => candidate.projectId === projectId && candidate.id === planId);
    if (!plan) throw new Error('Unknown asset plan');
    return plan;
  }

  #update(
    projectId: string,
    planId: string,
    updater: (plan: AssetPlanRecord) => AssetPlanRecord,
    expected?: AssetPlanRecord,
  ): Promise<AssetPlanRecord> {
    return this.#exclusive(async () => {
      await this.#ensureLoaded();
      const current = this.#required(projectId, planId);
      // Reconciliation scans outside the mutation queue. Do not apply its
      // stale result after generation, retry, or another update changed the plan.
      if (expected && JSON.stringify(current) !== JSON.stringify(expected)) {
        return structuredClone(current);
      }
      const index = this.#plans.indexOf(current);
      const candidate = validateRecord(compactPlan({
        ...updater(structuredClone(current)),
        updatedAt: current.updatedAt,
      }));
      const changed = JSON.stringify(current) !== JSON.stringify(candidate);
      if (!changed) return structuredClone(current);
      const next = validateRecord({
        ...candidate,
        updatedAt: new Date().toISOString(),
      });
      this.#plans[index] = next;
      await this.#persist();
      return structuredClone(next);
    });
  }

  async #ensureLoaded(): Promise<void> {
    if (this.#loaded) return;
    await mkdir(dirname(this.#storageFile), { recursive: true, mode: 0o700 });
    try {
      const info = await stat(this.#storageFile);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Asset plan ledger is invalid');
      this.#plans = parseDocument(await readFile(this.#storageFile, 'utf8'));
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) throw error;
      this.#plans = [];
      await this.#persist();
    }
    this.#loaded = true;
  }

  async #persist(): Promise<void> {
    const serialized = `${JSON.stringify({ version: DOCUMENT_VERSION, plans: this.#plans }, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_FILE_BYTES) {
      throw new Error('Asset plan ledger exceeds its size limit');
    }
    const temporary = `${this.#storageFile}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.#storageFile);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function normalizeUpsert(input: AssetPlanUpsertInput): Pick<
  AssetPlanRecord,
  'id' | 'projectId' | 'name' | 'kind' | 'prompt' | 'required' | 'model' | 'options'
> {
  assertProjectId(input.projectId);
  assertPlanId(input.id);
  if (!['image', 'audio', 'model3d'].includes(input.kind)) throw new Error('Invalid asset plan kind');
  const name = safeText(input.name, 160, false);
  const prompt = safeText(input.prompt, 4_000, true);
  const model = input.model === undefined ? undefined : safeText(input.model, 200, false);
  const options = input.options === undefined ? undefined : sanitizeOptions(input.options);
  return compactPlan({
    id: input.id,
    projectId: input.projectId,
    name,
    kind: input.kind,
    prompt,
    required: input.required ?? true,
    ...(model ? { model } : {}),
    ...(options && Object.keys(options).length ? { options } : {}),
  });
}

function parseDocument(contents: string): AssetPlanRecord[] {
  const document = asRecord(JSON.parse(contents) as unknown);
  if (document?.version !== DOCUMENT_VERSION || !Array.isArray(document.plans)) {
    throw new Error('Asset plan ledger has an unsupported schema');
  }
  if (document.plans.length > MAX_PLANS) throw new Error('Asset plan ledger contains too many entries');
  const plans = document.plans.map(validateRecord);
  const keys = new Set<string>();
  for (const plan of plans) {
    const key = `${plan.projectId}:${plan.id}`;
    if (keys.has(key)) throw new Error('Asset plan ledger contains duplicate IDs');
    keys.add(key);
  }
  return plans;
}

function validateRecord(value: unknown): AssetPlanRecord {
  const record = asRecord(value);
  if (!record) throw new Error('Invalid asset plan record');
  const base = normalizeUpsert({
    id: String(record.id ?? ''),
    projectId: String(record.projectId ?? ''),
    name: String(record.name ?? ''),
    kind: record.kind as GameAssetKind,
    prompt: String(record.prompt ?? ''),
    required: record.required as boolean,
    ...(typeof record.model === 'string' ? { model: record.model } : {}),
    ...(asRecord(record.options) ? { options: record.options as Record<string, string | number | boolean> } : {}),
  });
  const status = record.status;
  if (!['planned', 'queued', 'generating', 'waiting-agent', 'generated', 'ready', 'failed'].includes(String(status))) {
    throw new Error('Invalid asset plan status');
  }
  if (typeof record.required !== 'boolean') throw new Error('Invalid asset plan required flag');
  if (!Number.isSafeInteger(record.attemptCount) || Number(record.attemptCount) < 0) {
    throw new Error('Invalid asset plan attempt count');
  }
  const route = record.route;
  if (route !== undefined && (typeof route !== 'string' || !ROUTES.has(route as AssetPlanRoute))) {
    throw new Error('Invalid asset plan route');
  }
  const assetId = optionalText(record.assetId, 200);
  const relativePath = optionalText(record.relativePath, 1_000);
  const sha256 = optionalText(record.sha256, 64);
  if ((relativePath || sha256 || assetId) && (!relativePath || !sha256 || !assetId || !SHA256.test(sha256))) {
    throw new Error('Invalid asset plan asset reference');
  }
  const error = record.error === undefined ? undefined : validateError(record.error as AssetPlanError);
  return compactPlan({
    ...base,
    status: status as AssetPlanRecord['status'],
    attemptCount: Number(record.attemptCount),
    ...(assetId ? { assetId, relativePath: relativePath!, sha256: sha256! } : {}),
    ...(optionalText(record.referencedBy, 1_000) ? { referencedBy: optionalText(record.referencedBy, 1_000)! } : {}),
    ...(route ? { route: route as AssetPlanRoute } : {}),
    ...(error ? { error } : {}),
    createdAt: validTimestamp(record.createdAt),
    updatedAt: validTimestamp(record.updatedAt),
  });
}

function validateError(value: AssetPlanError): AssetPlanError {
  const record = asRecord(value);
  if (!record || typeof record.retryable !== 'boolean') throw new Error('Invalid asset plan error');
  const code = safeText(String(record.code ?? ''), 80, false);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(code)) throw new Error('Invalid asset plan error code');
  return { code, message: safeText(String(record.message ?? ''), 500, true), retryable: record.retryable };
}

function sanitizeOptions(value: Readonly<Record<string, string | number | boolean>>): Record<string, string | number | boolean> {
  const entries = Object.entries(value);
  if (entries.length > MAX_OPTIONS) throw new Error('Asset plan contains too many generation options');
  const output: Record<string, string | number | boolean> = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(key)) throw new Error('Invalid asset plan option name');
    if (typeof item === 'string') output[key] = safeText(item, 3_500, true);
    else if (typeof item === 'boolean') output[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= Number.MAX_SAFE_INTEGER) output[key] = item;
    else throw new Error('Invalid asset plan option value');
  }
  return output;
}

function compactPlan<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function assertAssetReference(asset: Pick<GameAssetRecord, 'id' | 'relativePath' | 'sha256'>): void {
  if (!asset.id || asset.id.length > 200 || !asset.relativePath.startsWith('public/assets/') || !SHA256.test(asset.sha256)) {
    throw new Error('Invalid generated asset reference');
  }
}

function assertProjectId(value: string): void {
  if (!PROJECT_ID.test(value)) throw new Error('Invalid asset plan project ID');
}

function assertPlanId(value: string): void {
  if (!PLAN_ID.test(value)) throw new Error('Invalid asset plan ID');
}

function safeText(value: string, maximum: number, multiline: boolean): string {
  const invalid = multiline
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
    : /[\u0000-\u001f\u007f]/u;
  const output = value.trim();
  if (!output || output.length > maximum || invalid.test(output)) throw new Error('Invalid asset plan text');
  return output;
}

function optionalText(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum ? value : undefined;
}

function validTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || !Number.isFinite(Date.parse(value))) {
    throw new Error('Invalid asset plan timestamp');
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORAGE_VERSION = 1;
const DEFAULT_MAX_RECORDS = 1_000;
const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 200;
const MAX_LABEL_LENGTH = 160;

export type ApiCallSource = 'agent' | 'connection-test' | 'asset';
export type ApiCallStatus = 'success' | 'warning' | 'error';

/**
 * Deliberately excludes credentials, endpoint URLs, prompts and tool payloads.
 * Only operational metadata needed by the settings dashboard is persisted.
 */
export interface ApiUsageInput {
  provider: string;
  model?: string;
  slot?: string;
  projectId?: string;
  source: ApiCallSource;
  status: ApiCallStatus;
  durationMs: number;
  callCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  occurredAt?: string;
}

export interface ApiUsageRecord extends Required<
  Pick<
    ApiUsageInput,
    | 'provider'
    | 'source'
    | 'status'
    | 'durationMs'
    | 'callCount'
    | 'inputTokens'
    | 'outputTokens'
    | 'cacheReadTokens'
    | 'cacheWriteTokens'
    | 'totalTokens'
    | 'occurredAt'
  >
> {
  id: string;
  model?: string;
  slot?: string;
  projectId?: string;
}

export interface ApiUsageTotals {
  runs: number;
  calls: number;
  successes: number;
  warnings: number;
  failures: number;
  durationMs: number;
  averageDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface ProviderUsageSummary extends ApiUsageTotals {
  provider: string;
  lastCalledAt: string;
}

export interface ApiUsageSnapshot {
  generatedAt: string;
  totals: ApiUsageTotals;
  providers: ProviderUsageSummary[];
  recent: ApiUsageRecord[];
}

export interface ApiUsageSnapshotOptions {
  limit?: number;
  since?: string;
}

export interface ApiUsageStoreOptions {
  directory: string;
  maxRecords?: number;
  now?: () => Date;
  idFactory?: () => string;
}

interface PersistedUsage {
  version: number;
  records: ApiUsageRecord[];
}

export class ApiUsageStore {
  private readonly maxRecords: number;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private records: ApiUsageRecord[] = [];
  private initialized = false;
  private operationChain: Promise<void> = Promise.resolve();

  constructor(private readonly options: ApiUsageStoreOptions) {
    this.maxRecords = clampInteger(
      options.maxRecords ?? DEFAULT_MAX_RECORDS,
      1,
      100_000,
    );
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async initialize(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    try {
      const parsed = JSON.parse(
        await readFile(this.storagePath(), 'utf8'),
      ) as unknown;
      this.records = readPersistedRecords(parsed).slice(0, this.maxRecords);
    } catch {
      this.records = [];
    }
    this.initialized = true;
  }

  record(input: ApiUsageInput): Promise<ApiUsageRecord> {
    return this.enqueue(async () => {
      this.requireInitialized();
      const record = normalizeInput(input, this.now(), this.idFactory());
      const previous = this.records;
      this.records = [record, ...previous].slice(0, this.maxRecords);
      try {
        await this.flush();
      } catch (error) {
        this.records = previous;
        throw error;
      }
      return record;
    });
  }

  snapshot(options: ApiUsageSnapshotOptions = {}): ApiUsageSnapshot {
    this.requireInitialized();
    const limit = clampInteger(
      options.limit ?? DEFAULT_RECENT_LIMIT,
      0,
      MAX_RECENT_LIMIT,
    );
    const sinceMs = parseDate(options.since);
    const filtered =
      sinceMs === undefined
        ? this.records
        : this.records.filter(
            (record) => Date.parse(record.occurredAt) >= sinceMs,
          );
    const providers = new Map<string, ApiUsageRecord[]>();
    for (const record of filtered) {
      const entries = providers.get(record.provider) ?? [];
      entries.push(record);
      providers.set(record.provider, entries);
    }

    return {
      generatedAt: this.now().toISOString(),
      totals: summarize(filtered),
      providers: [...providers.entries()]
        .map(([provider, records]) => ({
          provider,
          lastCalledAt: records[0]?.occurredAt ?? '',
          ...summarize(records),
        }))
        .sort((a, b) => b.lastCalledAt.localeCompare(a.lastCalledAt)),
      recent: filtered.slice(0, limit).map((record) => ({ ...record })),
    };
  }

  async flushPending(): Promise<void> {
    await this.operationChain;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.catch(() => undefined).then(operation);
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async flush(): Promise<void> {
    const destination = this.storagePath();
    const temporary = `${destination}.${process.pid}.tmp`;
    const payload: PersistedUsage = {
      version: STORAGE_VERSION,
      records: this.records,
    };
    await writeFile(temporary, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, destination);
  }

  private storagePath(): string {
    return path.join(this.options.directory, 'usage.json');
  }

  private requireInitialized(): void {
    if (!this.initialized) throw new Error('ApiUsageStore 尚未初始化');
  }
}

/**
 * Converts the runtime's final stream-json result into one durable run record.
 * The runtime result is the authoritative source for API duration and tokens.
 */
export function usageFromRuntimeResult(
  message: unknown,
  context: {
    provider: string;
    model?: string;
    slot?: string;
    projectId?: string;
    occurredAt?: string;
  },
): ApiUsageInput | null {
  if (!isRecord(message) || message.type !== 'result') return null;
  const usage = isRecord(message.usage) ? message.usage : undefined;
  const modelUsage = isRecord(message.modelUsage)
    ? summarizeModelUsage(message.modelUsage)
    : undefined;
  const inputTokens =
    numberField(usage?.input_tokens) ?? modelUsage?.inputTokens;
  const outputTokens =
    numberField(usage?.output_tokens) ?? modelUsage?.outputTokens;
  const cacheReadTokens =
    numberField(usage?.cache_read_input_tokens) ?? modelUsage?.cacheReadTokens;
  const cacheWriteTokens =
    numberField(usage?.cache_creation_input_tokens) ??
    modelUsage?.cacheWriteTokens;
  const totalTokens =
    numberField(usage?.total_tokens) ??
    modelUsage?.totalTokens ??
    (inputTokens ?? 0) + (outputTokens ?? 0);
  const subtype = typeof message.subtype === 'string' ? message.subtype : '';

  return {
    ...context,
    provider: context.provider,
    source: 'agent',
    status:
      message.is_error === true || subtype.startsWith('error_')
        ? 'error'
        : 'success',
    durationMs:
      numberField(message.duration_api_ms) ??
      numberField(message.duration_ms) ??
      0,
    callCount: numberField(message.num_turns) ?? 0,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
  };
}

export function usageFromProviderProbe(input: {
  provider: string;
  model?: string;
  slot?: string;
  status: ApiCallStatus;
  latencyMs: number;
  occurredAt?: string;
}): ApiUsageInput {
  return {
    provider: input.provider,
    model: input.model,
    slot: input.slot,
    source: 'connection-test',
    status: input.status,
    durationMs: input.latencyMs,
    callCount: 1,
    occurredAt: input.occurredAt,
  };
}

function normalizeInput(
  input: ApiUsageInput,
  now: Date,
  id: string,
): ApiUsageRecord {
  const provider = cleanLabel(input.provider);
  if (!provider) throw new Error('API 用量记录缺少 Provider');
  const occurredAt = validIsoDate(input.occurredAt) ?? now.toISOString();
  const inputTokens = count(input.inputTokens);
  const outputTokens = count(input.outputTokens);
  const cacheReadTokens = count(input.cacheReadTokens);
  const cacheWriteTokens = count(input.cacheWriteTokens);
  const inferredTotal = inputTokens + outputTokens;

  return {
    id: cleanLabel(id) || randomUUID(),
    provider,
    model: optionalLabel(input.model),
    slot: optionalLabel(input.slot),
    projectId: optionalLabel(input.projectId),
    source: validSource(input.source),
    status: validStatus(input.status),
    durationMs: count(input.durationMs),
    callCount: count(input.callCount ?? 1),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: count(input.totalTokens ?? inferredTotal),
    occurredAt,
  };
}

function readPersistedRecords(value: unknown): ApiUsageRecord[] {
  if (!isRecord(value) || value.version !== STORAGE_VERSION) return [];
  if (!Array.isArray(value.records)) return [];
  return value.records.flatMap((record) => {
    if (!isRecord(record)) return [];
    try {
      return [
        normalizeInput(
          {
            provider: String(record.provider ?? ''),
            model: optionalString(record.model),
            slot: optionalString(record.slot),
            projectId: optionalString(record.projectId),
            source: record.source as ApiCallSource,
            status: record.status as ApiCallStatus,
            durationMs: numberField(record.durationMs) ?? 0,
            callCount: numberField(record.callCount) ?? 0,
            inputTokens: numberField(record.inputTokens),
            outputTokens: numberField(record.outputTokens),
            cacheReadTokens: numberField(record.cacheReadTokens),
            cacheWriteTokens: numberField(record.cacheWriteTokens),
            totalTokens: numberField(record.totalTokens),
            occurredAt: optionalString(record.occurredAt),
          },
          new Date(),
          String(record.id ?? ''),
        ),
      ];
    } catch {
      return [];
    }
  });
}

function summarize(records: ApiUsageRecord[]): ApiUsageTotals {
  const totals = records.reduce(
    (summary, record) => {
      summary.calls += record.callCount;
      summary.durationMs += record.durationMs;
      summary.inputTokens += record.inputTokens;
      summary.outputTokens += record.outputTokens;
      summary.cacheReadTokens += record.cacheReadTokens;
      summary.cacheWriteTokens += record.cacheWriteTokens;
      summary.totalTokens += record.totalTokens;
      if (record.status === 'success') summary.successes += 1;
      else if (record.status === 'warning') summary.warnings += 1;
      else summary.failures += 1;
      return summary;
    },
    {
      runs: records.length,
      calls: 0,
      successes: 0,
      warnings: 0,
      failures: 0,
      durationMs: 0,
      averageDurationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    },
  );
  totals.averageDurationMs = totals.runs
    ? Math.round(totals.durationMs / totals.runs)
    : 0;
  return totals;
}

function summarizeModelUsage(value: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
} {
  type ModelUsageSummary = {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
  };

  return Object.values(value).reduce<ModelUsageSummary>(
    (summary, entry) => {
      if (!isRecord(entry)) return summary;
      summary.inputTokens += count(entry.inputTokens);
      summary.outputTokens += count(entry.outputTokens);
      summary.cacheReadTokens += count(entry.cacheReadInputTokens);
      summary.cacheWriteTokens += count(entry.cacheCreationInputTokens);
      summary.totalTokens +=
        count(entry.inputTokens) + count(entry.outputTokens);
      return summary;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    },
  );
}

function validSource(value: ApiCallSource): ApiCallSource {
  if (value === 'agent' || value === 'connection-test' || value === 'asset') {
    return value;
  }
  throw new Error('API 用量记录来源无效');
}

function validStatus(value: ApiCallStatus): ApiCallStatus {
  if (value === 'success' || value === 'warning' || value === 'error') {
    return value;
  }
  throw new Error('API 用量记录状态无效');
}

function cleanLabel(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

function optionalLabel(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return cleanLabel(value) || undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function count(value: unknown): number {
  const parsed = numberField(value) ?? 0;
  return Math.min(Math.floor(parsed), Number.MAX_SAFE_INTEGER);
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function validIsoDate(value: string | undefined): string | undefined {
  if (!value || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

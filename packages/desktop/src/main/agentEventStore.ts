import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  appendFile,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type {
  AgentEvent,
  AgentHistoryResult,
  AgentEventType,
  PipelineStageId,
  ProjectRecord,
} from '../shared/types.js';

const DURABLE_TYPES = new Set<AgentEventType>([
  'user',
  'lifecycle',
  'thought',
  'assistant',
  'tool_call',
  'tool_result',
  'stderr',
  'error',
  'complete',
]);
const VALID_STAGES = new Set<PipelineStageId>([
  'brief',
  'classify',
  'scaffold',
  'gdd',
  'assets',
  'tilemap',
  'code',
  'verify',
  'complete',
]);
const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENT_TEXT = 12_000;
const MAX_LEGACY_LINE = 8 * 1024 * 1024;

interface HistoryMeta {
  importedSessions: string[];
  historyTruncated?: boolean;
}

export interface AgentEventStoreOptions {
  directory: string;
  recordingRoot?: string;
  maxStoredEvents?: number;
  maxLoadedEvents?: number;
  compactBytes?: number;
}

interface EventFileResult {
  events: AgentEvent[];
  total: number;
}

export class AgentEventStore {
  private readonly recordingRoot: string;
  private readonly maxStoredEvents: number;
  private readonly maxLoadedEvents: number;
  private readonly compactBytes: number;
  private operationChain: Promise<void> = Promise.resolve();
  private eventCounts = new Map<string, number>();

  constructor(private readonly options: AgentEventStoreOptions) {
    this.recordingRoot =
      options.recordingRoot ?? path.join(homedir(), '.qwen', 'projects');
    this.maxStoredEvents = options.maxStoredEvents ?? 2_000;
    this.maxLoadedEvents = options.maxLoadedEvents ?? 500;
    this.compactBytes = options.compactBytes ?? 24 * 1024 * 1024;
  }

  async initialize(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
  }

  append(event: AgentEvent, secrets: string[] = []): Promise<void> {
    if (!isDurableEvent(event)) return Promise.resolve();
    return this.enqueue(async () => {
      const safeEvent = sanitizeEvent(event, secrets);
      const key = projectKey(safeEvent.projectId);
      const eventPath = this.eventPath(safeEvent.projectId);
      await appendFile(eventPath, `${JSON.stringify(safeEvent)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });

      const nextCount = (this.eventCounts.get(key) ?? 0) + 1;
      this.eventCounts.set(key, nextCount);
      const size = await fileSize(eventPath);
      if (nextCount > this.maxStoredEvents || size > this.compactBytes) {
        await this.compact(safeEvent.projectId, secrets);
      }
    });
  }

  load(
    project: ProjectRecord,
    secrets: string[] = [],
  ): Promise<AgentHistoryResult> {
    return this.enqueue(async () => {
      let meta = await this.readMeta(project.id);
      let persisted = await this.readEventFile(project.id, secrets);
      let source: AgentHistoryResult['source'] = persisted.events.length
        ? 'persisted'
        : 'empty';

      const sessionId = project.sessionId;
      if (sessionId && !meta.importedSessions.includes(sessionId)) {
        const recording = await this.resolveRecording(project, sessionId);
        if (recording) {
          const imported = await this.importRecording(
            recording,
            project,
            sessionId,
            secrets,
          );
          const merged = mergeEvents(persisted.events, imported);
          if (merged.length > this.maxStoredEvents) {
            meta.historyTruncated = true;
          }
          const retained = merged.slice(-this.maxStoredEvents);
          await this.writeEvents(project.id, retained);
          meta = {
            ...meta,
            importedSessions: [...meta.importedSessions, sessionId],
          };
          await this.writeMeta(project.id, meta);
          persisted = { events: retained, total: merged.length };
          if (imported.length) source = 'recording';
        }
      }

      this.eventCounts.set(projectKey(project.id), persisted.events.length);
      const visible = persisted.events.slice(-this.maxLoadedEvents);
      return {
        projectId: project.id,
        events: visible,
        hasMore:
          Boolean(meta.historyTruncated) ||
          persisted.events.length > visible.length ||
          persisted.total > persisted.events.length,
        source,
      };
    });
  }

  async flush(): Promise<void> {
    await this.operationChain;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain
      .catch(() => undefined)
      .then(operation);
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async compact(projectId: string, secrets: string[]): Promise<void> {
    const current = await this.readEventFile(projectId, secrets);
    const retained = current.events.slice(-this.maxStoredEvents);
    await this.writeEvents(projectId, retained);
    this.eventCounts.set(projectKey(projectId), retained.length);
    if (current.total > retained.length) {
      const meta = await this.readMeta(projectId);
      meta.historyTruncated = true;
      await this.writeMeta(projectId, meta);
    }
  }

  private async readEventFile(
    projectId: string,
    secrets: string[],
  ): Promise<EventFileResult> {
    const events: AgentEvent[] = [];
    let total = 0;
    try {
      const lines = createInterface({
        input: createReadStream(this.eventPath(projectId), {
          encoding: 'utf8',
        }),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as AgentEvent;
          if (parsed.projectId !== projectId || !isDurableEvent(parsed)) {
            continue;
          }
          total += 1;
          events.push(sanitizeEvent(parsed, secrets));
          if (events.length > this.maxStoredEvents) events.shift();
        } catch {
          // A crashed append may leave one incomplete line. Keep the valid history.
        }
      }
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    return { events, total };
  }

  private async writeEvents(
    projectId: string,
    events: AgentEvent[],
  ): Promise<void> {
    const destination = this.eventPath(projectId);
    const temporary = `${destination}.${process.pid}.tmp`;
    const body = events.map((event) => JSON.stringify(event)).join('\n');
    await writeFile(temporary, body ? `${body}\n` : '', {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, destination);
  }

  private async readMeta(projectId: string): Promise<HistoryMeta> {
    try {
      const parsed = JSON.parse(
        await readFile(this.metaPath(projectId), 'utf8'),
      ) as Partial<HistoryMeta>;
      return {
        importedSessions: Array.isArray(parsed.importedSessions)
          ? parsed.importedSessions.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
        historyTruncated: parsed.historyTruncated === true,
      };
    } catch {
      return { importedSessions: [] };
    }
  }

  private async writeMeta(
    projectId: string,
    meta: HistoryMeta,
  ): Promise<void> {
    const destination = this.metaPath(projectId);
    const temporary = `${destination}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(meta, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, destination);
  }

  private async resolveRecording(
    project: ProjectRecord,
    sessionId: string,
  ): Promise<string | null> {
    if (!SESSION_ID.test(sessionId)) return null;
    const encodedCwd = project.path.replace(/[^a-zA-Z0-9]/g, '-');
    const candidate = path.join(
      this.recordingRoot,
      encodedCwd,
      'chats',
      `${sessionId}.jsonl`,
    );
    try {
      const [root, resolved] = await Promise.all([
        realpath(this.recordingRoot),
        realpath(candidate),
      ]);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        return null;
      }
      return resolved;
    } catch {
      return null;
    }
  }

  private async importRecording(
    recording: string,
    project: ProjectRecord,
    sessionId: string,
    secrets: string[],
  ): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    const lines = createInterface({
      input: createReadStream(recording, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim() || Buffer.byteLength(line, 'utf8') > MAX_LEGACY_LINE) {
        continue;
      }
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (
          record.sessionId !== sessionId ||
          typeof record.cwd !== 'string' ||
          path.resolve(record.cwd) !== path.resolve(project.path)
        ) {
          continue;
        }
        events.push(
          ...legacyRecordToEvents(
            record,
            project,
            lineNumber,
            secrets,
          ),
        );
        if (events.length > this.maxStoredEvents) {
          events.splice(0, events.length - this.maxStoredEvents);
        }
      } catch {
        // Ignore malformed or partially written legacy rows.
      }
    }
    return events;
  }

  private eventPath(projectId: string): string {
    return path.join(this.options.directory, `${projectKey(projectId)}.jsonl`);
  }

  private metaPath(projectId: string): string {
    return path.join(this.options.directory, `${projectKey(projectId)}.meta.json`);
  }
}

function legacyRecordToEvents(
  record: Record<string, unknown>,
  project: ProjectRecord,
  lineNumber: number,
  secrets: string[],
): AgentEvent[] {
  const type = String(record.type ?? '');
  if (!['user', 'assistant', 'tool_result'].includes(type)) return [];
  const message = asRecord(record.message);
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const timestamp = validTimestamp(record.timestamp) ?? project.createdAt;
  const recordId =
    typeof record.uuid === 'string' ? record.uuid : `line-${lineNumber}`;
  let partIndex = 0;
  const make = (
    eventType: AgentEventType,
    title: string,
    value: unknown,
    toolName?: string,
    isError = false,
  ): AgentEvent => {
    partIndex += 1;
    const stage =
      eventType === 'tool_call' && toolName
        ? stageForTool(toolName, project.stage)
        : project.stage;
    return sanitizeEvent(
      {
        id: legacyEventId(project.id, recordId, partIndex),
        projectId: project.id,
        type: eventType,
        stage,
        title,
        message: serializeValue(value, secrets),
        toolName,
        isError,
        timestamp,
      },
      secrets,
    );
  };

  if (type === 'user') {
    return parts
      .map((part) => partText(part))
      .filter((text): text is string => Boolean(text?.trim()))
      .map((text) => make('user', '用户指令', text));
  }

  if (type === 'assistant') {
    const result: AgentEvent[] = [];
    for (const part of parts) {
      if (typeof part === 'string' && part.trim()) {
        result.push(make('assistant', 'Agent 回复', part));
        continue;
      }
      const item = asRecord(part);
      if (!item) continue;
      const functionCall = asRecord(item.functionCall);
      if (functionCall) {
        const toolName = String(functionCall.name ?? 'unknown');
        result.push(
          make(
            'tool_call',
            toolTitle(toolName),
            functionCall.args ?? functionCall.arguments ?? '无参数',
            toolName,
          ),
        );
      }
      if (typeof item.thought === 'string' && item.thought.trim()) {
        result.push(make('thought', 'Agent 思考', item.thought));
      }
      if (typeof item.text === 'string' && item.text.trim()) {
        result.push(
          make(
            item.thought === true ? 'thought' : 'assistant',
            item.thought === true ? 'Agent 思考' : 'Agent 回复',
            item.text,
          ),
        );
      }
    }
    return result;
  }

  const toolCallResult = asRecord(record.toolCallResult);
  const responsePart = parts
    .map(asRecord)
    .map((part) => asRecord(part?.functionResponse))
    .find(Boolean);
  const toolName =
    typeof responsePart?.name === 'string'
      ? responsePart.name
      : typeof toolCallResult?.name === 'string'
        ? toolCallResult.name
        : undefined;
  const status = String(toolCallResult?.status ?? 'success');
  const isError = /error|fail/i.test(status);
  const value =
    toolCallResult?.resultDisplay ??
    responsePart?.response ??
    responsePart ??
    '工具执行完成';
  return [
    make(
      'tool_result',
      isError ? '工具执行失败' : '工具执行完成',
      value,
      toolName,
      isError,
    ),
  ];
}

function mergeEvents(left: AgentEvent[], right: AgentEvent[]): AgentEvent[] {
  const byId = new Map<string, AgentEvent>();
  for (const event of [...left, ...right]) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}

function isDurableEvent(event: AgentEvent): boolean {
  return (
    Boolean(event) &&
    event.type !== 'text_delta' &&
    !(event.type === 'thought' && event.title === '思考中') &&
    DURABLE_TYPES.has(event.type)
  );
}

function sanitizeEvent(event: AgentEvent, secrets: string[]): AgentEvent {
  return {
    id: clamp(String(event.id || 'event'), 240),
    projectId: clamp(String(event.projectId || ''), 240),
    type: DURABLE_TYPES.has(event.type) ? event.type : 'lifecycle',
    stage: VALID_STAGES.has(event.stage) ? event.stage : 'brief',
    title: redact(clamp(String(event.title || 'Agent 事件'), 300), secrets),
    message: redact(clamp(String(event.message ?? ''), MAX_EVENT_TEXT), secrets),
    toolName: event.toolName
      ? redact(clamp(String(event.toolName), 300), secrets)
      : undefined,
    isError: event.isError === true,
    timestamp: validTimestamp(event.timestamp) ?? new Date().toISOString(),
  };
}

function serializeValue(value: unknown, secrets: string[]): string {
  if (typeof value === 'string') return redact(clamp(value, MAX_EVENT_TEXT), secrets);
  const seen = new WeakSet<object>();
  let serialized: string;
  try {
    serialized =
      JSON.stringify(
        value,
        (key, item: unknown) => {
          if (/api.?key|token|secret|authorization|credential/i.test(key)) {
            return '[已隐藏密钥]';
          }
          if (typeof item === 'string') {
            if (key === 'content' && item.length > 800) {
              return `[文件内容：${item.length} 字符]`;
            }
            return clamp(item, MAX_EVENT_TEXT);
          }
          if (item && typeof item === 'object') {
            if (seen.has(item)) return '[循环引用]';
            seen.add(item);
          }
          return item;
        },
        2,
      ) ?? String(value);
  } catch {
    serialized = String(value);
  }
  return redact(clamp(serialized, MAX_EVENT_TEXT), secrets);
}

function redact(value: string, secrets: string[]): string {
  let result = value;
  for (const secret of secrets) {
    if (secret.length >= 8) result = result.split(secret).join('[已隐藏密钥]');
  }
  return result
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [已隐藏密钥]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[已隐藏密钥]')
    .replace(
      /(["']?(?:api.?key|token|secret|authorization|credential)["']?\s*[:=]\s*["']?)([^"',\s}\]]{4,})/gi,
      '$1[已隐藏密钥]',
    );
}

function partText(part: unknown): string | undefined {
  if (typeof part === 'string') return part;
  const item = asRecord(part);
  return typeof item?.text === 'string' ? item.text : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function stageForTool(
  toolName: string,
  fallback: PipelineStageId,
): PipelineStageId {
  if (/todo|plan/i.test(toolName)) return 'brief';
  if (/classify.game.type|game.type.classifier/i.test(toolName)) return 'classify';
  if (/copy.template|scaffold/i.test(toolName)) return 'scaffold';
  if (/generate.gdd/i.test(toolName)) return 'gdd';
  if (/generate.game.assets|generate.assets/i.test(toolName)) return 'assets';
  if (/generate.tilemap/i.test(toolName)) return 'tilemap';
  if (/write.file|replace|edit|smart.edit/i.test(toolName)) return 'code';
  if (/shell|run.*command|test|build/i.test(toolName)) return 'verify';
  return fallback;
}

function toolTitle(toolName: string): string {
  const stage = stageForTool(toolName, 'brief');
  return {
    brief: '拆解制作任务',
    classify: '识别游戏类型',
    scaffold: '搭建项目骨架',
    gdd: '生成游戏设计文档',
    assets: '生成游戏素材',
    tilemap: '生成地图',
    code: '编写游戏代码',
    verify: '构建与验证',
    complete: '调用工具',
  }[stage];
}

function legacyEventId(
  projectId: string,
  recordId: string,
  partIndex: number,
): string {
  return `legacy-${createHash('sha256')
    .update(`${projectId}:${recordId}:${partIndex}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function projectKey(projectId: string): string {
  return createHash('sha256').update(projectId).digest('hex');
}

function clamp(value: string, limit: number): string {
  return value.length > limit
    ? `${value.slice(0, limit)}\n…[已截断 ${value.length - limit} 字符]`
    : value;
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

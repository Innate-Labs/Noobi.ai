import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentEvent } from '../shared/contracts.js';

const MAX_EVENT_BYTES = 64 * 1024;
const MAX_BOOTSTRAP_EVENTS = 400;
const MAX_LOG_BYTES = 8 * 1024 * 1024;

export class EventLog {
  readonly #directory: string;
  readonly #queues = new Map<string, Promise<void>>();

  constructor(directory: string) {
    this.#directory = directory;
  }

  async init(): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
  }

  async append(event: AgentEvent): Promise<void> {
    validateProjectId(event.projectId);
    const serialized = serializeEvent(event);
    const previous = this.#queues.get(event.projectId) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(async () => {
        await rotateIfNeeded(this.#path(event.projectId));
        await appendFile(this.#path(event.projectId), `${serialized}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
      });
    this.#queues.set(event.projectId, current);
    const release = (): void => {
      if (this.#queues.get(event.projectId) === current) this.#queues.delete(event.projectId);
    };
    void current.then(release, release);
    await current;
  }

  async read(projectId: string): Promise<AgentEvent[]> {
    validateProjectId(projectId);
    await this.#queues.get(projectId)?.catch(() => undefined);
    let source: string;
    try {
      source = await readFile(this.#path(projectId), 'utf8');
    } catch (error) {
      if (asNodeError(error).code === 'ENOENT') return [];
      throw error;
    }
    const events = new Map<string, AgentEvent>();
    const lines = source.split(/\r?\n/u).filter(Boolean).slice(-MAX_BOOTSTRAP_EVENTS);
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as AgentEvent;
        if (event.projectId === projectId && typeof event.id === 'string') {
          const previous = events.get(event.id);
          events.set(event.id, previous && event.isDelta
            ? { ...previous, ...event, message: `${previous.message}${event.message}`.slice(-120_000) }
            : event);
        }
      } catch {
        // A partially written final line or older incompatible record is ignored.
      }
    }
    return [...events.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.#queues.values()]);
  }

  #path(projectId: string): string {
    return join(this.#directory, `${projectId}.jsonl`);
  }
}

function serializeEvent(event: AgentEvent): string {
  const serialized = JSON.stringify(event);
  if (Buffer.byteLength(serialized, 'utf8') <= MAX_EVENT_BYTES) return serialized;

  const marker = '\n…（事件日志已按 64 KiB 截断）';
  const codePoints = Array.from(event.message);
  let lower = 0;
  let upper = codePoints.length;
  let best = JSON.stringify({ ...event, message: marker });

  if (Buffer.byteLength(best, 'utf8') > MAX_EVENT_BYTES) {
    throw new Error('Agent event metadata exceeds the 64 KiB persistence limit');
  }

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = JSON.stringify({
      ...event,
      message: `${codePoints.slice(0, middle).join('')}${marker}`,
    });
    if (Buffer.byteLength(candidate, 'utf8') <= MAX_EVENT_BYTES) {
      best = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  return best;
}

async function rotateIfNeeded(path: string): Promise<void> {
  try {
    if ((await stat(path)).size <= MAX_LOG_BYTES) return;
    const previous = `${path}.previous`;
    await rm(previous, { force: true });
    await rename(path, previous);
  } catch (error) {
    if (asNodeError(error).code !== 'ENOENT') throw error;
  }
}

function validateProjectId(value: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(value)) throw new Error('Invalid project id');
}

function asNodeError(value: unknown): NodeJS.ErrnoException {
  return value as NodeJS.ErrnoException;
}

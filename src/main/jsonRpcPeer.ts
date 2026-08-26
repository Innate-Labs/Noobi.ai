import { EventEmitter } from 'node:events';
import { createInterface, type Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

export type JsonRpcId = string | number;

export interface JsonRpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcServerRequest {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface PendingRequest {
  method: string;
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: NodeJS.Timeout;
}

const MAX_OUTBOUND_PROTOCOL_LINE_BYTES = 16 * 1024 * 1024;
// imageGeneration items contain a raw PNG as base64. Keep enough headroom for
// current GPT Image sizes without allowing an unbounded JSONL allocation.
const MAX_INBOUND_PROTOCOL_LINE_BYTES = 48 * 1024 * 1024;

export class JsonRpcRequestError extends Error {
  readonly code: number;
  readonly data: unknown;

  constructor(method: string, error: JsonRpcErrorShape) {
    super(`${method}: ${error.message}`);
    this.name = 'JsonRpcRequestError';
    this.code = error.code;
    this.data = error.data;
  }
}

export class JsonRpcPeer extends EventEmitter {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #pending = new Map<JsonRpcId, PendingRequest>();
  #reader: Interface | null = null;
  #nextId = 1;
  #closed = false;

  constructor(input: Readable, output: Writable) {
    super();
    this.#input = input;
    this.#output = output;
  }

  start(): void {
    if (this.#reader) return;
    this.#reader = createInterface({ input: this.#input, crlfDelay: Infinity });
    this.#reader.on('line', (line) => this.#handleLine(line));
    this.#reader.on('close', () => this.close(new Error('Codex protocol stream closed')));
  }

  async request<T>(method: string, params?: unknown, timeoutMs = 30_000): Promise<T> {
    if (this.#closed) throw new Error('Codex protocol peer is closed');
    const id = this.#nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();
      this.#pending.set(id, {
        method,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.#write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(asError(error));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    this.#write({ method, ...(params === undefined ? {} : { params }) });
  }

  respond(id: JsonRpcId, result: unknown): void {
    this.#write({ id, result });
  }

  respondError(id: JsonRpcId, error: JsonRpcErrorShape): void {
    this.#write({ id, error });
  }

  endOutput(): void {
    if (!this.#closed) this.#output.end();
  }

  close(reason = new Error('Codex protocol peer closed')): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#reader?.close();
    this.#reader = null;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason);
    }
    this.#pending.clear();
    this.emit('closed', reason);
  }

  #write(message: Record<string, unknown>): void {
    if (this.#closed) throw new Error('Codex protocol peer is closed');
    const line = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(line, 'utf8') > MAX_OUTBOUND_PROTOCOL_LINE_BYTES) {
      throw new Error('Codex protocol message exceeds the 16 MiB safety limit');
    }
    this.#output.write(line, 'utf8');
  }

  #handleLine(line: string): void {
    if (!line.trim()) return;
    if (Buffer.byteLength(line, 'utf8') > MAX_INBOUND_PROTOCOL_LINE_BYTES) {
      const error = new Error('Codex emitted a protocol line above the 48 MiB media safety limit');
      this.emit('protocolError', error);
      this.close(error);
      return;
    }
    let message: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('protocol message is not an object');
      }
      message = parsed as Record<string, unknown>;
    } catch (error) {
      this.emit('protocolError', new Error(`Invalid Codex JSONL: ${asError(error).message}`));
      return;
    }

    const method = typeof message.method === 'string' ? message.method : null;
    const id = isJsonRpcId(message.id) ? message.id : null;
    if (method) {
      if (id !== null) {
        this.emit('serverRequest', { id, method, params: message.params } satisfies JsonRpcServerRequest);
      } else {
        this.emit('notification', { method, params: message.params });
      }
      return;
    }

    if (id === null) {
      this.emit('protocolError', new Error('Codex response is missing an id'));
      return;
    }
    const pending = this.#pending.get(id);
    if (!pending) {
      this.emit('protocolError', new Error(`Codex returned an unknown response id: ${String(id)}`));
      return;
    }
    clearTimeout(pending.timer);
    this.#pending.delete(id);
    if (isJsonRpcError(message.error)) {
      pending.reject(new JsonRpcRequestError(pending.method, message.error));
    } else {
      pending.resolve(message.result);
    }
  }
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

function isJsonRpcError(value: unknown): value is JsonRpcErrorShape {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === 'number' && typeof candidate.message === 'string';
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalKind,
  ApprovalRequest,
} from '../shared/contracts.js';
import type { CodexAppServer } from './codexAppServer.js';
import type { JsonRpcId, JsonRpcServerRequest } from './jsonRpcPeer.js';

interface PendingApproval {
  request: JsonRpcServerRequest;
  approval: ApprovalRequest;
  timer: NodeJS.Timeout;
}

const APPROVAL_TIMEOUT_MS = 2 * 60 * 1_000;

export class ApprovalBroker extends EventEmitter {
  readonly #runtime: CodexAppServer;
  readonly #projectForThread: (threadId: string) => string | null;
  readonly #pending = new Map<string, PendingApproval>();
  readonly #tokenForRequest = new Map<JsonRpcId, string>();

  constructor(
    runtime: CodexAppServer,
    projectForThread: (threadId: string) => string | null,
  ) {
    super();
    this.#runtime = runtime;
    this.#projectForThread = projectForThread;
  }

  handle(request: JsonRpcServerRequest): void {
    const kind = approvalKind(request.method);
    if (!kind) {
      if (request.method === 'currentTime/read') {
        this.#runtime.respondToServerRequest(request.id, {
          currentTimeAt: Math.floor(Date.now() / 1_000),
        });
        return;
      } else {
        this.#runtime.rejectServerRequest(
          request.id,
          -32601,
          `Noobi.ai does not support ${request.method}`,
        );
      }
      this.emit('diagnostic', `Unsupported Codex request was denied: ${request.method}`);
      return;
    }

    const params = asRecord(request.params) ?? {};
    const threadId = readString(params.threadId);
    const token = randomUUID();
    const approval: ApprovalRequest = {
      token,
      projectId: threadId ? this.#projectForThread(threadId) : null,
      kind,
      method: request.method,
      title: approvalTitle(kind),
      summary: approvalSummary(kind, params),
      details: redact(params),
      createdAt: new Date().toISOString(),
    };
    const timer = setTimeout(() => this.#expire(token), APPROVAL_TIMEOUT_MS);
    timer.unref();
    this.#pending.set(token, { request, approval, timer });
    this.#tokenForRequest.set(request.id, token);
    this.emit('approval', structuredClone(approval));
  }

  resolve(token: string, decision: ApprovalDecision, answers?: ApprovalAnswers): void {
    const current = this.#pending.get(token);
    if (!current) throw new Error('This approval is no longer active');
    const response = approvalResponse(current.request, decision, answers);
    const pending = this.#take(token)!;
    try {
      this.#runtime.respondToServerRequest(pending.request.id, response);
    } finally {
      this.emit('closed', token);
    }
  }

  resolveFromServer(requestId: JsonRpcId): void {
    const token = this.#tokenForRequest.get(requestId);
    if (token && this.#take(token)) this.emit('closed', token);
  }

  closeAll(): void {
    for (const token of [...this.#pending.keys()]) {
      const pending = this.#take(token);
      if (!pending) continue;
      try {
        this.#runtime.respondToServerRequest(
          pending.request.id,
          approvalResponse(pending.request, 'decline'),
        );
      } catch {
        // The runtime is already closed; pending prompts are still invalidated locally.
      } finally {
        this.emit('closed', token);
      }
    }
  }

  /** Invalidates request ids without writing to a new or already failed runtime generation. */
  invalidateAll(): void {
    for (const token of [...this.#pending.keys()]) {
      if (this.#take(token)) this.emit('closed', token);
    }
  }

  #expire(token: string): void {
    const pending = this.#take(token);
    if (!pending) return;
    try {
      this.#runtime.respondToServerRequest(
        pending.request.id,
        approvalResponse(pending.request, 'decline'),
      );
    } catch (error) {
      this.emit('diagnostic', `Could not send expired approval response: ${asError(error).message}`);
    } finally {
      this.emit('expired', pending.approval);
      this.emit('closed', token);
    }
  }

  #take(token: string): PendingApproval | null {
    const pending = this.#pending.get(token);
    if (!pending) return null;
    clearTimeout(pending.timer);
    this.#pending.delete(token);
    if (this.#tokenForRequest.get(pending.request.id) === token) {
      this.#tokenForRequest.delete(pending.request.id);
    }
    return pending;
  }
}

function approvalKind(method: string): ApprovalKind | null {
  if (method === 'item/commandExecution/requestApproval') return 'command';
  if (method === 'item/fileChange/requestApproval') return 'file';
  if (method === 'item/permissions/requestApproval') return 'permissions';
  if (method === 'item/tool/requestUserInput' || method === 'mcpServer/elicitation/request') {
    return 'input';
  }
  return null;
}

function approvalResponse(
  request: JsonRpcServerRequest,
  decision: ApprovalDecision,
  answers?: ApprovalAnswers,
): unknown {
  if (
    request.method === 'item/commandExecution/requestApproval' ||
    request.method === 'item/fileChange/requestApproval'
  ) {
    return { decision };
  }
  if (request.method === 'item/permissions/requestApproval') {
    const requested = asRecord(request.params)?.permissions;
    const accepted = decision === 'accept' || decision === 'acceptForSession';
    return {
      scope: decision === 'acceptForSession' ? 'session' : 'turn',
      permissions: accepted && requested && typeof requested === 'object' ? requested : {},
    };
  }
  if (request.method === 'item/tool/requestUserInput') {
    return { answers: decision === 'accept' ? validatedAnswers(request.params, answers) : {} };
  }
  if (request.method === 'mcpServer/elicitation/request') {
    return { action: decision === 'cancel' ? 'cancel' : 'decline', content: null };
  }
  throw new Error(`Unsupported approval response method: ${request.method}`);
}

function validatedAnswers(params: unknown, answers: ApprovalAnswers | undefined): Record<string, { answers: string[] }> {
  const questions = asRecord(params)?.questions;
  if (!Array.isArray(questions) || questions.length === 0) return {};
  const result: Record<string, { answers: string[] }> = {};
  for (const question of questions) {
    const id = readString(asRecord(question)?.id);
    if (!id) throw new Error('Codex user-input question is missing an id');
    const values = answers?.[id];
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`Please answer the Codex question: ${id}`);
    }
    if (values.length > 20 || values.some((value) => typeof value !== 'string' || value.length > 10_000)) {
      throw new Error(`Invalid answer for Codex question: ${id}`);
    }
    result[id] = { answers: [...values] };
  }
  return result;
}

function approvalTitle(kind: ApprovalKind): string {
  if (kind === 'command') return '允许执行命令？';
  if (kind === 'file') return '允许修改文件？';
  if (kind === 'permissions') return '允许额外权限？';
  return 'Codex 需要你的输入';
}

function approvalSummary(kind: ApprovalKind, params: Record<string, unknown>): string {
  if (kind === 'command') {
    return readString(params.command) ?? readString(params.reason) ?? 'Codex 请求运行一条命令';
  }
  if (kind === 'file') {
    return readString(params.reason) ?? readString(params.grantRoot) ?? 'Codex 请求写入项目文件';
  }
  if (kind === 'permissions') {
    return readString(params.reason) ?? 'Codex 请求扩大当前回合的访问范围';
  }
  return readString(params.message) ?? readString(params.reason) ?? '请在 Codex 任务中继续提供信息';
}

function redact(value: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(value);
  for (const key of Object.keys(clone)) {
    if (/token|authorization|api.?key|secret/iu.test(key)) clone[key] = '[redacted]';
  }
  return clone;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

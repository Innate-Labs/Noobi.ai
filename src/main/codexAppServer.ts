import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { locateCodexBinary, readCodexVersion } from './codexLocator.js';
import {
  JsonRpcPeer,
  type JsonRpcServerRequest,
} from './jsonRpcPeer.js';
import type {
  LoginStartResult,
  ModelOption,
  RuntimeAccount,
  RuntimeCapabilities,
  RuntimeStatus,
} from '../shared/contracts.js';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface DynamicToolFunctionSpec {
  type: 'function';
  name: string;
  description: string;
  inputSchema: JsonValue;
  deferLoading?: boolean;
}

export interface DynamicToolNamespaceSpec {
  type: 'namespace';
  name: string;
  description: string;
  tools: DynamicToolFunctionSpec[];
}

export type DynamicToolSpec = DynamicToolFunctionSpec | DynamicToolNamespaceSpec;

export interface CodexSkillSummary {
  name: string;
  description: string;
  path: string;
  scope: 'user' | 'repo' | 'system' | 'admin' | string;
  enabled: boolean;
  cwd: string;
}

export interface CodexMcpServerStatus {
  name: string;
  authStatus: string;
  connected: boolean;
  toolCount: number;
}

interface SkillsListResponse {
  data: Array<{
    cwd: string;
    skills: Array<{
      name: string;
      description: string;
      path: string;
      scope: string;
      enabled: boolean;
    }>;
  }>;
}

interface ListMcpServerStatusResponse {
  data: Array<{
    name: string;
    serverInfo: unknown | null;
    tools: Record<string, unknown>;
    authStatus: string;
  }>;
  nextCursor: string | null;
}

interface InitializeResponse {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
}

interface AccountReadResponse {
  account: null | {
    type: string;
    email?: string | null;
    planType?: string | null;
  };
  requiresOpenaiAuth: boolean;
}

interface ModelListResponse {
  data: Array<{
    id: string;
    model: string;
    displayName: string;
    description: string;
    isDefault: boolean;
    defaultReasoningEffort: string;
    supportedReasoningEfforts: Array<{ reasoningEffort: string }>;
  }>;
  nextCursor: string | null;
}

interface ModelProviderCapabilitiesResponse {
  namespaceTools: boolean;
  imageGeneration: boolean;
  webSearch: boolean;
}

interface ThreadResponse {
  thread: { id: string };
  model: string;
}

interface TurnStartResponse {
  turn: { id: string; status: string };
}

export interface TurnResult {
  turnId: string;
  status: string;
  text: string;
  raw: unknown;
}

interface EarlyTurnState {
  text: string;
  completed: TurnResult | null;
}

interface TurnWaiter {
  text: string;
  resolve(result: TurnResult): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export interface StartThreadOptions {
  cwd: string;
  model?: string | null;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approvalPolicy?: 'untrusted' | 'on-request' | 'never';
  developerInstructions?: string;
  ephemeral?: boolean;
  dynamicTools?: DynamicToolSpec[];
}

export interface StartTurnOptions {
  threadId: string;
  prompt: string;
  cwd?: string;
  model?: string | null;
  effort?: string | null;
  approvalPolicy?: 'untrusted' | 'on-request' | 'never';
  skills?: Array<{ name: string; path: string }>;
}

export interface CodexAppServerOptions {
  /** Optional app-owned Codex home. Omitted by CLI smoke tests to use the signed-in user runtime. */
  codexHome?: string;
}

const TURN_TIMEOUT_MS = 20 * 60 * 1_000;

export class CodexAppServer extends EventEmitter {
  readonly #configuredCodexHome: string | null;
  #child: ChildProcessWithoutNullStreams | null = null;
  #peer: JsonRpcPeer | null = null;
  #startPromise: Promise<RuntimeStatus> | null = null;
  #runtime: RuntimeStatus = emptyRuntimeStatus();
  #turnWaiters = new Map<string, TurnWaiter>();
  #earlyTurnStates = new Map<string, EarlyTurnState>();
  #runTurnStartsInFlight = 0;
  #generation = 0;

  constructor(options: CodexAppServerOptions = {}) {
    super();
    if (options.codexHome && !isAbsolute(options.codexHome)) {
      throw new Error('Codex home must be an absolute path');
    }
    this.#configuredCodexHome = options.codexHome ? resolve(options.codexHome) : null;
  }

  get status(): RuntimeStatus {
    return structuredClone(this.#runtime);
  }

  async start(): Promise<RuntimeStatus> {
    if (this.#runtime.state === 'ready' && this.#peer) return this.status;
    if (this.#startPromise) return this.#startPromise;
    const generation = ++this.#generation;
    this.#startPromise = this.#start(generation);
    try {
      return await this.#startPromise;
    } finally {
      this.#startPromise = null;
    }
  }

  async refresh(): Promise<RuntimeStatus> {
    await this.start();
    const [account, models, capabilities] = await Promise.all([
      this.readAccount(),
      this.listModels(),
      this.readModelProviderCapabilities().catch(() => emptyRuntimeCapabilities()),
    ]);
    this.#runtime = {
      ...this.#runtime,
      account,
      models,
      capabilities,
      state: 'ready',
      error: null,
    };
    this.emit('status', this.status);
    return this.status;
  }

  async readModelProviderCapabilities(): Promise<RuntimeCapabilities> {
    const result = await this.#request<ModelProviderCapabilitiesResponse>(
      'modelProvider/capabilities/read',
      {},
    );
    return {
      namespaceTools: result.namespaceTools === true,
      imageGeneration: result.imageGeneration === true,
      externalImageGeneration: false,
      webSearch: result.webSearch === true,
    };
  }

  async readAccount(): Promise<RuntimeAccount | null> {
    const result = await this.#request<AccountReadResponse>('account/read', {
      refreshToken: false,
    });
    if (!result.account) return null;
    return {
      type: result.account.type,
      email: result.account.email ?? null,
      planType: result.account.planType ?? null,
    };
  }

  async listModels(): Promise<ModelOption[]> {
    const models: ModelOption[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result: ModelListResponse = await this.#request<ModelListResponse>('model/list', {
        cursor,
        limit: 100,
        includeHidden: false,
      });
      models.push(
        ...result.data.map((model) => ({
          id: model.id,
          model: model.model,
          displayName: model.displayName,
          description: model.description,
          isDefault: model.isDefault,
          defaultEffort: model.defaultReasoningEffort,
          efforts: model.supportedReasoningEfforts.map((item) => item.reasoningEffort),
        })),
      );
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return models;
  }

  async listSkills(options: { cwds?: string[]; forceReload?: boolean } = {}): Promise<CodexSkillSummary[]> {
    await this.start();
    const result = await this.#request<SkillsListResponse>('skills/list', {
      ...(options.cwds?.length ? { cwds: options.cwds } : {}),
      forceReload: options.forceReload ?? false,
    });
    return result.data.flatMap((entry) => entry.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      scope: skill.scope,
      enabled: skill.enabled,
      cwd: entry.cwd,
    })));
  }

  async setSkillEnabled(selector: { path?: string; name?: string }, enabled: boolean): Promise<boolean> {
    await this.start();
    const result = await this.#request<{ effectiveEnabled: boolean }>('skills/config/write', {
      ...(selector.path ? { path: selector.path } : {}),
      ...(!selector.path && selector.name ? { name: selector.name } : {}),
      enabled,
    });
    return result.effectiveEnabled;
  }

  async listMcpServerStatuses(): Promise<CodexMcpServerStatus[]> {
    await this.start();
    const statuses: CodexMcpServerStatus[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const result: ListMcpServerStatusResponse = await this.#request<ListMcpServerStatusResponse>('mcpServerStatus/list', {
        cursor,
        limit: 100,
        detail: 'toolsAndAuthOnly',
      });
      statuses.push(...result.data.map((server) => ({
        name: server.name,
        authStatus: server.authStatus,
        connected: server.serverInfo !== null,
        toolCount: Object.keys(server.tools ?? {}).length,
      })));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return statuses;
  }

  async readConfig(): Promise<Record<string, unknown>> {
    await this.start();
    const result = await this.#request<{ config: Record<string, unknown> }>('config/read', {
      includeLayers: false,
    });
    return structuredClone(result.config);
  }

  async writeConfigValue(keyPath: string, value: JsonValue): Promise<void> {
    await this.start();
    await this.#request<unknown>('config/value/write', {
      keyPath,
      value,
      mergeStrategy: 'replace',
    });
  }

  async reloadMcpServers(): Promise<void> {
    await this.start();
    await this.#request<unknown>('config/mcpServer/reload');
  }

  async startLogin(): Promise<LoginStartResult> {
    await this.start();
    return this.#request<LoginStartResult>('account/login/start', {
      type: 'chatgpt',
      useHostedLoginSuccessPage: true,
      appBrand: 'chatgpt',
    });
  }

  async logout(): Promise<RuntimeStatus> {
    await this.start();
    await this.#request<Record<string, never>>('account/logout');
    return this.refresh();
  }

  async startThread(options: StartThreadOptions): Promise<string> {
    await this.start();
    const result = await this.#request<ThreadResponse>('thread/start', {
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
      sandbox: options.sandbox ?? 'workspace-write',
      approvalPolicy: options.approvalPolicy ?? 'on-request',
      ...(options.developerInstructions
        ? { developerInstructions: options.developerInstructions }
        : {}),
      ...(options.ephemeral === undefined ? {} : { ephemeral: options.ephemeral }),
      ...(options.dynamicTools ? { dynamicTools: options.dynamicTools } : {}),
      experimentalRawEvents: false,
    });
    return result.thread.id;
  }

  async resumeThread(threadId: string, options: StartThreadOptions): Promise<string> {
    await this.start();
    const result = await this.#request<ThreadResponse>('thread/resume', {
      threadId,
      cwd: options.cwd,
      ...(options.model ? { model: options.model } : {}),
      sandbox: options.sandbox ?? 'workspace-write',
      approvalPolicy: options.approvalPolicy ?? 'on-request',
      ...(options.developerInstructions
        ? { developerInstructions: options.developerInstructions }
        : {}),
      excludeTurns: true,
    });
    return result.thread.id;
  }

  async startTurn(options: StartTurnOptions): Promise<string> {
    await this.start();
    const result = await this.#request<TurnStartResponse>('turn/start', {
      threadId: options.threadId,
      input: [
        { type: 'text', text: options.prompt, text_elements: [] },
        ...(options.skills ?? []).map((skill) => ({
          type: 'skill' as const,
          name: skill.name,
          path: skill.path,
        })),
      ],
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(options.effort ? { effort: options.effort } : {}),
      ...(options.approvalPolicy ? { approvalPolicy: options.approvalPolicy } : {}),
    });
    return result.turn.id;
  }

  async runTurn(options: StartTurnOptions): Promise<TurnResult> {
    this.#runTurnStartsInFlight += 1;
    let turnId: string;
    try {
      turnId = await this.startTurn(options);
    } catch (error) {
      this.#releaseRunTurnStart();
      throw error;
    }

    const early = this.#earlyTurnStates.get(turnId);
    this.#earlyTurnStates.delete(turnId);
    if (early?.completed) {
      this.#releaseRunTurnStart();
      return early.completed;
    }

    return new Promise<TurnResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#turnWaiters.delete(turnId);
        reject(new Error(`Codex turn ${turnId} timed out`));
      }, TURN_TIMEOUT_MS);
      timer.unref();
      this.#turnWaiters.set(turnId, { text: early?.text ?? '', resolve, reject, timer });
      this.#releaseRunTurnStart();
    });
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.#request<Record<string, never>>('turn/interrupt', { threadId, turnId });
  }

  async unsubscribeThread(threadId: string): Promise<void> {
    await this.#request<{ status: string }>('thread/unsubscribe', { threadId });
  }

  respondToServerRequest(requestId: string | number, result: unknown): void {
    if (!this.#peer) throw new Error('Codex App Server is not running');
    this.#peer.respond(requestId, result);
  }

  rejectServerRequest(requestId: string | number, code: number, message: string): void {
    if (!this.#peer) throw new Error('Codex App Server is not running');
    this.#peer.respondError(requestId, { code, message });
  }

  async stop(): Promise<void> {
    this.#generation += 1;
    const child = this.#child;
    const peer = this.#peer;
    this.#child = null;
    this.#peer = null;
    for (const waiter of this.#turnWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Codex App Server stopped during the turn'));
    }
    this.#turnWaiters.clear();
    this.#earlyTurnStates.clear();
    this.#runTurnStartsInFlight = 0;
    if (child && child.exitCode === null) {
      peer?.endOutput();
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]);
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await Promise.race([
          new Promise<void>((resolve) => child.once('exit', () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
        ]);
      }
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    peer?.close(new Error('Codex App Server stopped'));
    this.#runtime = emptyRuntimeStatus();
    this.emit('status', this.status);
  }

  async #start(generation: number): Promise<RuntimeStatus> {
    this.#runtime = { ...emptyRuntimeStatus(), state: 'starting' };
    this.emit('status', this.status);
    let child: ChildProcessWithoutNullStreams | null = null;
    let peer: JsonRpcPeer | null = null;
    try {
      if (this.#configuredCodexHome) {
        await mkdir(this.#configuredCodexHome, { recursive: true, mode: 0o700 });
      }
      const binaryPath = await locateCodexBinary();
      this.#assertGeneration(generation);
      const version = readCodexVersion(binaryPath);
      this.#assertGeneration(generation);
      child = spawn(binaryPath, ['app-server', '--listen', 'stdio://', '--strict-config'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          RUST_LOG: process.env.RUST_LOG ?? 'warn',
          LOG_FORMAT: 'json',
          ...(this.#configuredCodexHome ? { CODEX_HOME: this.#configuredCodexHome } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.#child = child;
      peer = new JsonRpcPeer(child.stdout, child.stdin);
      this.#peer = peer;
      peer.on('notification', (notification) => this.#handleNotification(notification));
      peer.on('serverRequest', (request: JsonRpcServerRequest) => this.emit('serverRequest', request));
      peer.on('protocolError', (error) => this.emit('diagnostic', asError(error).message));
      peer.once('closed', (error) => {
        if (this.#peer !== peer || this.#child !== child) return;
        if (child?.exitCode === null) child.kill('SIGTERM');
        this.#handleExit(child!, asError(error));
      });
      peer.start();
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        for (const line of chunk.split(/\r?\n/u).filter(Boolean)) {
          this.emit('diagnostic', sanitizeDiagnostic(line));
        }
      });
      child.once('error', (error) => this.#handleExit(child!, error));
      child.once('exit', (code, signal) => {
        this.#handleExit(
          child!,
          new Error(`Codex App Server exited (${code ?? signal ?? 'unknown'})`),
        );
      });

      const initialized = await peer.request<InitializeResponse>('initialize', {
        clientInfo: {
          name: 'noobi_ai',
          title: 'Noobi.ai Game Agent',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      });
      this.#assertGeneration(generation);
      peer.notify('initialized');
      this.#runtime = {
        state: 'ready',
        binaryPath,
        version,
        codexHome: initialized.codexHome,
        account: null,
        models: [],
        capabilities: emptyRuntimeCapabilities(),
        error: null,
      };
      return await this.refresh();
    } catch (error) {
      const message = asError(error).message;
      peer?.close(asError(error));
      if (this.#peer === peer) this.#peer = null;
      if (this.#child === child) this.#child = null;
      if (child && child.exitCode === null) child.kill('SIGTERM');
      if (generation === this.#generation) {
        this.#runtime = { ...this.#runtime, state: 'error', error: message };
        this.emit('status', this.status);
      }
      throw error;
    }
  }

  #request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.#peer) throw new Error('Codex App Server is not running');
    return this.#peer.request<T>(method, params);
  }

  #handleNotification(notification: { method: string; params?: unknown }): void {
    const params = asRecord(notification.params);
    const turnId = readString(params?.turnId) ?? readString(asRecord(params?.turn)?.id);
    if (turnId) {
      const waiter = this.#turnWaiters.get(turnId);
      if (waiter && notification.method === 'item/agentMessage/delta') {
        waiter.text += readString(params?.delta) ?? '';
      }
      if (waiter && notification.method === 'item/completed') {
        const item = asRecord(params?.item);
        if (item?.type === 'agentMessage' && typeof item.text === 'string') {
          waiter.text = item.text;
        }
      }
      if (waiter && notification.method === 'turn/completed') {
        clearTimeout(waiter.timer);
        this.#turnWaiters.delete(turnId);
        const turn = asRecord(params?.turn);
        waiter.resolve({
          turnId,
          status: readString(turn?.status) ?? 'completed',
          text: waiter.text,
          raw: params,
        });
      }
      if (!waiter && this.#runTurnStartsInFlight > 0) {
        const early = this.#earlyTurnStates.get(turnId) ?? { text: '', completed: null };
        if (notification.method === 'item/agentMessage/delta') {
          early.text += readString(params?.delta) ?? '';
        }
        if (notification.method === 'item/completed') {
          const item = asRecord(params?.item);
          if (item?.type === 'agentMessage' && typeof item.text === 'string') {
            early.text = item.text;
          }
        }
        if (notification.method === 'turn/completed') {
          const turn = asRecord(params?.turn);
          early.completed = {
            turnId,
            status: readString(turn?.status) ?? 'completed',
            text: early.text,
            raw: params,
          };
        }
        this.#earlyTurnStates.set(turnId, early);
      }
    }

    if (notification.method === 'account/updated' || notification.method === 'account/login/completed') {
      void this.refresh().catch((error) => this.emit('diagnostic', asError(error).message));
    }
    this.emit('notification', notification);
  }

  #handleExit(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.#child !== child) return;
    this.#peer?.close(error);
    this.#peer = null;
    this.#child = null;
    this.#runtime = { ...this.#runtime, state: 'error', error: error.message };
    for (const waiter of this.#turnWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.#turnWaiters.clear();
    this.#earlyTurnStates.clear();
    this.#runTurnStartsInFlight = 0;
    this.emit('status', this.status);
  }

  #assertGeneration(generation: number): void {
    if (generation !== this.#generation) throw new Error('Codex App Server start was cancelled');
  }

  #releaseRunTurnStart(): void {
    this.#runTurnStartsInFlight = Math.max(0, this.#runTurnStartsInFlight - 1);
    if (this.#runTurnStartsInFlight === 0) this.#earlyTurnStates.clear();
  }
}

function emptyRuntimeStatus(): RuntimeStatus {
  return {
    state: 'stopped',
    binaryPath: null,
    version: null,
    codexHome: null,
    account: null,
    models: [],
    capabilities: emptyRuntimeCapabilities(),
    error: null,
  };
}

function emptyRuntimeCapabilities(): RuntimeCapabilities {
  return {
    namespaceTools: false,
    imageGeneration: false,
    externalImageGeneration: false,
    webSearch: false,
  };
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

function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]{12,}/gu, 'sk-[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, 'Bearer [redacted]')
    .slice(0, 4_000);
}

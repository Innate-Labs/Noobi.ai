import type { CodexAppServer, DynamicToolSpec } from './codexAppServer.js';
import type { JsonRpcServerRequest } from './jsonRpcPeer.js';
import type { ProjectRecord } from '../shared/contracts.js';

export type GodotCheckMode = 'build' | 'playtest';
export const GODOT_DYNAMIC_TOOLS: DynamicToolSpec[] = [{
  type: 'function', name: 'noobi_godot_check',
  description: 'Build and test the current Godot game through Noobi, using its configured engine in an isolated source snapshot. Prefer this over launching Godot in the coding sandbox, which cannot write engine user logs/settings. mode=build runs import, script checks, main-scene runtime and Web export. mode=playtest also runs the real input journey in .noobi/playtest.json, writes host-owned screenshots/report, and checks victory, negative feedback and restart. Read journey for per-step actual state, actor position/velocity/onFloor and failed expectations; use those observations to diagnose route geometry and inputs without weakening the game. visualSample reports intermediate binding failures separately. Read screenshots for art quality. This tool does not waive media or quality requirements and never marks a project complete.',
  inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['build', 'playtest'] } }, required: ['mode'], additionalProperties: false },
}];

export class GodotToolBroker {
  readonly #runs = new Map<string, AbortController>();
  #closed = false;
  constructor(private readonly options: {
    server: Pick<CodexAppServer, 'respondToServerRequest'>;
    resolveProject(threadId: string): Promise<ProjectRecord | null>;
    check(project: ProjectRecord, mode: GodotCheckMode, signal: AbortSignal): Promise<unknown>;
  }) {}

  handle(request: JsonRpcServerRequest): boolean {
    const params = record(request.params);
    if (request.method !== 'item/tool/call' || params?.tool !== 'noobi_godot_check') return false;
    void this.#handle(request).catch(() => undefined);
    return true;
  }

  cancel(projectId: string): void { this.#runs.get(projectId)?.abort(); }
  close(): void { this.#closed = true; for (const run of this.#runs.values()) run.abort(); }

  async #handle(request: JsonRpcServerRequest): Promise<void> {
    let projectId: string | null = null;
    let controller: AbortController | null = null;
    let timer: NodeJS.Timeout | null = null;
    try {
      const params = record(request.params)!;
      const args = record(params.arguments);
      if (!args || Object.keys(args).some(k => k !== 'mode') || !['build', 'playtest'].includes(String(args.mode))) {
        throw new Error('Provide only mode=build or mode=playtest; project paths and commands are host-owned.');
      }
      const project = typeof params.threadId === 'string' ? await this.options.resolveProject(params.threadId) : null;
      if (!project || project.engine !== 'godot') throw new Error('This call requires an active Godot Implementer project.');
      if (this.#closed) throw new Error('Noobi is shutting down.');
      if (this.#runs.has(project.id)) throw new Error('A Godot check is already running for this project; wait for its result.');
      projectId = project.id;
      controller = new AbortController();
      this.#runs.set(project.id, controller);
      timer = setTimeout(() => controller?.abort(), 120_000);
      timer.unref();
      const result = await this.options.check(project, args.mode as GodotCheckMode, controller.signal);
      controller.signal.throwIfAborted();
      this.options.server.respondToServerRequest(request.id, { success: true,
        contentItems: [{ type: 'inputText', text: JSON.stringify(result) }] });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Godot check failed';
      this.options.server.respondToServerRequest(request.id, { success: false,
        contentItems: [{ type: 'inputText', text: JSON.stringify({ ok: false,
          error: controller?.signal.aborted ? 'Godot check cancelled or exceeded its 120-second deadline.' : message.slice(0, 8000) }) }] });
    } finally {
      if (timer) clearTimeout(timer);
      if (projectId && this.#runs.get(projectId) === controller) this.#runs.delete(projectId);
    }
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

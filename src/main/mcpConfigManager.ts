import type {
  CodexAppServer,
  CodexMcpServerStatus,
  JsonValue,
} from './codexAppServer.js';

const MCP_ID = /^[a-zA-Z0-9_-]{1,64}$/u;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;
const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_LENGTH = 2_000;
const MAX_COMMAND_LENGTH = 500;
const MAX_URL_LENGTH = 2_048;

export type McpTransport = 'stdio' | 'http';

export interface McpServerInput {
  id: string;
  transport: McpTransport;
  command?: string | null;
  args?: string[];
  url?: string | null;
  enabled: boolean;
  bearerTokenEnvVar?: string | null;
}

export interface McpServerSetting {
  id: string;
  transport: McpTransport;
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  bearerTokenEnvVar: string | null;
  connected: boolean;
  toolCount: number;
  authStatus: string;
}

type McpRuntime = Pick<
  CodexAppServer,
  'readConfig' | 'writeConfigValue' | 'reloadMcpServers' | 'listMcpServerStatuses'
>;

/**
 * A narrow, validated view over Codex's native `mcp_servers` config. It never
 * accepts shell source or bearer-token values; STDIO arguments are passed as an
 * argv array, while HTTP credentials must be referenced by environment name.
 */
export class McpConfigManager {
  readonly #runtime: McpRuntime;

  constructor(runtime: McpRuntime) {
    this.#runtime = runtime;
  }

  async list(): Promise<McpServerSetting[]> {
    const [config, statuses] = await Promise.all([
      this.#runtime.readConfig(),
      this.#runtime.listMcpServerStatuses().catch(() => []),
    ]);
    const statusByName = new Map(statuses.map((status) => [status.name, status]));
    const rawServers = asRecord(config.mcp_servers) ?? {};
    return Object.entries(rawServers)
      .filter(([id]) => MCP_ID.test(id))
      .flatMap(([id, value]) => {
        const parsed = parseStoredServer(id, value, statusByName.get(id));
        return parsed ? [parsed] : [];
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async save(input: McpServerInput): Promise<McpServerSetting[]> {
    const server = validateServerInput(input);
    const config: Record<string, JsonValue> = { enabled: server.enabled };
    if (server.transport === 'stdio') {
      config.command = server.command!;
      config.args = server.args;
    } else {
      config.url = server.url!;
      if (server.bearerTokenEnvVar) {
        config.bearer_token_env_var = server.bearerTokenEnvVar;
      }
    }
    await this.#runtime.writeConfigValue(`mcp_servers.${server.id}`, config);
    await this.#runtime.reloadMcpServers();
    return this.list();
  }

  async remove(id: string): Promise<McpServerSetting[]> {
    const validatedId = validateId(id);
    // Codex's config writer treats JSON null as deletion for a leaf key path.
    await this.#runtime.writeConfigValue(`mcp_servers.${validatedId}`, null);
    await this.#runtime.reloadMcpServers();
    return this.list();
  }
}

function validateServerInput(input: McpServerInput): Required<Omit<McpServerInput, 'command' | 'url' | 'bearerTokenEnvVar'>> & {
  command: string | null;
  url: string | null;
  bearerTokenEnvVar: string | null;
} {
  if (!input || typeof input !== 'object') throw new Error('无效的 MCP 配置');
  const id = validateId(input.id);
  if (input.transport !== 'stdio' && input.transport !== 'http') {
    throw new Error('MCP 传输方式必须是 stdio 或 http');
  }
  if (typeof input.enabled !== 'boolean') throw new Error('MCP enabled 必须是布尔值');
  const args = input.args ?? [];
  if (!Array.isArray(args) || args.length > MAX_ARGUMENTS || args.some((value) =>
    typeof value !== 'string' || value.length > MAX_ARGUMENT_LENGTH || value.includes('\0'))) {
    throw new Error('MCP 参数列表无效');
  }
  if (input.transport === 'stdio') {
    const command = input.command?.trim() ?? '';
    if (!command || command.length > MAX_COMMAND_LENGTH || command.includes('\0')) {
      throw new Error('STDIO MCP 必须提供有效命令');
    }
    return {
      id,
      transport: 'stdio',
      command,
      args: [...args],
      url: null,
      enabled: input.enabled,
      bearerTokenEnvVar: null,
    };
  }

  const url = validateHttpUrl(input.url);
  const bearerTokenEnvVar = input.bearerTokenEnvVar?.trim() || null;
  if (bearerTokenEnvVar && !ENVIRONMENT_NAME.test(bearerTokenEnvVar)) {
    throw new Error('Bearer Token 环境变量名无效');
  }
  return {
    id,
    transport: 'http',
    command: null,
    args: [],
    url,
    enabled: input.enabled,
    bearerTokenEnvVar,
  };
}

function validateId(value: unknown): string {
  if (typeof value !== 'string' || !MCP_ID.test(value)) {
    throw new Error('MCP ID 只能包含字母、数字、连字符和下划线');
  }
  return value;
}

function validateHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    throw new Error('HTTP MCP 必须提供有效 URL');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('HTTP MCP 必须提供有效 URL');
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error('MCP URL 不得包含凭据或片段');
  }
  const local = parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '[::1]'
    || parsed.hostname === '::1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error('远程 MCP 必须使用 HTTPS；HTTP 仅允许本机地址');
  }
  return parsed.toString();
}

function parseStoredServer(
  id: string,
  value: unknown,
  status?: CodexMcpServerStatus,
): McpServerSetting | null {
  const record = asRecord(value);
  if (!record) return null;
  const command = readString(record.command);
  const url = readString(record.url);
  const transport: McpTransport = url ? 'http' : command ? 'stdio' : 'stdio';
  const args = Array.isArray(record.args)
    ? record.args.filter((item): item is string => typeof item === 'string').slice(0, MAX_ARGUMENTS)
    : [];
  return {
    id,
    transport,
    command,
    args,
    url,
    enabled: record.enabled !== false,
    bearerTokenEnvVar: readString(record.bearer_token_env_var),
    connected: status?.connected ?? false,
    toolCount: status?.toolCount ?? 0,
    authStatus: status?.authStatus ?? 'unknown',
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

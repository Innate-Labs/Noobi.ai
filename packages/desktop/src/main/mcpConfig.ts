import path from 'node:path';
import type { McpServerDefinition, SecretField } from '../shared/types.js';

export interface RuntimeMcpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  headers?: Record<string, string>;
  timeout: number;
  trust: boolean;
  description?: string;
}

export function validateMcpServers(value: unknown): McpServerDefinition[] {
  if (!Array.isArray(value)) throw new Error('MCP 配置必须是数组。');
  if (value.length > 32) throw new Error('MCP Server 数量不能超过 32 个。');
  const names = new Set<string>();
  const ids = new Set<string>();

  const servers: McpServerDefinition[] = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`第 ${index + 1} 个 MCP Server 配置无效。`);
    }
    const input = candidate as Record<string, unknown>;
    const id = requiredString(input.id, 'MCP ID', 160);
    const name = requiredString(input.name, 'MCP 名称', 64);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      throw new Error('MCP 名称只能包含字母、数字、点、下划线和连字符。');
    }
    if (names.has(name)) throw new Error(`MCP 名称重复：${name}`);
    if (ids.has(id)) throw new Error(`MCP ID 重复：${id}`);
    names.add(name);
    ids.add(id);

    const transport = input.transport;
    if (transport !== 'stdio' && transport !== 'http' && transport !== 'sse') {
      throw new Error(`${name} 的传输类型无效。`);
    }
    const command = optionalString(input.command, 'Command', 4096);
    const url = optionalString(input.url, 'URL', 4096);
    if (transport === 'stdio' && !command) {
      throw new Error(`${name} 必须填写启动 Command。`);
    }
    if (transport !== 'stdio') validateHttpUrl(url, `${name} URL`);
    const cwd = optionalString(input.cwd, 'Working Directory', 4096);
    if (cwd && !path.isAbsolute(cwd)) {
      throw new Error(`${name} 的 Working Directory 必须是绝对路径。`);
    }

    const args = stringArray(input.args, `${name} Args`, 100, 4096);
    const timeoutMs = Number(input.timeoutMs);
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 600_000
    ) {
      throw new Error(`${name} 的 Timeout 必须在 1000–600000 ms 之间。`);
    }

    return {
      id,
      name,
      description: optionalString(input.description, 'Description', 500),
      enabled: input.enabled !== false,
      transport,
      command,
      args,
      cwd,
      url,
      timeoutMs: Math.trunc(timeoutMs),
      trust: input.trust === true,
      env: secretFields(input.env, `${name} Env`),
      headers: secretFields(input.headers, `${name} Headers`),
    };
  });
  if (Buffer.byteLength(JSON.stringify(servers), 'utf8') > 256 * 1024) {
    throw new Error('MCP 配置总大小不能超过 256 KB。');
  }
  return servers;
}

export function toRuntimeMcpServers(
  servers: McpServerDefinition[],
): Record<string, RuntimeMcpServerConfig> {
  return Object.fromEntries(
    servers
      .filter((server) => server.enabled)
      .map((server) => {
        const common: RuntimeMcpServerConfig = {
          timeout: server.timeoutMs,
          trust: server.trust,
          ...(server.description ? { description: server.description } : {}),
        };
        if (server.transport === 'stdio') {
          return [
            server.name,
            {
              ...common,
              command: server.command,
              ...(server.args.length ? { args: server.args } : {}),
              ...(server.cwd ? { cwd: server.cwd } : {}),
              ...(server.env.length ? { env: fieldsToRecord(server.env) } : {}),
            },
          ];
        }
        return [
          server.name,
          {
            ...common,
            ...(server.transport === 'http'
              ? { httpUrl: server.url }
              : { url: server.url }),
            ...(server.headers.length
              ? { headers: fieldsToRecord(server.headers) }
              : {}),
          },
        ];
      }),
  );
}

export function collectMcpSecrets(servers: McpServerDefinition[]): string[] {
  return servers.flatMap((server) =>
    [...server.env, ...server.headers]
      .map((field) => field.value)
      .filter((value) => value.length >= 8),
  );
}

function fieldsToRecord(fields: SecretField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.value]));
}

function secretFields(value: unknown, label: string): SecretField[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组。`);
  if (value.length > 64) throw new Error(`${label} 不能超过 64 项。`);
  const names = new Set<string>();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`${label} 条目无效。`);
    }
    const input = candidate as Record<string, unknown>;
    const name = requiredString(input.name, `${label} 名称`, 256);
    if (/\s|[=\0]/.test(name)) throw new Error(`${label} 名称格式无效。`);
    if (names.has(name)) throw new Error(`${label} 名称重复：${name}`);
    names.add(name);
    return {
      name,
      value: optionalString(input.value, `${label} 值`, 16_384),
      configured: input.configured === true,
    };
  });
}

function stringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组。`);
  if (value.length > maxItems) throw new Error(`${label} 数量过多。`);
  return value.map((item) => requiredString(item, label, maxLength));
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  const result = optionalString(value, label, maxLength);
  if (!result) throw new Error(`${label} 不能为空。`);
  return result;
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串。`);
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label} 内容过长。`);
  return result;
}

function validateHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} 格式无效。`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} 只允许 HTTP(S)。`);
  }
}

/**
 * Credentials supplied by the GameAgent desktop main process over an inherited
 * anonymous pipe. They never appear in argv, process.env, project files, or the
 * renderer process.
 */

import { closeSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  MCPServerConfig,
  OpenGameProvidersSettings,
  ProviderName,
} from '@opengame/opengame-core';

interface DesktopMainProvider {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface DesktopCredentials {
  main: DesktopMainProvider;
  providers: OpenGameProvidersSettings;
  mcpServers: Record<string, MCPServerConfig>;
}

let loaded = false;
let cached: DesktopCredentials | undefined;

const PROVIDERS = new Set<ProviderName>([
  'openai-compat',
  'tongyi',
  'doubao',
  'elevenlabs',
  'minimax',
  'stability',
  'google-lyria',
  'mureka',
]);
const STANDARD_PROVIDERS = new Set<ProviderName>([
  'openai-compat',
  'tongyi',
  'doubao',
]);

export function getDesktopCredentials(): DesktopCredentials | undefined {
  if (loaded) return cached;
  loaded = true;

  const descriptorText = process.env['GAMEAGENT_CREDENTIAL_FD'];
  delete process.env['GAMEAGENT_CREDENTIAL_FD'];
  if (!descriptorText) return undefined;

  const descriptor = Number(descriptorText);
  if (!Number.isInteger(descriptor) || descriptor < 3) {
    throw new Error('GameAgent credential channel is invalid.');
  }

  try {
    const raw = readFileSync(descriptor, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 512 * 1024) {
      throw new Error('credential payload too large');
    }
    cached = validateCredentials(JSON.parse(raw) as unknown);
    return cached;
  } catch {
    throw new Error('Unable to read the GameAgent credential channel.');
  } finally {
    try {
      closeSync(descriptor);
    } catch {
      // The descriptor may already be closed after a failed read.
    }
  }
}

function validateCredentials(value: unknown): DesktopCredentials {
  if (!value || typeof value !== 'object') throw new Error('invalid payload');
  const payload = value as Record<string, unknown>;
  const main = validateEndpoint(payload.main, true, false);
  const providerInput =
    payload.providers && typeof payload.providers === 'object'
      ? (payload.providers as Record<string, unknown>)
      : {};
  const providers: OpenGameProvidersSettings = {};

  for (const modality of ['reasoning', 'image', 'video', 'audio'] as const) {
    const candidate = validateEndpoint(
      providerInput[modality],
      false,
      modality === 'audio',
    );
    if (candidate.apiKey) providers[modality] = candidate;
  }

  return {
    main,
    providers,
    mcpServers: validateMcpServers(payload.mcpServers),
  };
}

function validateMcpServers(value: unknown): Record<string, MCPServerConfig> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid MCP payload');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 32) throw new Error('too many MCP servers');
  return Object.fromEntries(
    entries.map(([name, candidate]) => {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
        throw new Error('invalid MCP server name');
      }
      if (!candidate || typeof candidate !== 'object') {
        throw new Error('invalid MCP server');
      }
      const input = candidate as Record<string, unknown>;
      const command = cleanOptionalString(input.command, 4096);
      const url = cleanOptionalUrl(input.url);
      const httpUrl = cleanOptionalUrl(input.httpUrl);
      if (!command && !url && !httpUrl)
        throw new Error('missing MCP transport');
      if ([command, url, httpUrl].filter(Boolean).length !== 1) {
        throw new Error('ambiguous MCP transport');
      }
      const timeout = Number(input.timeout);
      if (!Number.isFinite(timeout) || timeout < 1_000 || timeout > 600_000) {
        throw new Error('invalid MCP timeout');
      }
      const cwd = cleanOptionalString(input.cwd, 4096);
      if (cwd && !path.isAbsolute(cwd)) throw new Error('invalid MCP cwd');
      return [
        name,
        {
          ...(command ? { command } : {}),
          ...(url ? { url } : {}),
          ...(httpUrl ? { httpUrl } : {}),
          ...(cwd ? { cwd } : {}),
          args: cleanStringArray(input.args, 100, 4096),
          env: cleanStringRecord(input.env, 64, 16_384),
          headers: cleanStringRecord(input.headers, 64, 16_384),
          timeout: Math.trunc(timeout),
          trust: input.trust === true,
          description: cleanOptionalString(input.description, 500),
        } satisfies MCPServerConfig,
      ];
    }),
  );
}

function cleanOptionalString(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('invalid string field');
  const result = value.trim();
  if (result.length > maxLength) throw new Error('field too large');
  return result;
}

function cleanOptionalUrl(value: unknown): string {
  const result = cleanOptionalString(value, 4096);
  if (!result) return '';
  const parsed = new URL(result);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('invalid MCP URL');
  }
  return result;
}

function cleanStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error('invalid string array');
  }
  return value.map((item) => {
    const result = cleanOptionalString(item, maxLength);
    if (!result) throw new Error('empty array item');
    return result;
  });
}

function cleanStringRecord(
  value: unknown,
  maxItems: number,
  maxLength: number,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid record');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > maxItems) throw new Error('record too large');
  return Object.fromEntries(
    entries.map(([key, item]) => {
      if (!key || /\s|[=\0]/.test(key) || key.length > 256) {
        throw new Error('invalid record key');
      }
      return [key, cleanOptionalString(item, maxLength)];
    }),
  );
}

function validateEndpoint(
  value: unknown,
  required: boolean,
  allowProfessionalAudio: boolean,
): DesktopMainProvider & { provider?: ProviderName } {
  if (!value || typeof value !== 'object') {
    if (required) throw new Error('missing main provider');
    return { apiKey: '', baseUrl: '', model: '' };
  }
  const endpoint = value as Record<string, unknown>;
  const apiKey = cleanString(endpoint.apiKey, 8192);
  const baseUrl = cleanString(endpoint.baseUrl, 2048);
  const model = cleanString(endpoint.model, 256);
  const allowedProviders = allowProfessionalAudio
    ? PROVIDERS
    : STANDARD_PROVIDERS;
  const provider = allowedProviders.has(endpoint.provider as ProviderName)
    ? (endpoint.provider as ProviderName)
    : undefined;
  if (required && (!apiKey || !baseUrl || !model)) {
    throw new Error('incomplete main provider');
  }
  return { apiKey, baseUrl, model, provider };
}

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const result = value.trim();
  if (result.length > maxLength) throw new Error('credential field too large');
  return result;
}

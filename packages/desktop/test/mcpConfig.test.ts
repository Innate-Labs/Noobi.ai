import { describe, expect, it } from 'vitest';
import {
  collectMcpSecrets,
  toRuntimeMcpServers,
  validateMcpServers,
} from '../src/main/mcpConfig.js';

describe('MCP desktop configuration', () => {
  it('validates and converts stdio/http servers for the Runtime', () => {
    const servers = validateMcpServers([
      {
        id: 'server-1',
        name: 'filesystem',
        description: 'Files',
        enabled: true,
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        cwd: '/tmp',
        url: '',
        timeoutMs: 30_000,
        trust: false,
        env: [{ name: 'ACCESS_TOKEN', value: 'secret-value' }],
        headers: [],
      },
      {
        id: 'server-2',
        name: 'remote',
        description: '',
        enabled: true,
        transport: 'http',
        command: '',
        args: [],
        cwd: '',
        url: 'https://example.com/mcp',
        timeoutMs: 45_000,
        trust: true,
        env: [],
        headers: [{ name: 'Authorization', value: 'Bearer private-token' }],
      },
    ]);

    expect(toRuntimeMcpServers(servers)).toEqual({
      filesystem: expect.objectContaining({
        command: 'npx',
        env: { ACCESS_TOKEN: 'secret-value' },
      }),
      remote: expect.objectContaining({
        httpUrl: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer private-token' },
      }),
    });
    expect(collectMcpSecrets(servers)).toEqual([
      'secret-value',
      'Bearer private-token',
    ]);
  });

  it('rejects duplicate names and ambiguous/unsafe inputs', () => {
    const base = {
      id: 'one',
      name: 'server',
      description: '',
      enabled: true,
      transport: 'stdio',
      command: 'node',
      args: [],
      cwd: '',
      url: '',
      timeoutMs: 30_000,
      trust: false,
      env: [],
      headers: [],
    };
    expect(() => validateMcpServers([base, { ...base, id: 'two' }])).toThrow(
      '名称重复',
    );
    expect(() =>
      validateMcpServers([{ ...base, cwd: 'relative/path' }]),
    ).toThrow('绝对路径');
  });

  it('omits disabled servers from Runtime discovery', () => {
    const server = validateMcpServers([
      {
        id: 'disabled',
        name: 'disabled-server',
        description: '',
        enabled: false,
        transport: 'sse',
        command: '',
        args: [],
        cwd: '',
        url: 'https://example.com/events',
        timeoutMs: 30_000,
        trust: false,
        env: [],
        headers: [],
      },
    ]);
    expect(toRuntimeMcpServers(server)).toEqual({});
  });
});

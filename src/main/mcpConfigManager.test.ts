import { describe, expect, it, vi } from 'vitest';
import { McpConfigManager } from './mcpConfigManager.js';

describe('McpConfigManager', () => {
  it('writes argv-based STDIO and secure HTTP config, then reloads Codex MCP', async () => {
    const runtime = makeRuntime();
    const manager = new McpConfigManager(runtime);

    await manager.save({
      id: 'level-tools',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@example/level-mcp'],
      enabled: true,
    });
    expect(runtime.writeConfigValue).toHaveBeenCalledWith('mcp_servers.level-tools', {
      enabled: true,
      command: 'npx',
      args: ['-y', '@example/level-mcp'],
    });

    await manager.save({
      id: 'asset_api',
      transport: 'http',
      url: 'https://mcp.example.test/v1',
      bearerTokenEnvVar: 'NOOBI_ASSET_MCP_TOKEN',
      enabled: false,
    });
    expect(runtime.writeConfigValue).toHaveBeenCalledWith('mcp_servers.asset_api', {
      enabled: false,
      url: 'https://mcp.example.test/v1',
      bearer_token_env_var: 'NOOBI_ASSET_MCP_TOKEN',
    });
    expect(runtime.reloadMcpServers).toHaveBeenCalledTimes(2);
  });

  it('lists effective config with live status without returning secrets', async () => {
    const runtime = makeRuntime({
      mcp_servers: {
        local: { command: 'node', args: ['server.js'], enabled: true, env: { SECRET: 'hidden' } },
        remote: { url: 'https://mcp.example.test/', bearer_token_env_var: 'MCP_TOKEN' },
      },
    });
    runtime.listMcpServerStatuses.mockResolvedValue([{
      name: 'local',
      authStatus: 'unsupported',
      connected: true,
      toolCount: 4,
    }]);
    const manager = new McpConfigManager(runtime);

    const result = await manager.list();
    expect(result).toEqual([
      expect.objectContaining({ id: 'local', transport: 'stdio', connected: true, toolCount: 4 }),
      expect.objectContaining({ id: 'remote', transport: 'http', bearerTokenEnvVar: 'MCP_TOKEN' }),
    ]);
    expect(JSON.stringify(result)).not.toContain('hidden');
  });

  it('rejects shell-like key paths, insecure remote URLs, and oversized argv', async () => {
    const manager = new McpConfigManager(makeRuntime());
    await expect(manager.save({
      id: 'bad.name',
      transport: 'stdio',
      command: 'node',
      enabled: true,
    })).rejects.toThrow('MCP ID');
    await expect(manager.save({
      id: 'remote',
      transport: 'http',
      url: 'http://mcp.example.test/',
      enabled: true,
    })).rejects.toThrow('HTTPS');
    await expect(manager.save({
      id: 'local',
      transport: 'stdio',
      command: 'node',
      args: new Array(65).fill('x'),
      enabled: true,
    })).rejects.toThrow('参数列表');
  });

  it('removes only a validated leaf and reloads MCP', async () => {
    const runtime = makeRuntime();
    const manager = new McpConfigManager(runtime);
    await manager.remove('asset_api');
    expect(runtime.writeConfigValue).toHaveBeenCalledWith('mcp_servers.asset_api', null);
    expect(runtime.reloadMcpServers).toHaveBeenCalledOnce();
  });
});

function makeRuntime(config: Record<string, unknown> = {}) {
  return {
    readConfig: vi.fn().mockResolvedValue(config),
    writeConfigValue: vi.fn().mockResolvedValue(undefined),
    reloadMcpServers: vi.fn().mockResolvedValue(undefined),
    listMcpServerStatuses: vi.fn().mockResolvedValue([]),
  };
}

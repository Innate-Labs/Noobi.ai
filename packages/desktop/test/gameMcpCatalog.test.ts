import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  toRuntimeMcpServers,
  validateMcpServers,
} from '../src/main/mcpConfig.js';
import { hasCapabilityIcon } from '../src/renderer/components/CapabilityIcon.js';
import { gameMcpCatalog } from '../src/renderer/gameMcpCatalog.js';

const extensionsDialog = readFileSync(
  new URL('../src/renderer/components/ExtensionsDialog.tsx', import.meta.url),
  'utf8',
);

describe('curated game MCP catalog', () => {
  it('contains unique, traceable and safe-by-default recommendations', () => {
    expect(gameMcpCatalog.length).toBeGreaterThanOrEqual(5);
    expect(new Set(gameMcpCatalog.map((item) => item.id)).size).toBe(
      gameMcpCatalog.length,
    );
    expect(new Set(gameMcpCatalog.map((item) => item.config.name)).size).toBe(
      gameMcpCatalog.length,
    );

    for (const item of gameMcpCatalog) {
      expect(item.repository).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(item.description.length).toBeGreaterThanOrEqual(30);
      expect(item.evidence).toBeTruthy();
      expect(item.license).toBeTruthy();
      expect(item.requirement).toBeTruthy();
      expect(item.config.trust).toBe(false);
      expect(hasCapabilityIcon('mcp', item.id)).toBe(true);
    }
  });

  it('limits official labels to first-party engine and browser publishers', () => {
    const officialPublishers = new Set(['Epic Games', 'Microsoft']);
    for (const item of gameMcpCatalog) {
      if (item.trust === 'official') {
        expect(officialPublishers.has(item.publisher)).toBe(true);
      }
    }
  });

  it('passes desktop validation and maps into exact Runtime transports', () => {
    const validated = validateMcpServers(
      gameMcpCatalog.map((item) => ({ id: item.id, ...item.config })),
    );
    const runtime = toRuntimeMcpServers(validated);

    expect(runtime.unreal).toEqual(
      expect.objectContaining({
        httpUrl: 'http://localhost:8000/mcp',
        trust: false,
      }),
    );
    expect(runtime.unreal).not.toHaveProperty('command');
    expect(runtime.unity).toEqual(
      expect.objectContaining({
        command: 'uvx',
        args: [
          '--from',
          'mcpforunityserver',
          'mcp-for-unity',
          '--transport',
          'stdio',
        ],
      }),
    );
    expect(runtime.godot).toEqual(
      expect.objectContaining({
        command: 'npx',
        args: ['-y', '@coding-solo/godot-mcp'],
      }),
    );
    expect(runtime.blender).toEqual(
      expect.objectContaining({
        command: 'uvx',
        env: { DISABLE_TELEMETRY: 'true' },
      }),
    );
    expect(runtime.playwright).toEqual(
      expect.objectContaining({
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--isolated'],
      }),
    );
    expect(Object.values(runtime).every((config) => !config.trust)).toBe(true);
  });

  it('opens both capability panels on discovery instead of empty state', () => {
    expect(extensionsDialog).toMatch(
      /useState<\s*'installed'\s*\|\s*'catalog'\s*>\(\s*'catalog'\s*,?\s*\)/,
    );
    expect(extensionsDialog).toMatch(
      /useState<\s*'catalog'\s*\|\s*'configured'\s*>\(\s*'catalog'\s*,?\s*\)/,
    );
  });
});

import { openSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  delete process.env['GAMEAGENT_CREDENTIAL_FD'];
  vi.resetModules();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('desktop credential channel', () => {
  it('loads main and modality credentials from a descriptor, then removes the marker', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'gameagent-credentials-'),
    );
    temporaryDirectories.push(directory);
    const payloadPath = path.join(directory, 'credentials.json');
    await writeFile(
      payloadPath,
      JSON.stringify({
        main: {
          provider: 'openai-compat',
          apiKey: 'main-secret-value',
          baseUrl: 'https://api.example.test/v1',
          model: 'main-model',
        },
        providers: {
          reasoning: {
            provider: 'openai-compat',
            apiKey: 'reasoning-secret-value',
            baseUrl: 'https://api.example.test/v1',
            model: 'reasoning-model',
          },
          audio: {
            provider: 'elevenlabs',
            apiKey: 'audio-secret-value',
            baseUrl: 'https://api.elevenlabs.io',
            model: 'music_v2',
          },
          image: { provider: 'tongyi', apiKey: '', model: 'ignored' },
        },
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: { ACCESS_TOKEN: 'mcp-secret-value' },
            timeout: 30000,
            trust: false,
          },
        },
      }),
      'utf8',
    );
    const descriptor = openSync(payloadPath, 'r');
    process.env['GAMEAGENT_CREDENTIAL_FD'] = String(descriptor);

    const { getDesktopCredentials } = await import('./desktopCredentials.js');
    const credentials = getDesktopCredentials();

    expect(credentials?.main).toMatchObject({
      apiKey: 'main-secret-value',
      baseUrl: 'https://api.example.test/v1',
      model: 'main-model',
    });
    expect(credentials?.providers.reasoning).toMatchObject({
      apiKey: 'reasoning-secret-value',
      model: 'reasoning-model',
    });
    expect(credentials?.providers.audio).toMatchObject({
      provider: 'elevenlabs',
      apiKey: 'audio-secret-value',
      model: 'music_v2',
    });
    expect(credentials?.providers.image).toBeUndefined();
    expect(credentials?.mcpServers.filesystem).toMatchObject({
      command: 'npx',
      env: { ACCESS_TOKEN: 'mcp-secret-value' },
      timeout: 30000,
    });
    expect(process.env['GAMEAGENT_CREDENTIAL_FD']).toBeUndefined();
  });

  it('returns undefined when the desktop channel is not present', async () => {
    const { getDesktopCredentials } = await import('./desktopCredentials.js');
    expect(getDesktopCredentials()).toBeUndefined();
  });
});

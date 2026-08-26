import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  listMediaProviderPresets,
  MediaProviderStore,
  normalizeProviderEndpoint,
  type MediaProviderSecretCodec,
} from './mediaProviderStore.js';

const roots: string[] = [];

function fakeSecretCodec(available = true): MediaProviderSecretCodec {
  return {
    isAvailable: () => available,
    seal: (plaintext) => {
      const payload = Buffer.from(plaintext, 'utf8').toString('base64url');
      const digest = createHash('sha256').update(`noobi-test-key\0${plaintext}`).digest('hex');
      return `fake-keychain:v1:${payload}.${digest}`;
    },
    open: (sealed) => {
      const match = /^fake-keychain:v1:([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/u.exec(sealed);
      if (!match) throw new Error('bad envelope');
      const plaintext = Buffer.from(match[1]!, 'base64url').toString('utf8');
      const digest = createHash('sha256').update(`noobi-test-key\0${plaintext}`).digest('hex');
      if (digest !== match[2]) throw new Error('authentication failed');
      return plaintext;
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('media provider store', () => {
  it('publishes major provider/model presets for every media kind', () => {
    expect(listMediaProviderPresets('image').map((preset) => preset.id)).toEqual(expect.arrayContaining([
      'openai-image',
      'stability-image',
      'google-imagen',
      'fal-flux',
      'custom-image',
    ]));
    expect(listMediaProviderPresets('audio').map((preset) => preset.id)).toEqual(expect.arrayContaining([
      'openai-audio',
      'elevenlabs-sound',
      'minimax-audio',
      'minimax-audio-cn',
      'stability-audio',
      'custom-audio',
    ]));
    expect(listMediaProviderPresets('model3d').map((preset) => preset.id)).toEqual(expect.arrayContaining([
      'meshy-3d',
      'tripo-3d',
      'rodin-3d',
      'custom-model3d',
    ]));
    expect(listMediaProviderPresets('image').find((preset) => preset.id === 'openai-image')?.models)
      .toContain('gpt-image-2');
    expect(listMediaProviderPresets('audio').find((preset) => preset.id === 'minimax-audio')).toMatchObject({
      vendor: 'MiniMax',
      adapter: 'minimax-audio',
      auth: 'bearer',
      defaultEndpoint: 'https://api.minimax.io',
      defaultModel: 'music-3.0',
      models: ['music-3.0', 'speech-2.8-hd', 'speech-2.8-turbo'],
    });
    expect(listMediaProviderPresets('audio').find((preset) => preset.id === 'minimax-audio-cn')).toMatchObject({
      vendor: 'MiniMax',
      adapter: 'minimax-audio',
      defaultEndpoint: 'https://api.minimaxi.com',
    });
  });

  it('persists only sealed secrets and decrypts them only inside the provider callback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-store-'));
    roots.push(root);
    const storageFile = join(root, 'private', 'media-providers.json');
    const store = new MediaProviderStore(storageFile, fakeSecretCodec());
    await store.init();
    const saved = await store.upsert({
      presetId: 'openai-image',
      displayName: 'Production Images',
      apiKey: 'sk-noobi-super-secret',
      setActive: true,
    });

    expect(saved).toMatchObject({
      kind: 'image',
      hasApiKey: true,
      active: true,
      model: 'gpt-image-2',
    });
    expect(JSON.stringify(saved)).not.toContain('sk-noobi-super-secret');
    expect(JSON.stringify(store.list())).not.toContain('sk-noobi-super-secret');
    expect(JSON.stringify(store.get(saved.id))).not.toContain('sk-noobi-super-secret');

    const contents = await readFile(storageFile, 'utf8');
    expect(contents).not.toContain('sk-noobi-super-secret');
    expect(JSON.parse(contents)).toMatchObject({
      version: 2,
      providers: [{ sealedApiKey: expect.stringMatching(/^fake-keychain:v1:/u) }],
    });
    expect(JSON.parse(contents).providers[0]).not.toHaveProperty('apiKey');
    if (process.platform !== 'win32') {
      expect((await lstat(storageFile)).mode & 0o777).toBe(0o600);
      expect((await lstat(join(root, 'private'))).mode & 0o777).toBe(0o700);
    }

    let secretSeen = '';
    await store.withActiveProvider('image', async (provider) => {
      secretSeen = provider.apiKey ?? '';
      return undefined;
    });
    expect(secretSeen).toBe('sk-noobi-super-secret');

    const reopened = new MediaProviderStore(storageFile, fakeSecretCodec());
    await reopened.init();
    expect(await reopened.withActiveProvider('image', async (provider) => provider.apiKey)).toBe('sk-noobi-super-secret');
  });

  it('preserves omitted keys, supports explicit clearing, and ignores disabled providers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-update-'));
    roots.push(root);
    const store = new MediaProviderStore(join(root, 'media.json'), fakeSecretCodec());
    await store.init();
    const created = await store.upsert({ presetId: 'openai-audio', apiKey: 'secret', setActive: true });
    expect((await store.upsert({ id: created.id, presetId: 'openai-audio', model: 'tts-1-hd' })).hasApiKey).toBe(true);
    await store.upsert({ id: created.id, presetId: 'openai-audio', apiKey: null });
    expect(await store.withActiveProvider('audio', async () => 'called')).toBeNull();
    await store.upsert({ id: created.id, presetId: 'openai-audio', apiKey: 'new-key', enabled: false });
    expect(await store.withActiveProvider('audio', async () => 'called')).toBeNull();
  });

  it('migrates a v1 plaintext key once and atomically writes schema v2 ciphertext', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-migration-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    await writeFile(storageFile, JSON.stringify({
      version: 1,
      active: { audio: 'legacy-audio' },
      providers: [{
        id: 'legacy-audio',
        presetId: 'openai-audio',
        displayName: 'Legacy audio',
        endpoint: null,
        model: null,
        auth: null,
        apiKey: 'legacy-plaintext-secret',
        enabled: true,
        createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
      }],
    }));

    const store = new MediaProviderStore(storageFile, fakeSecretCodec());
    await store.init();
    expect(await store.withActiveProvider('audio', async (provider) => provider.apiKey))
      .toBe('legacy-plaintext-secret');

    const migrated = await readFile(storageFile, 'utf8');
    expect(migrated).not.toContain('legacy-plaintext-secret');
    expect(JSON.parse(migrated)).toMatchObject({
      version: 2,
      providers: [{
        id: 'legacy-audio',
        sealedApiKey: expect.stringMatching(/^fake-keychain:v1:/u),
      }],
    });
    expect(JSON.parse(migrated).providers[0]).not.toHaveProperty('apiKey');
  });

  it('re-seals legacy unbound schema v2 ciphertext without changing the document version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-v2-binding-migration-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    const codec = fakeSecretCodec();
    const legacySealed = codec.seal('legacy-v2-unbound-secret');
    await writeFile(storageFile, JSON.stringify({
      version: 2,
      active: { audio: 'legacy-v2-audio' },
      providers: [{
        id: 'legacy-v2-audio',
        presetId: 'minimax-audio',
        displayName: 'Legacy MiniMax',
        endpoint: 'https://api.minimax.io',
        model: 'music-3.0',
        auth: 'bearer',
        sealedApiKey: legacySealed,
        enabled: true,
        createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T00:00:00.000Z',
      }],
    }));

    const store = new MediaProviderStore(storageFile, codec);
    await store.init();
    expect(await store.withActiveProvider('audio', async (provider) => provider.apiKey))
      .toBe('legacy-v2-unbound-secret');

    const migrated = JSON.parse(await readFile(storageFile, 'utf8'));
    expect(migrated.version).toBe(2);
    expect(migrated.providers[0].sealedApiKey).not.toBe(legacySealed);
    expect(codec.open(migrated.providers[0].sealedApiKey)).not.toBe('legacy-v2-unbound-secret');
  });

  it('migrates the existing empty v1 document even when the OS credential store is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-empty-migration-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    await writeFile(storageFile, JSON.stringify({ version: 1, active: {}, providers: [] }));

    const store = new MediaProviderStore(storageFile, fakeSecretCodec(false));
    await store.init();

    expect(JSON.parse(await readFile(storageFile, 'utf8'))).toEqual({
      version: 2,
      active: {},
      providers: [],
    });
  });

  it('fails closed when OS encryption is unavailable and never writes a plaintext fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-unavailable-keychain-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    const store = new MediaProviderStore(storageFile, fakeSecretCodec(false));
    await store.init();

    await expect(store.upsert({
      presetId: 'minimax-audio',
      apiKey: 'must-never-reach-disk',
      setActive: true,
    })).rejects.toThrow(/encryption is unavailable/u);
    expect(await readFile(storageFile, 'utf8')).not.toContain('must-never-reach-disk');
    expect(store.list()).toEqual([]);
  });

  it('rejects damaged ciphertext instead of treating the provider as configured', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-damaged-ciphertext-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    const store = new MediaProviderStore(storageFile, fakeSecretCodec());
    await store.init();
    await store.upsert({ presetId: 'minimax-audio', apiKey: 'authenticated-secret', setActive: true });
    const document = JSON.parse(await readFile(storageFile, 'utf8'));
    document.providers[0].sealedApiKey = `${document.providers[0].sealedApiKey}tampered`;
    await writeFile(storageFile, JSON.stringify(document));

    const reopened = new MediaProviderStore(storageFile, fakeSecretCodec());
    await expect(reopened.init()).rejects.toThrow(/ciphertext could not be decrypted/u);
  });

  it('never carries an omitted API key across provider presets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-vendor-switch-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    const store = new MediaProviderStore(storageFile, fakeSecretCodec());
    await store.init();
    const created = await store.upsert({ presetId: 'openai-image', apiKey: 'openai-secret', setActive: true });
    const switched = await store.upsert({
      id: created.id,
      presetId: 'stability-image',
      endpoint: 'https://gateway.example.test/image',
    });
    expect(switched.hasApiKey).toBe(false);
    expect(await store.withActiveProvider('image', async () => 'called')).toBeNull();
    expect(await readFile(storageFile, 'utf8')).not.toContain('openai-secret');
  });

  it('locks the MiniMax preset to the official API origin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-minimax-origin-'));
    roots.push(root);
    const store = new MediaProviderStore(join(root, 'media.json'), fakeSecretCodec());
    await store.init();

    await expect(store.upsert({
      presetId: 'minimax-audio',
      endpoint: 'https://api.minimax.io.evil.example/v1/music_generation',
      apiKey: 'must-not-be-sent-to-lookalike',
      setActive: true,
    })).rejects.toThrow(/official api\.minimax\.io origin/u);
    expect(store.list('audio')).toEqual([]);
  });

  it('preserves valid MiniMax bearer tokens and rejects pasted labels, Unicode, whitespace, and Markdown escapes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-minimax-key-'));
    roots.push(root);
    const store = new MediaProviderStore(join(root, 'media.json'), fakeSecretCodec());
    await store.init();

    for (const invalid of ['Bearer sk-api-demo', 'API：sk-api-demo', 'sk-api-demo key', 'sk-api-demo\\_escaped']) {
      await expect(store.upsert({
        presetId: 'minimax-audio-cn',
        apiKey: invalid,
        setActive: true,
      })).rejects.toThrow(/MiniMax API Key 格式无效/u);
    }
    expect(store.list('audio')).toEqual([]);

    const valid = 'sk-api-AbC_123-xyZ.9~+/==';
    await store.upsert({ presetId: 'minimax-audio-cn', apiKey: valid, setActive: true });
    await expect(store.withActiveProvider('audio', async (provider) => ({
      apiKey: provider.apiKey,
      endpoint: provider.endpoint,
    }))).resolves.toEqual({
      apiKey: valid,
      endpoint: 'https://api.minimaxi.com',
    });
  });

  it('binds an omitted API key to its provider preset, endpoint origin, and authentication mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-secret-boundary-'));
    roots.push(root);
    const store = new MediaProviderStore(join(root, 'media.json'), fakeSecretCodec());
    await store.init();
    const created = await store.upsert({
      presetId: 'custom-image',
      endpoint: 'https://trusted.example.test/v1/generate',
      apiKey: 'origin-bound-secret',
      setActive: true,
    });

    const sameOrigin = await store.upsert({
      id: created.id,
      presetId: 'custom-image',
      endpoint: 'https://trusted.example.test/v2/generate',
    });
    expect(sameOrigin.hasApiKey).toBe(true);

    const changedOrigin = await store.upsert({
      id: created.id,
      presetId: 'custom-image',
      endpoint: 'https://other.example.test/generate',
    });
    expect(changedOrigin.hasApiKey).toBe(false);
    expect(await store.withActiveProvider('image', async () => 'called')).toBeNull();

    await store.upsert({
      id: created.id,
      presetId: 'custom-image',
      endpoint: 'https://other.example.test/generate',
      apiKey: 'auth-bound-secret',
    });
    const changedAuth = await store.upsert({
      id: created.id,
      presetId: 'custom-image',
      endpoint: 'https://other.example.test/next',
      auth: 'x-api-key',
    });
    expect(changedAuth.hasApiKey).toBe(false);
    const persisted = JSON.parse(await readFile(join(root, 'media.json'), 'utf8'));
    expect(JSON.stringify(persisted)).not.toContain('auth-bound-secret');
    expect(persisted.providers[0].sealedApiKey).toBeNull();
  });

  it('rejects persisted endpoint-origin and authentication tampering before exposing a key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-persisted-binding-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    const codec = fakeSecretCodec();
    const store = new MediaProviderStore(storageFile, codec);
    await store.init();
    await store.upsert({
      presetId: 'custom-image',
      endpoint: 'https://trusted.example.test/v1/generate',
      apiKey: 'persisted-origin-bound-secret',
      setActive: true,
    });
    const original = JSON.parse(await readFile(storageFile, 'utf8'));

    const changedOrigin = structuredClone(original);
    changedOrigin.providers[0].endpoint = 'https://other.example.test/generate';
    await writeFile(storageFile, JSON.stringify(changedOrigin));
    await expect(new MediaProviderStore(storageFile, codec).init())
      .rejects.toThrow(/binding does not match provider configuration/u);

    const changedAuth = structuredClone(original);
    changedAuth.providers[0].auth = 'x-api-key';
    await writeFile(storageFile, JSON.stringify(changedAuth));
    await expect(new MediaProviderStore(storageFile, codec).init())
      .rejects.toThrow(/binding does not match provider configuration/u);
  });

  it('rejects ciphertext swapped across provider records', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-ciphertext-swap-'));
    roots.push(root);
    const storageFile = join(root, 'media.json');
    const codec = fakeSecretCodec();
    const store = new MediaProviderStore(storageFile, codec);
    await store.init();
    await store.upsert({
      presetId: 'custom-image',
      endpoint: 'https://first.example.test/generate',
      apiKey: 'first-record-secret',
    });
    await store.upsert({
      presetId: 'openai-image',
      endpoint: 'https://second.example.test/v1/images/generations',
      apiKey: 'second-record-secret',
    });
    const document = JSON.parse(await readFile(storageFile, 'utf8'));
    const firstCiphertext = document.providers[0].sealedApiKey;
    document.providers[0].sealedApiKey = document.providers[1].sealedApiKey;
    document.providers[1].sealedApiKey = firstCiphertext;
    await writeFile(storageFile, JSON.stringify(document));

    await expect(new MediaProviderStore(storageFile, codec).init())
      .rejects.toThrow(/binding does not match provider configuration/u);
  });

  it('allows HTTPS and exact localhost HTTP while rejecting insecure remote endpoints and URL credentials', () => {
    expect(normalizeProviderEndpoint('https://media.example.com/generate#ignored')).toBe('https://media.example.com/generate');
    expect(normalizeProviderEndpoint('http://localhost:8787/generate')).toBe('http://localhost:8787/generate');
    expect(normalizeProviderEndpoint('http://127.0.0.1:8787/generate')).toBe('http://127.0.0.1:8787/generate');
    expect(() => normalizeProviderEndpoint('http://media.example.com/generate')).toThrow(/HTTPS/u);
    expect(() => normalizeProviderEndpoint('https://key:secret@media.example.com/generate')).toThrow(/credentials/u);
    expect(() => normalizeProviderEndpoint('file:///tmp/output.png')).toThrow(/HTTPS/u);
  });

  it('rejects custom presets without an explicit REST endpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-provider-custom-'));
    roots.push(root);
    const store = new MediaProviderStore(join(root, 'media.json'), fakeSecretCodec());
    await store.init();
    await expect(store.upsert({ presetId: 'custom-model3d', apiKey: 'secret' })).rejects.toThrow(/custom REST endpoint/u);
  });
});

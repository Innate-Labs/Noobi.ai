import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ApiUsageStore,
  usageFromProviderProbe,
  usageFromRuntimeResult,
} from './apiUsageStore.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ApiUsageStore', () => {
  it('persists normalized records and aggregates per provider', async () => {
    const directory = await temporaryDirectory();
    const store = new ApiUsageStore({
      directory,
      now: () => new Date('2026-08-10T10:00:00.000Z'),
      idFactory: sequentialIds(),
    });
    await store.initialize();

    await store.record({
      provider: 'openai-compat',
      model: 'deepseek-v4-pro',
      source: 'agent',
      status: 'success',
      durationMs: 1_250.8,
      callCount: 3,
      inputTokens: 100,
      outputTokens: 25,
      cacheReadTokens: 10,
      totalTokens: 125,
      occurredAt: '2026-08-10T09:58:00.000Z',
    });
    await store.record(
      usageFromProviderProbe({
        provider: 'tongyi',
        slot: 'image',
        status: 'error',
        latencyMs: 550,
        occurredAt: '2026-08-10T09:59:00.000Z',
      }),
    );

    const snapshot = store.snapshot();
    expect(snapshot.totals).toMatchObject({
      runs: 2,
      calls: 4,
      successes: 1,
      failures: 1,
      durationMs: 1_800,
      averageDurationMs: 900,
      inputTokens: 100,
      outputTokens: 25,
      cacheReadTokens: 10,
      totalTokens: 125,
    });
    expect(snapshot.providers.map((provider) => provider.provider)).toEqual([
      'tongyi',
      'openai-compat',
    ]);
    expect(snapshot.recent[0]).toMatchObject({
      id: 'record-2',
      source: 'connection-test',
      slot: 'image',
    });

    const restored = new ApiUsageStore({ directory });
    await restored.initialize();
    expect(restored.snapshot().totals.calls).toBe(4);
    const raw = await readFile(path.join(directory, 'usage.json'), 'utf8');
    expect(raw).not.toContain('apiKey');
    expect(raw).not.toContain('baseUrl');
  });

  it('extracts authoritative runtime result usage and duration', () => {
    expect(
      usageFromRuntimeResult(
        {
          type: 'result',
          subtype: 'success',
          is_error: false,
          duration_ms: 8_000,
          duration_api_ms: 5_200,
          num_turns: 4,
          usage: {
            input_tokens: 1_000,
            output_tokens: 250,
            cache_read_input_tokens: 300,
            cache_creation_input_tokens: 50,
            total_tokens: 1_250,
          },
        },
        {
          provider: 'openai-compat',
          model: 'deepseek-v4-pro',
          projectId: 'project-a',
        },
      ),
    ).toEqual({
      provider: 'openai-compat',
      model: 'deepseek-v4-pro',
      projectId: 'project-a',
      source: 'agent',
      status: 'success',
      durationMs: 5_200,
      callCount: 4,
      inputTokens: 1_000,
      outputTokens: 250,
      cacheReadTokens: 300,
      cacheWriteTokens: 50,
      totalTokens: 1_250,
    });
  });

  it('falls back to modelUsage and recognizes failed runs', () => {
    expect(
      usageFromRuntimeResult(
        {
          type: 'result',
          subtype: 'error_during_execution',
          duration_ms: 900,
          num_turns: 2,
          modelUsage: {
            first: {
              inputTokens: 10,
              outputTokens: 5,
              cacheReadInputTokens: 2,
              cacheCreationInputTokens: 1,
            },
            second: {
              inputTokens: 20,
              outputTokens: 8,
              cacheReadInputTokens: 4,
              cacheCreationInputTokens: 3,
            },
          },
        },
        { provider: 'doubao' },
      ),
    ).toMatchObject({
      status: 'error',
      durationMs: 900,
      callCount: 2,
      inputTokens: 30,
      outputTokens: 13,
      cacheReadTokens: 6,
      cacheWriteTokens: 4,
      totalTokens: 43,
    });
    expect(
      usageFromRuntimeResult({ type: 'assistant' }, { provider: 'doubao' }),
    ).toBeNull();
  });

  it('filters by time, caps history and ignores corrupt persistence', async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, 'usage.json'), '{broken', 'utf8');
    const store = new ApiUsageStore({
      directory,
      maxRecords: 2,
      idFactory: sequentialIds(),
    });
    await store.initialize();
    expect(store.snapshot().totals.runs).toBe(0);

    for (let index = 0; index < 3; index += 1) {
      await store.record({
        provider: 'openai-compat',
        source: 'agent',
        status: 'success',
        durationMs: index,
        occurredAt: `2026-08-10T10:0${index}:00.000Z`,
      });
    }

    expect(store.snapshot({ limit: 1 }).recent).toHaveLength(1);
    expect(store.snapshot().recent.map((record) => record.occurredAt)).toEqual([
      '2026-08-10T10:02:00.000Z',
      '2026-08-10T10:01:00.000Z',
    ]);
    expect(
      store.snapshot({ since: '2026-08-10T10:02:00.000Z' }).totals.runs,
    ).toBe(1);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'noobi-api-usage-'));
  temporaryDirectories.push(directory);
  return directory;
}

function sequentialIds(): () => string {
  let index = 0;
  return () => `record-${(index += 1)}`;
}

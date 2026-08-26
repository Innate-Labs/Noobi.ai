import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { EventLog } from './eventLog.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('EventLog', () => {
  it('merges persisted deltas by stable event id during bootstrap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-event-log-'));
    roots.push(root);
    const log = new EventLog(root);
    await log.init();
    const base = {
      id: 'project-1:turn-1:item-1:assistant',
      projectId: 'project-1',
      kind: 'assistant' as const,
      title: 'Implementer',
      stage: 'code' as const,
      timestamp: new Date().toISOString(),
      method: 'item/agentMessage/delta',
      isDelta: true,
    };
    await log.append({ ...base, message: 'Hello ' });
    await log.append({ ...base, message: 'world' });
    await log.flush();

    await expect(log.read('project-1')).resolves.toMatchObject([
      { id: base.id, message: 'Hello world' },
    ]);
  });

  it('truncates oversized multibyte events into valid bounded JSONL without throwing synchronously', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-event-log-'));
    roots.push(root);
    const log = new EventLog(root);
    await log.init();
    const event = {
      id: 'project-zh:turn-1:user',
      projectId: 'project-zh',
      kind: 'user' as const,
      title: '游戏创意',
      message: '像素游戏🎮'.repeat(12_000),
      stage: 'brief' as const,
      timestamp: new Date().toISOString(),
      method: 'project/created',
    };

    let pending!: Promise<void>;
    expect(() => {
      pending = log.append(event);
    }).not.toThrow();
    await expect(pending).resolves.toBeUndefined();
    await log.flush();

    const source = await readFile(join(root, 'project-zh.jsonl'), 'utf8');
    expect(source.endsWith('\n')).toBe(true);
    const line = source.trimEnd();
    expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(() => JSON.parse(line)).not.toThrow();

    const restored = await log.read('project-zh');
    expect(restored).toHaveLength(1);
    expect(restored[0]!.message).toContain('事件日志已按 64 KiB 截断');
    expect(restored[0]!.message).not.toContain('\uFFFD');
    expect(restored[0]!.message.length).toBeLessThan(event.message.length);
  });
});

import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentEventStore } from '../src/main/agentEventStore.js';
import type { AgentEvent, ProjectRecord } from '../src/shared/types.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('AgentEventStore', () => {
  it('持久化耐久事件、限制历史长度并忽略损坏尾行', async () => {
    const root = await temporaryRoot();
    const historyDirectory = path.join(root, 'history');
    const store = new AgentEventStore({
      directory: historyDirectory,
      recordingRoot: path.join(root, 'recordings'),
      maxStoredEvents: 3,
      maxLoadedEvents: 2,
      compactBytes: Number.MAX_SAFE_INTEGER,
    });
    await store.initialize();
    const project = makeProject('project-one');
    const secret = 'private-provider-value';

    await store.append(makeEvent(project, 'e0', 'text_delta', '临时增量'));
    for (let index = 1; index <= 5; index += 1) {
      await store.append(
        makeEvent(
          project,
          `e${index}`,
          'assistant',
          index === 5 ? `结果 ${secret}` : `结果 ${index}`,
        ),
        [secret],
      );
    }
    await store.flush();

    const historyFile = path.join(
      historyDirectory,
      `${sha256(project.id)}.jsonl`,
    );
    await appendFile(historyFile, '{"incomplete":\n', 'utf8');

    const reloaded = new AgentEventStore({
      directory: historyDirectory,
      recordingRoot: path.join(root, 'recordings'),
      maxStoredEvents: 3,
      maxLoadedEvents: 2,
    });
    await reloaded.initialize();
    const result = await reloaded.load(project, [secret]);

    expect(result.events.map((event) => event.id)).toEqual(['e4', 'e5']);
    expect(result.events.at(-1)?.message).toContain('[已隐藏密钥]');
    expect(result.hasMore).toBe(true);
    expect(await readFile(historyFile, 'utf8')).not.toContain(secret);
  });

  it('按项目隔离记录', async () => {
    const root = await temporaryRoot();
    const store = new AgentEventStore({
      directory: path.join(root, 'history'),
      recordingRoot: path.join(root, 'recordings'),
    });
    await store.initialize();
    const first = makeProject('first');
    const second = makeProject('second');

    await store.append(makeEvent(first, 'first-event', 'assistant', 'A'));
    await store.append(makeEvent(second, 'second-event', 'assistant', 'B'));

    expect((await store.load(first)).events.map((event) => event.id)).toEqual([
      'first-event',
    ]);
    expect((await store.load(second)).events.map((event) => event.id)).toEqual([
      'second-event',
    ]);
  });

  it('迁移旧 Qwen 会话、校验 cwd/session 并保持幂等', async () => {
    const root = await temporaryRoot();
    const recordingRoot = path.join(root, 'recordings');
    const historyDirectory = path.join(root, 'history');
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const project = {
      ...makeProject('legacy-project'),
      path: path.join(root, 'game'),
      sessionId,
      status: 'completed' as const,
      stage: 'complete' as const,
    };
    const chatDirectory = path.join(
      recordingRoot,
      project.path.replace(/[^a-zA-Z0-9]/g, '-'),
      'chats',
    );
    await mkdir(chatDirectory, { recursive: true });
    const secret = 'legacy-provider-secret';
    const base = {
      sessionId,
      cwd: project.path,
      timestamp: '2026-08-07T01:00:00.000Z',
    };
    const rows = [
      {
        ...base,
        uuid: 'u1',
        type: 'user',
        message: { parts: [{ text: '制作一个像素游戏' }] },
      },
      {
        ...base,
        uuid: 'a1',
        type: 'assistant',
        message: {
          parts: [
            { text: '先检查工程。', thought: true },
            {
              functionCall: {
                name: 'write_file',
                args: { content: 'x'.repeat(1_000), apiKey: secret },
              },
            },
            { text: '工程已经写入。' },
          ],
        },
      },
      {
        ...base,
        uuid: 't1',
        type: 'tool_result',
        toolCallResult: {
          status: 'success',
          resultDisplay: `完成 Bearer ${secret}`,
        },
        message: {
          parts: [
            { functionResponse: { name: 'write_file', response: 'ok' } },
          ],
        },
      },
      {
        ...base,
        cwd: path.join(root, 'other-game'),
        uuid: 'wrong-cwd',
        type: 'user',
        message: { parts: [{ text: '不应迁移' }] },
      },
    ];
    await writeFile(
      path.join(chatDirectory, `${sessionId}.jsonl`),
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
      'utf8',
    );

    const store = new AgentEventStore({
      directory: historyDirectory,
      recordingRoot,
      maxStoredEvents: 50,
      maxLoadedEvents: 50,
    });
    await store.initialize();
    const first = await store.load(project, [secret]);
    const second = await store.load(project, [secret]);

    expect(first.source).toBe('recording');
    expect(first.events.map((event) => event.type)).toEqual([
      'user',
      'thought',
      'tool_call',
      'assistant',
      'tool_result',
    ]);
    expect(first.events.some((event) => event.message.includes('不应迁移'))).toBe(
      false,
    );
    expect(second.source).toBe('persisted');
    expect(second.events).toHaveLength(first.events.length);
    const persisted = await readFile(
      path.join(historyDirectory, `${sha256(project.id)}.jsonl`),
      'utf8',
    );
    expect(persisted).not.toContain(secret);
    expect(persisted).toContain('[已隐藏密钥]');
  });

  it('拒绝非法 session id，不读取录制目录外文件', async () => {
    const root = await temporaryRoot();
    const store = new AgentEventStore({
      directory: path.join(root, 'history'),
      recordingRoot: path.join(root, 'recordings'),
    });
    await store.initialize();
    const project = {
      ...makeProject('unsafe'),
      sessionId: '../../outside',
      status: 'completed' as const,
    };
    const result = await store.load(project);
    expect(result).toMatchObject({ source: 'empty', events: [] });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'gameagent-history-'));
  temporaryDirectories.push(root);
  return root;
}

function makeProject(id: string): ProjectRecord {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    prompt: '测试游戏',
    status: 'draft',
    stage: 'brief',
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  };
}

function makeEvent(
  project: ProjectRecord,
  id: string,
  type: AgentEvent['type'],
  message: string,
): AgentEvent {
  const index = Number(id.replace(/\D/g, '')) || 0;
  return {
    id,
    projectId: project.id,
    type,
    stage: project.stage,
    title: type === 'text_delta' ? 'Agent' : 'Agent 回复',
    message,
    timestamp: new Date(Date.UTC(2026, 7, 7, 0, 0, index)).toISOString(),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

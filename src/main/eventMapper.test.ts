import { describe, expect, it } from 'vitest';
import {
  inferStage,
  notificationToEvent,
  routeThreadId,
  stageForNotification,
} from './eventMapper.js';

describe('eventMapper', () => {
  it('maps streamed assistant text to the owning project', () => {
    const event = notificationToEvent(
      {
        method: 'item/agentMessage/delta',
        params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', delta: '完成' },
      },
      { projectId: 'project-1', role: 'implementer' },
      'code',
    );
    expect(event).toMatchObject({
      projectId: 'project-1',
      kind: 'assistant',
      message: '完成',
      stage: 'code',
      isDelta: true,
      itemId: 'item-1',
    });
  });

  it('finds thread ids from nested turn payloads', () => {
    expect(routeThreadId({ params: { turn: { threadId: 'thread-nested' } } })).toBe(
      'thread-nested',
    );
  });

  it('infers the visible production stage without using it as a gate', () => {
    expect(inferStage('run npm test and verify the build', 'code')).toBe('verify');
    expect(inferStage('制作 sprite 和 audio 素材', 'brief')).toBe('assets');
    expect(inferStage('正在进行需求拆解', 'code')).toBe('brief');
    expect(inferStage('正在搭建场景关卡', 'code')).toBe('world');
    expect(inferStage('unrelated activity', 'world')).toBe('world');
  });

  it('keeps free-form streaming deltas on the current structured station', () => {
    const route = { projectId: 'project-1', role: 'implementer' } as const;
    const stage = stageForNotification(
      {
        method: 'item/agentMessage/delta',
        params: { delta: '现在开始测试素材并完成构建' },
      },
      route,
      'world',
    );

    expect(stage).toBe('world');
  });

  it('pins planner and reviewer notifications to their semantic stations', () => {
    const notification = {
      method: 'item/agentMessage/delta',
      params: { delta: 'arbitrary streamed text' },
    };

    expect(stageForNotification(notification, {
      projectId: 'project-1',
      role: 'planner',
    }, 'code')).toBe('brief');
    expect(stageForNotification(notification, {
      projectId: 'project-1',
      role: 'reviewer',
    }, 'assets')).toBe('verify');
  });

  it('moves the implementer only from structured file and command activity', () => {
    const route = { projectId: 'project-1', role: 'implementer' } as const;
    const fileEvent = (path: string) => ({
      method: 'item/completed',
      params: { item: { type: 'fileChange', changes: [{ path, kind: 'update' }] } },
    });

    expect(stageForNotification(fileEvent('GAME_DESIGN.md'), route, 'code')).toBe('gdd');
    expect(stageForNotification(fileEvent('package.json'), route, 'code')).toBe('scaffold');
    expect(stageForNotification(fileEvent('public/assets/hero.png'), route, 'code')).toBe('assets');
    expect(stageForNotification({
      method: 'item/completed',
      params: {
        item: {
          type: 'fileChange',
          changes: [
            { path: 'public/assets/hero.png', kind: 'add' },
            { path: 'src/game/player.ts', kind: 'update' },
          ],
        },
      },
    }, route, 'code')).toBe('assets');
    expect(stageForNotification(fileEvent('scenes/world/level-01.tscn'), route, 'code')).toBe('world');
    expect(stageForNotification(fileEvent('src/game/player.ts'), route, 'world')).toBe('code');
    expect(stageForNotification({
      method: 'item/completed',
      params: { item: { type: 'commandExecution', command: 'npm run build && npm test' } },
    }, route, 'code')).toBe('verify');
  });

  it('preserves a world station across later unmatched deltas', () => {
    const route = { projectId: 'project-1', role: 'implementer' } as const;
    const world = stageForNotification({
      method: 'item/completed',
      params: {
        item: {
          type: 'fileChange',
          changes: [{ path: 'levels/open-world/main.tscn' }],
        },
      },
    }, route, 'code');
    const afterDelta = stageForNotification({
      method: 'item/reasoning/summaryTextDelta',
      params: { delta: '...' },
    }, route, world);

    expect(world).toBe('world');
    expect(afterDelta).toBe('world');
  });

  it('never serializes generated image base64 or absolute output paths', () => {
    const secretPath = '/private/user/codex/generated_images/thread/image.png';
    const event = notificationToEvent(
      {
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: {
            id: 'image-1',
            type: 'imageGeneration',
            status: 'completed',
            revisedPrompt: 'a friendly game hero',
            result: 'A'.repeat(100_000),
            savedPath: secretPath,
          },
        },
      },
      { projectId: 'project-1', role: 'implementer' },
      'assets',
    );

    expect(event?.message).toContain('a friendly game hero');
    expect(event?.message).not.toContain(secretPath);
    expect(event?.message).not.toContain('AAAA');
    expect(event?.message.length).toBeLessThan(2_000);
  });

  it('summarizes dynamic tool calls without logging media payloads', () => {
    const event = notificationToEvent(
      {
        method: 'item/completed',
        params: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          item: {
            id: 'tool-1',
            type: 'dynamicToolCall',
            tool: 'noobi_audio_synthesize',
            arguments: { secret: 'do-not-log' },
            contentItems: [{ type: 'inputAudio', audioUrl: `data:audio/wav;base64,${'A'.repeat(50_000)}` }],
            status: 'completed',
            success: true,
          },
        },
      },
      { projectId: 'project-1', role: 'implementer' },
      'assets',
    );

    expect(event?.message).toBe('状态：completed\n结果：成功');
    expect(event?.stage).toBe('assets');
    expect(event?.message).not.toContain('do-not-log');
    expect(event?.message).not.toContain('base64');
  });
});

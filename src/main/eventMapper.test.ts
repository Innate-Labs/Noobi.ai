import { describe, expect, it } from 'vitest';
import { inferStage, notificationToEvent, routeThreadId } from './eventMapper.js';

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
    expect(inferStage('unrelated activity', 'world')).toBe('world');
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
    expect(event?.message).not.toContain('do-not-log');
    expect(event?.message).not.toContain('base64');
  });
});

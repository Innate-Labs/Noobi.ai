import { describe, expect, it, vi } from 'vitest';
import type { CodexAppServer } from './codexAppServer.js';
import { ApprovalBroker } from './approvalBroker.js';

function makeRuntime() {
  return {
    respondToServerRequest: vi.fn(),
    rejectServerRequest: vi.fn(),
  } as unknown as CodexAppServer;
}

describe('ApprovalBroker', () => {
  it('returns structured answers for request_user_input', () => {
    const runtime = makeRuntime();
    const broker = new ApprovalBroker(runtime, () => 'project-1');
    let token = '';
    broker.on('approval', (approval) => { token = approval.token; });
    broker.handle({
      id: 41,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'item-1',
        questions: [{
          id: 'direction',
          header: 'Direction',
          question: 'Which direction?',
          isOther: true,
          isSecret: false,
          options: null,
        }],
      },
    });

    broker.resolve(token, 'accept', { direction: ['North'] });
    expect(runtime.respondToServerRequest).toHaveBeenCalledWith(41, {
      answers: { direction: { answers: ['North'] } },
    });
  });

  it('invalidates old request ids without writing to a new runtime generation', () => {
    const runtime = makeRuntime();
    const broker = new ApprovalBroker(runtime, () => null);
    const closed = vi.fn();
    broker.on('closed', closed);
    broker.handle({
      id: 1,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'npm test' },
    });

    broker.invalidateAll();
    expect(runtime.respondToServerRequest).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('uses a protocol error for unknown server requests', () => {
    const runtime = makeRuntime();
    const broker = new ApprovalBroker(runtime, () => null);
    broker.handle({ id: 'unknown-1', method: 'attestation/generate', params: {} });
    expect(runtime.rejectServerRequest).toHaveBeenCalledWith(
      'unknown-1',
      -32601,
      'Noobi.ai does not support attestation/generate',
    );
  });
});

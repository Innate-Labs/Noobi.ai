import { describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../shared/contracts.js';
import { GodotToolBroker } from './godotToolBroker.js';

const project = { id: 'p1', engine: 'godot', root: '/games/p1' } as ProjectRecord;
function request(args: unknown = { mode: 'playtest' }, id = 1) {
  return { id, method: 'item/tool/call', params: { tool: 'noobi_godot_check', threadId: 'writer', arguments: args } };
}
function setup(check = vi.fn(async () => ({ ok: true })), resolveProject = vi.fn(async () => project as ProjectRecord | null)) {
  const replies: unknown[][] = [];
  const broker = new GodotToolBroker({ server: { respondToServerRequest: (...args) => { replies.push(args); } }, resolveProject, check });
  return { broker, replies, check, resolveProject };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

describe('Godot host tool', () => {
  it('resolves the active project on the host and returns real findings without claiming completion', async () => {
    const s = setup(vi.fn(async () => ({ ok: false, reportPath: 'artifacts/playtest/latest/report.json', goalFindings: ['Victory missing'] })));
    expect(s.broker.handle(request())).toBe(true);
    await flush();
    expect(s.check).toHaveBeenCalledWith(project, 'playtest', expect.any(AbortSignal));
    expect(s.replies[0]?.[1]).toMatchObject({ success: true, contentItems: [{ text: expect.stringContaining('Victory missing') }] });
    s.broker.close();
  });

  it('refuses arbitrary paths/commands, invalid modes, and unrouted threads', async () => {
    const s = setup();
    for (const args of [{ mode: 'build', path: '/other' }, { mode: 'shell' }, []]) s.broker.handle(request(args));
    await flush();
    expect(s.check).not.toHaveBeenCalled();
    expect(s.replies).toHaveLength(3);
    for (const reply of s.replies) expect(reply[1]).toMatchObject({ success: false });
    const noProject = setup(vi.fn(async () => ({})), vi.fn(async () => null));
    noProject.broker.handle(request());
    await flush();
    expect(noProject.check).not.toHaveBeenCalled();
    expect(noProject.replies[0]?.[1]).toMatchObject({ success: false });
  });

  it('prevents overlapping checks and cancels the engine work when the project stops', async () => {
    let signal: AbortSignal | undefined;
    const check = vi.fn((_p: ProjectRecord, _m: string, value: AbortSignal) => new Promise((_resolve, reject) => {
      signal = value;
      value.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const replies: unknown[][] = [];
    const broker = new GodotToolBroker({ server: { respondToServerRequest: (...args) => { replies.push(args); } }, resolveProject: async () => project, check });
    broker.handle(request());
    await flush();
    broker.handle(request({ mode: 'build' }, 2));
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(replies[0]).toMatchObject([2, { success: false }]);
    broker.cancel(project.id);
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(replies[1]).toMatchObject([1, { success: false }]);
    broker.close();
  });

  it('leaves unrelated tools to their broker and refuses checks after shutdown', async () => {
    const s = setup();
    expect(s.broker.handle({ ...request(), params: { tool: 'noobi_asset_list' } })).toBe(false);
    s.broker.close();
    s.broker.handle(request());
    await flush();
    expect(s.check).not.toHaveBeenCalled();
    expect(s.replies[0]?.[1]).toMatchObject({ success: false });
  });
});

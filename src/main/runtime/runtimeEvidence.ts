export interface RuntimePacket {
  scene3d?: { version: 1; scene: string; visited: number; truncated: boolean; nodes: Array<Record<string, unknown>> };
  version: 1; buildId: string; sequence: number; engineFrame: number; paused: boolean;
  state: Record<string, string | number | boolean>;
  nodes: Array<Record<string, unknown>>;
  nodesTruncated?: boolean;
  findings: Array<{ code: string; severity: string; path?: string; message: string; characters?: string }>;
}
export interface RuntimeEvidence { stepId: string; packet: RuntimePacket | null; error?: string }

export const READ_RUNTIME_EVIDENCE = `(() => {
  const packet = window.__noobiRuntime;
  const received = window.__noobiRuntimeReceivedAt;
  if (!packet || typeof received !== 'number') return null;
  const text = JSON.stringify({ packet, ageMs: performance.now() - received });
  return text.length <= 250000 ? text : null;
})()`;

export function parseRuntimeEvidence(raw: unknown, buildId: string, previousSequence = 0): RuntimePacket {
  if (typeof raw !== 'string' || raw.length > 250_000) throw new Error('运行反馈缺失或超过大小限制');
  const value = JSON.parse(raw);
  const p = value?.packet;
  if (!p || p.version !== 1 || p.buildId !== buildId) throw new Error('运行反馈与当前构建不匹配');
  if (!Number.isFinite(value.ageMs) || value.ageMs < 0 || value.ageMs > 3000) throw new Error('运行反馈已过期');
  if (!Number.isSafeInteger(p.sequence) || p.sequence <= 0 || p.sequence < previousSequence
    || !Number.isSafeInteger(p.engineFrame) || p.engineFrame <= 0) throw new Error('运行反馈时序无效');
  if (typeof p.paused !== 'boolean' || !p.state || typeof p.state !== 'object' || Array.isArray(p.state)
    || !Array.isArray(p.nodes) || p.nodes.length > 350 || !Array.isArray(p.findings) || p.findings.length > 500) {
    throw new Error('运行反馈结构无效');
  }
  if (Object.values(p.state).some((v) => !['number', 'boolean', 'string'].includes(typeof v)
    || (typeof v === 'number' && !Number.isFinite(v)))) throw new Error('运行状态值无效');
  if (p.nodesTruncated !== undefined && typeof p.nodesTruncated !== 'boolean') throw new Error('运行采样截断标记无效');
  if (p.scene3d !== undefined && (!p.scene3d || p.scene3d.version !== 1 || typeof p.scene3d.scene !== 'string'
    || typeof p.scene3d.truncated !== 'boolean' || !Number.isSafeInteger(p.scene3d.visited) || p.scene3d.visited < 0 || p.scene3d.visited > 8000
    || !Array.isArray(p.scene3d.nodes) || p.scene3d.nodes.length > 600
    || p.scene3d.nodes.some((n: unknown) => !n || typeof n !== 'object' || Array.isArray(n)))) throw new Error('3D 场景采样结构无效');
  for (const finding of p.findings) {
    if (!finding || typeof finding.code !== 'string' || typeof finding.message !== 'string'
      || typeof finding.severity !== 'string') throw new Error('场景诊断结构无效');
  }
  return p;
}

export interface RuntimeAssertion { key: string; equals?: string | number | boolean; minimum?: number; maximum?: number }
export function parseRuntimeAssertion(value: string): RuntimeAssertion {
  const assertion = JSON.parse(value);
  if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)
    || typeof assertion.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u.test(assertion.key)
    || Object.keys(assertion).some((key) => !['key', 'equals', 'minimum', 'maximum'].includes(key))) throw new Error('运行断言格式无效');
  const keys = ['equals', 'minimum', 'maximum'].filter((key) => Object.hasOwn(assertion, key));
  if (keys.length !== 1) throw new Error('运行断言需要一个比较条件');
  if (keys[0] === 'equals' ? !['string', 'number', 'boolean'].includes(typeof assertion.equals)
    : !Number.isFinite(assertion[keys[0]!])) throw new Error('运行断言值无效');
  return assertion;
}
export function runtimeAssertionPassed(packet: RuntimePacket, assertion: RuntimeAssertion): boolean {
  const value = assertion.key === 'paused' ? packet.paused : packet.state[assertion.key];
  if (value === undefined) return false;
  if (assertion.equals !== undefined) return value === assertion.equals;
  if (typeof value !== 'number') return false;
  return assertion.minimum !== undefined ? value >= assertion.minimum : value <= assertion.maximum!;
}

export function runtimeIsPaused(packet: RuntimePacket): boolean {
  return packet.paused || packet.state.state === 'paused' || packet.state.phase === 'paused';
}
export function physicsStateUnchanged(before: RuntimePacket, after: RuntimePacket): boolean {
  const physics = (p: RuntimePacket) => p.nodes.filter((n) => typeof n.class === 'string'
    && /^(CharacterBody|RigidBody)[23]D$/u.test(n.class)).map((n) => ({ path: n.path, position: n.position }));
  const counters = (p: RuntimePacket) => ['score', 'lives', 'collected', 'player_health', 'enemy_health']
    .map((key) => [key, p.state[key]]);
  return JSON.stringify(physics(before)) === JSON.stringify(physics(after))
    && JSON.stringify(counters(before)) === JSON.stringify(counters(after));
}
export function hasObservedPhysicsBodies(packet: RuntimePacket): boolean {
  return packet.nodes.some((node) => typeof node.class === 'string' && /^(CharacterBody|RigidBody)[23]D$/u.test(node.class));
}

export function visiblePhysicsMoved(before: RuntimePacket | undefined, after: RuntimePacket | undefined): boolean {
  if (!before || !after || before.buildId !== after.buildId || after.sequence <= before.sequence
    || runtimeIsPaused(before) || runtimeIsPaused(after)) return false;
  return before.nodes.some(node => {
    if (node.visible !== true || node.inViewport === false || !/^CharacterBody[23]D$/u.test(String(node.class))) return false;
    const next = after.nodes.find(n => n.path === node.path && n.class === node.class && n.visible === true && n.inViewport !== false);
    if (!next || !Array.isArray(node.position) || !Array.isArray(next.position)
      || node.position.length !== next.position.length) return false;
    const positions = [...node.position, ...next.position];
    return positions.every(v => typeof v === 'number' && Number.isFinite(v))
      && node.position.some((v, i) => Math.abs(Number(v) - Number((next.position as unknown[])[i])) > (node.class === 'CharacterBody3D' ? 0.01 : 1));
  });
}

/** This is engine visibility/character coverage, not OCR or an art score. */
export function runtimeTextVisible(packet: RuntimePacket, expected: string): boolean {
  if (!expected) return false;
  return packet.nodes.some(node => ['Label', 'Button'].includes(String(node.class))
    && node.visible === true && node.inViewport === true && typeof node.text === 'string' && node.text.includes(expected)
    && !packet.findings.some(finding => finding.code === 'missing-glyphs' && finding.path === node.path
      && [...(finding.characters ?? '')].some(character => expected.includes(character))));
}

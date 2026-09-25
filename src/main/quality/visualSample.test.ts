import { describe, expect, it } from 'vitest';
import { parseVisualSample, visualSampleFindings, type VisualSampleContract } from './visualSample.js';
import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import type { RuntimePacket } from '../runtime/runtimeEvidence.js';

function fixture() {
  const contract: VisualSampleContract = { version: 1,
    artDirection: { style: 'Warm forest pixel art', palette: ['#223344', '#779966', '#ffdd88'], readability: 'Readable high contrast foreground' },
    bindings: (['player', 'terrain', 'interactive', 'hud'] as const).map(role => ({ id: `art-${role}`, role,
      node: `World/${role}`, resource: `res://public/assets/${role}.png`, size: [42, 56], ...(role === 'player' ? { animated: true } : {}) })) };
  const packet = (sequence: number): RuntimePacket => ({ version: 1, buildId: 'build-a', sequence,
    engineFrame: sequence * 15, paused: false, state: { state: 'playing' }, findings: [],
    nodes: contract.bindings.map(b => ({ path: b.node, texture: b.resource, visible: true, inViewport: true,
      opacity: 1, displaySize: [42, 56], frame: sequence - 1 })) });
  const report = { build: { buildId: 'build-a' },
    journey: [{ id: 'move', screenshotPath: 'move.png', observations: [{ status: 'pass' }] }],
    screenshots: { action: ['move.png'] }, runtimeEvidence: [{ stepId: 'move', packet: packet(1) }, { stepId: 'move', packet: packet(2) }],
  } as unknown as GameplayExperienceReport;
  return { contract, report, packets: report.runtimeEvidence!.map(e => e.packet!) };
}

describe('visual sample binding acceptance', () => {
  it('accepts a coherent, visible four-role sample with observed animation', () => {
    const { contract, report } = fixture(); expect(visualSampleFindings(parseVisualSample(contract), report)).toEqual([]);
  });
  it('catches the real HUD native-minimum regression despite correct source image', () => {
    const { contract, report, packets } = fixture();
    packets.forEach(p => { p.nodes[3]!.displaySize = [384, 512]; });
    expect(visualSampleFindings(contract, report).join()).toContain('预期显示 42×56，实际 [384,512]');
  });
  it('accepts observed atlas regions and separate animation frames without forcing a renderer rewrite', () => {
    const { contract, report, packets } = fixture();
    packets.forEach((p, i) => { p.nodes[0]!.frame = 0; p.nodes[0]!.regionEnabled = true; p.nodes[0]!.region = [i * 512, 0, 512, 512]; });
    expect(visualSampleFindings(contract, report)).toEqual([]);
    contract.bindings[0]!.resource = ['res://public/assets/run-1.png', 'res://public/assets/run-2.png'];
    packets.forEach((p, i) => { p.nodes[0]!.regionEnabled = false; p.nodes[0]!.texture = contract.bindings[0]!.resource[i]; });
    expect(visualSampleFindings(parseVisualSample(contract), report)).toEqual([]);
  });
  it.each(['transparent', 'offscreen', 'wrong-resource', 'missing-size', 'static-animation', 'glyph'])('rejects %s evidence', mode => {
    const { contract, report, packets } = fixture();
    packets.forEach(p => {
      if (mode === 'transparent') p.nodes[0]!.opacity = 0;
      if (mode === 'offscreen') p.nodes[0]!.inViewport = false;
      if (mode === 'wrong-resource') p.nodes[0]!.texture = 'res://different.png';
      if (mode === 'missing-size') delete p.nodes[0]!.displaySize;
      if (mode === 'static-animation') p.nodes[0]!.frame = 0;
      if (mode === 'glyph') p.findings.push({ code: 'missing-glyphs', severity: 'error', message: 'missing', characters: '♥' });
    });
    expect(visualSampleFindings(contract, report).length).toBeGreaterThan(0);
  });
  it('does not assemble different screens into a false coherent sample', () => {
    const { contract, report, packets } = fixture();
    packets[0]!.nodes = packets[0]!.nodes.slice(0, 2); packets[1]!.nodes = packets[1]!.nodes.slice(2);
    expect(visualSampleFindings(contract, report).join()).toContain('同一运行画面');
  });
  it.each(['stale-build', 'menu', 'failed-step', 'no-screenshots'])('rejects %s as sample proof', mode => {
    const { contract, report, packets } = fixture();
    if (mode === 'stale-build') report.build!.buildId = 'other';
    if (mode === 'menu') packets.forEach(p => { p.state.state = 'ready'; });
    if (mode === 'failed-step') report.journey[0]!.observations[0]!.status = 'repair';
    if (mode === 'no-screenshots') report.screenshots.action = [];
    expect(visualSampleFindings(contract, report).length).toBeGreaterThan(0);
  });
  it('rejects reduced role coverage and duplicate nodes instead of waiving requirements', () => {
    const { contract } = fixture(); contract.bindings[3]!.role = 'player';
    expect(() => parseVisualSample(contract)).toThrow('同时包含');
    contract.bindings[3]!.role = 'hud'; contract.bindings[3]!.node = contract.bindings[0]!.node;
    expect(() => parseVisualSample(contract)).toThrow('唯一');
  });
  it('rejects non-finite sizes and path traversal', () => {
    const { contract } = fixture(); contract.bindings[0]!.size = [NaN, 30];
    expect(() => parseVisualSample(contract)).toThrow();
    contract.bindings[0]!.size = [42, 56]; contract.bindings[0]!.resource = 'res://../secret.png';
    expect(() => parseVisualSample(contract)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { parseRuntimeAssertion, parseRuntimeEvidence, runtimeAssertionPassed, runtimeTextVisible, visiblePhysicsMoved } from './runtimeEvidence.js';

const packet = { version: 1, buildId: 'build-1', sequence: 2, engineFrame: 30, paused: false,
  state: { state: 'playing', score: 1, collected: 0 }, nodes: [], findings: [] };
const wrap = (p = packet, ageMs = 10) => JSON.stringify({ packet: p, ageMs });
describe('runtime evidence is an observation, never a self-reported verdict', () => {
  it('recognizes Godot text only on visible in-viewport controls with the required glyphs', () => {
    const p = { ...parseRuntimeEvidence(wrap(), 'build-1'), nodes: [
      { path: 'HUD/Title', class: 'Label', text: '森林种子', visible: true, inViewport: true },
    ] };
    expect(runtimeTextVisible(p, '种子')).toBe(true);
    expect(runtimeTextVisible(p, '胜利')).toBe(false);
    expect(runtimeTextVisible({ ...p, nodes: [{ ...p.nodes[0], inViewport: false }] }, '种子')).toBe(false);
    expect(runtimeTextVisible({ ...p, nodes: [{ ...p.nodes[0], visible: false }] }, '种子')).toBe(false);
    expect(runtimeTextVisible({ ...p, findings: [{ code: 'missing-glyphs', severity: 'error', path: 'HUD/Title', characters: '种', message: 'Missing glyph' }] }, '种子')).toBe(false);
  });
  it('supplements pixels only with fresh, visible movement of the same physics body', () => {
    const p = { ...parseRuntimeEvidence(wrap(), 'build-1'), nodes: [
      { path: 'Player', class: 'CharacterBody2D', position: [130, 500], visible: true, inViewport: true },
    ] };
    const next = { ...p, sequence: 3, nodes: [{ ...p.nodes[0], position: [130, 470] }] };
    expect(visiblePhysicsMoved(p, next)).toBe(true);
    expect(visiblePhysicsMoved(p, p)).toBe(false);
    expect(visiblePhysicsMoved(p, { ...next, paused: true })).toBe(false);
    expect(visiblePhysicsMoved(p, { ...next, buildId: 'old' })).toBe(false);
    expect(visiblePhysicsMoved(p, { ...next, nodes: [{ ...next.nodes[0], visible: false }] })).toBe(false);
    expect(visiblePhysicsMoved(p, { ...next, nodes: [{ ...next.nodes[0], inViewport: false }] })).toBe(false);
  });
  it('accepts a current bounded packet and rejects wrong-build, stale and reversed samples', () => {
    expect(parseRuntimeEvidence(wrap(), 'build-1').state.score).toBe(1);
    expect(() => parseRuntimeEvidence(wrap(), 'another-build')).toThrow('构建不匹配');
    expect(() => parseRuntimeEvidence(wrap(packet, 5000), 'build-1')).toThrow('过期');
    expect(() => parseRuntimeEvidence(wrap(), 'build-1', 3)).toThrow('时序');
    expect(() => parseRuntimeEvidence(null, 'build-1')).toThrow('缺失');
  });
  it('checks typed state values without evaluating user-provided expressions', () => {
    const p = parseRuntimeEvidence(wrap(), 'build-1');
    expect(runtimeAssertionPassed(p, parseRuntimeAssertion('{"key":"score","minimum":1}'))).toBe(true);
    expect(runtimeAssertionPassed(p, parseRuntimeAssertion('{"key":"state","equals":"won"}'))).toBe(false);
    expect(runtimeAssertionPassed(p, parseRuntimeAssertion('{"key":"score","equals":"1"}'))).toBe(false);
    expect(runtimeAssertionPassed(p, parseRuntimeAssertion('{"key":"unknown","equals":0}'))).toBe(false);
    expect(runtimeAssertionPassed(p, parseRuntimeAssertion('{"key":"paused","equals":false}'))).toBe(true);
    expect(() => parseRuntimeAssertion('{"key":"state","equals":"won","script":"setScore(3)"}')).toThrow();
    expect(() => parseRuntimeAssertion('{"key":"constructor.constructor","equals":true}')).toThrow();
  });
  it('rejects malformed 3D inventory instead of silently dropping coverage evidence', () => {
    const scene3d={version:1,scene:'res://main.tscn',visited:8000,truncated:true,nodes:[]};
    expect(parseRuntimeEvidence(wrap({...packet,scene3d} as typeof packet),'build-1').scene3d?.truncated).toBe(true);
    expect(()=>parseRuntimeEvidence(wrap({...packet,scene3d:{...scene3d,nodes:Array(601).fill({})}} as typeof packet),'build-1')).toThrow('3D');
    expect(()=>parseRuntimeEvidence(wrap({...packet,scene3d:{...scene3d,truncated:'false'}} as typeof packet),'build-1')).toThrow('3D');
  });
  it('does not treat a pass field as evidence of victory', () => {
    const raw = wrap({ ...packet, state: { ...packet.state, pass: true } } as typeof packet);
    expect(runtimeAssertionPassed(parseRuntimeEvidence(raw, 'build-1'), { key: 'state', equals: 'won' })).toBe(false);
  });
});

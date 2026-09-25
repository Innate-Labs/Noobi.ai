import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeProgression, applyProgression, initialProgression, parseProgression } from './progressionGraph.js';
const fixture = () => JSON.parse(readFileSync(new URL('../../../examples/progression/three-regions.json', import.meta.url), 'utf8'));
describe('progression prerequisites', () => {
  it('finds a complete route and consumes a bidirectional gate key only once', () => {
    const d=parseProgression(fixture()), report=analyzeProgression(d);
    expect(report).toMatchObject({ok:true,complete:true,findings:[]});
    let state=initialProgression(d);
    expect(applyProgression(d,state,{kind:'travel',id:'camp-ruins'})).toBeNull();
    state=applyProgression(d,state,{kind:'quest',id:'camp-key'})!;
    expect(applyProgression(d,state,{kind:'quest',id:'camp-key'})).toBeNull();
    state=applyProgression(d,state,{kind:'travel',id:'camp-ruins'})!;
    expect(state.inventory.key).toBe(0);
    state=applyProgression(d,state,{kind:'travel',id:'camp-ruins'})!;
    expect(state.region).toBe('camp');expect(state.inventory.key).toBe(0);
    let completed=initialProgression(d);for(const action of report.route)completed=applyProgression(d,completed,action)!;
    expect(completed).toMatchObject({region:'summit',completed:['camp-key','finale','ruins-glide'],inventory:{key:0,gem:2}});
  });
  it('detects wrong-branch key consumption even when a winning route exists', () => {
    const d=fixture();d.regions.push('cave');d.links.push({id:'wrong-gate',from:'camp',to:'cave',bidirectional:true,requires:{quests:[],abilities:[],items:{key:1}},consume:{key:1}});
    const report=analyzeProgression(parseProgression(d));
    expect(report.ok).toBe(false);expect(report.route.length).toBeGreaterThan(0);expect(report.findings.join(' ')).toContain('cannot reach an ending');
  });
  it('rejects cyclic prerequisites, unreachable keys and missing endings', () => {
    const cycle=fixture();cycle.quests[0].requires.quests=['ruins-glide'];expect(()=>parseProgression(cycle)).toThrow('cyclic');
    const locked=fixture();locked.quests[0].region='ruins';expect(analyzeProgression(parseProgression(locked)).findings.join(' ')).toContain('No reachable ending');
    const missing=fixture();missing.goals=[];expect(()=>parseProgression(missing)).toThrow('goals');
    const invalid=fixture();invalid.links[0].consume.key=2;expect(()=>parseProgression(invalid)).toThrow('links');
  });
  it('does not call bounded or incomplete state exploration success', () => {
    const report=analyzeProgression(parseProgression(fixture()),2);
    expect(report).toMatchObject({ok:false,complete:false});expect(report.findings[0]).toContain('budget');
  });
});

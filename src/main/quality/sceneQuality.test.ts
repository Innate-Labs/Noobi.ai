import { describe, expect, it } from 'vitest';
import { evaluateSceneQuality, parseSceneQuality, type SceneQualityContract } from './sceneQuality.js';
import type { GameplayExperienceReport } from '../gameplayExperienceEvaluator.js';
import type { RuntimePacket } from '../runtime/runtimeEvidence.js';
import { gameQualitySpec, supportsVisualSample, qualitySpecPrompt } from '../production/gameQualitySpec.js';
function fixture() {
  const subjects = [
    { id: 'player', node: 'Player', role: 'player', treatment: 'procedural', design: 'Outlined armored character', collision: 'solid' },
    { id: 'terrain', node: 'Terrain', role: 'terrain', treatment: 'procedural', design: 'Sculpted moss terrain', collision: 'solid' },
    { id: 'gate', node: 'Gate', role: 'interactive', treatment: 'model', design: 'Detailed wooden repair station', collision: 'solid', resource: 'res://gate.glb' },
    { id: 'hud', node: 'HUD', role: 'hud', treatment: 'interface', design: 'Readable status display', collision: 'none' },
  ] as SceneQualityContract['scenes'][0]['subjects'];
  const contract: SceneQualityContract = { version: 1, representative: 'forest', artDirection: { style: 'Moss forest', palette: ['#123456', '#345678', '#abcdef'], proportions: 'Human-scale readable forms', lighting: 'Warm diffuse daylight' },
    scenes: [{ id: 'forest', resource: 'res://main.tscn', views: ['move-a', 'move-b'], subjects, collisionSteps: ['move-b'], interaction: { before: 'move-b', after: 'use', key: 'collected' } }] };
  const packet = (sequence: number): RuntimePacket => ({ version: 1, buildId: 'build-a', sequence, engineFrame: sequence * 15, paused: false,
    state: { state: 'playing', collected: sequence === 3 ? 1 : 0 }, findings: [], nodes: [{ path: 'HUD/Label', visible: true, inViewport: true }],
    scene3d: { version: 1, scene: 'res://main.tscn', visited: 15, truncated: false, nodes: [
      ...subjects.slice(0,3).flatMap(s => [{ kind: 'geometry', path: `${s.node}/Art`, visible: true, inViewport: true, sourceScene: s.resource ?? '', meshClass: 'ArrayMesh', surfaces: 1, materials: 1 },
        { kind: 'body', path: s.node, class: s.role === 'player' ? 'CharacterBody3D' : 'StaticBody3D', layer: 1, contacts: ['Terrain','Gate'] }, { kind: 'shape', path: `${s.node}/Shape`, body: s.node, enabled: true }]),
      { kind: 'camera', path: 'Player/Camera', current: true, position: [sequence, 2, 5], rotation: [0,0,0] }] } });
  const report = { build: { buildId: 'build-a', sourceHash: 'source-a', artifactHash: 'artifact-a' }, reportPath: 'artifacts/playtest/latest/report.json',
    journey: ['move-a','move-b','use'].map((id,i) => ({ id, action: i === 2 ? 'primary' : 'move', screenshotPath: `${id}.png`, observations: [{status:'pass'}] })),
    runtimeEvidence: ['move-a','move-b','use'].map((stepId,i) => ({stepId, packet:packet(i+1)})) } as GameplayExperienceReport;
  return { contract, report, packets: report.runtimeEvidence!.map(e => e.packet!) };
}
describe('3D scene coverage is observed rather than declared', () => {
  it('accepts complete binding and input evidence while retaining independent art review requirements', () => {
    const f = fixture(); const result = evaluateSceneQuality(parseSceneQuality(f.contract), f.report);
    expect(result.status).toBe('pass'); expect(result.observedGeometry).toBe(3); expect(result.coveredGeometry).toBe(3);
    expect(result.reviewRequired.join()).toContain('独立审查');
  });
  it('finds undeclared offscreen procedural geometry independently of the manifest', () => {
    const f = fixture(); f.packets.forEach(p => p.scene3d!.nodes.push({ path:'ForgottenTerrain',kind:'geometry', visible:false,inViewport:false }));
    const result = evaluateSceneQuality(f.contract, f.report); expect(result.observedGeometry).toBe(4); expect(result.coveredGeometry).toBe(3);
    expect(result.findings.join()).toContain('ForgottenTerrain');
  });
  it.each(['truncated','missing-inventory','wrong-resource','missing-material','no-shape','no-contact','static-camera','no-interaction','wrong-build','menu','failed-observation','no-screenshot','no-current-camera','unsupported-renderer'])('rejects %s evidence', mode => {
    const f = fixture();
    f.packets.forEach(p => {
      if(mode==='truncated') p.scene3d!.truncated=true;
      if(mode==='missing-inventory') delete p.scene3d;
      if(mode==='wrong-resource') p.scene3d!.nodes[6]!.sourceScene='res://wrong.glb';
      if(mode==='missing-material') p.scene3d!.nodes[0]!.materials=0;
      if(mode==='no-shape') p.scene3d!.nodes=p.scene3d!.nodes.filter(n=>n.kind!=='shape');
      if(mode==='no-contact') p.scene3d!.nodes.forEach(n=>{n.contacts=[]});
      if(mode==='static-camera') p.scene3d!.nodes.at(-1)!.position=[0,2,5];
      if(mode==='no-interaction') p.state.collected=0;
      if(mode==='wrong-build') p.buildId='old';
      if(mode==='menu') p.state.state='ready';
      if(mode==='no-current-camera') p.scene3d!.nodes.at(-1)!.current=false;
      if(mode==='unsupported-renderer') p.scene3d!.nodes[0]!.meshClass='unsupported';
    });
    if(mode==='failed-observation') f.report.journey.forEach(s=>s.observations[0]!.status='repair');
    if(mode==='no-screenshot') f.report.journey.forEach(s=>s.screenshotPath=null);
    expect(evaluateSceneQuality(f.contract,f.report).status).toBe('repair');
  });
  it('does not let floor contact hide an untested solid interactive object', () => {
    const f=fixture();f.packets.forEach(p=>p.scene3d!.nodes.forEach(n=>{if(n.kind==='body')n.contacts=['Terrain']}));
    expect(evaluateSceneQuality(f.contract,f.report).findings.join()).toContain('地面接触不能替代机关');
  });
  it('accepts recent real contacts only within the current input step and a 1.5 second window', () => {
    const f=fixture();const body=f.packets[1]!.scene3d!.nodes.find(n=>n.class==='CharacterBody3D')!;
    body.contacts=['Terrain'];body.recentContacts=[{path:'Gate',engineFrame:29,ageMs:400}];
    expect(evaluateSceneQuality(f.contract,f.report).status).toBe('pass');
    body.recentContacts=[{path:'Gate',engineFrame:10,ageMs:400}];
    expect(evaluateSceneQuality(f.contract,f.report).status).toBe('repair');
    body.recentContacts=[{path:'Gate',engineFrame:29,ageMs:1800}];
    expect(evaluateSceneQuality(f.contract,f.report).status).toBe('repair');
  });
  it('requires every declared scene at delivery, while the early milestone may inspect only its representative', () => {
    const f=fixture(); f.contract.scenes.push({...structuredClone(f.contract.scenes[0]!),id:'cave',resource:'res://cave.tscn'});
    expect(evaluateSceneQuality(f.contract,f.report,'sample').status).toBe('pass');
    expect(evaluateSceneQuality(f.contract,f.report).findings.join()).toContain('cave: 未到达');
  });
  it('supports multipart model bindings without accepting unrelated resources', () => {
    const f=fixture();f.contract.scenes[0]!.subjects[2]!.resource=['res://gate.glb','res://handle.glb'];
    f.packets.forEach(p=>p.scene3d!.nodes.push({kind:'geometry',path:'Gate/Handle',visible:true,inViewport:true,sourceScene:'res://handle.glb',meshClass:'ArrayMesh',surfaces:1,materials:1}));
    expect(evaluateSceneQuality(parseSceneQuality(f.contract),f.report).status).toBe('pass');
    f.packets[0]!.scene3d!.nodes.at(-1)!.sourceScene='res://wrong.glb';
    expect(evaluateSceneQuality(f.contract,f.report).findings.join()).toContain('Gate/Handle');
  });
  it('does not count a model resource name as visual approval of primitive shapes', () => {
    const f=fixture(); f.packets.forEach(p=>p.scene3d!.nodes[6]!.primitive=true);
    expect(evaluateSceneQuality(f.contract,f.report).reviewRequired.join()).toContain('基础几何');
  });
  it('rejects broad overlapping bindings, missing core roles and unspecified procedural art', () => {
    const f=fixture(); f.contract.scenes[0]!.subjects[1]!.node='Player/Ground'; expect(()=>parseSceneQuality(f.contract)).toThrow('独立');
    f.contract.scenes[0]!.subjects[1]!.node='Terrain'; f.contract.scenes[0]!.subjects[1]!.design=''; expect(()=>parseSceneQuality(f.contract)).toThrow();
    f.contract.scenes[0]!.subjects.pop(); expect(()=>parseSceneQuality(f.contract)).toThrow();
  });
  it('enables 3D milestones from the selected plan dimension even without 3D in the title', () => {
    const spec=gameQualitySpec({name:'森林探索',idea:'修复工坊',engine:'godot',targetFrameRate:60},'3d');
    expect(supportsVisualSample(spec)).toBe(true); expect(qualitySpecPrompt(spec)).toContain('.noobi/scene-quality.json');
    expect(supportsVisualSample(gameQualitySpec({name:'纸牌',idea:'card game',engine:'godot',targetFrameRate:60},'2d'))).toBe(false);
  });
});

import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import{describe,it,expect}from'vitest';import{validateComparison,ReferenceComparisonStore}from'./referenceComparison.js';import{COMPARISON_DIMENSIONS,type ReferenceComparisonPayload,type SaveReferenceComparisonInput}from'../../shared/referenceComparison.js';
const payload={build:{buildId:'build-1',sourceHash:'s',artifactHash:'a',testSuiteVersion:'v'},currentSource:true,references:[{id:'ref-1',sha256:'r'}],captures:[{sha256:'c'}]} as ReferenceComparisonPayload;
const input:SaveReferenceComparisonInput={projectId:'p',buildId:'build-1',referenceId:'ref-1',captureHash:'c',cameraAndState:'参考为插画，当前为近距离背面镜头；不能直接判定同一构图。',notes:COMPARISON_DIMENSIONS.map(dimension=>({dimension,finding:'unreviewed',note:''}))};
describe('reference comparison integrity',()=>{
 it('binds manual observations to exact reference, screenshot and current build',()=>{expect(validateComparison(input,payload)).toMatchObject({source:'manual-record',captureHash:'c',referenceHash:'r'});for(const change of [{buildId:'old'},{referenceId:'missing'},{captureHash:'other'},{cameraAndState:''}])expect(()=>validateComparison({...input,...change},payload)).toThrow();expect(()=>validateComparison(input,{...payload,currentSource:false})).toThrow();});
 it('requires separate supported findings; blank or duplicate judgement cannot certify match',()=>{expect(()=>validateComparison({...input,notes:input.notes.map(n=>({...n,finding:'aligned'}))},payload)).toThrow();expect(()=>validateComparison({...input,notes:Array(5).fill(input.notes[0])},payload)).toThrow();const notes=input.notes.map(n=>({...n,finding:'not-observable' as const,note:'静态截图没有连续动作或规则证据。'}));expect(validateComparison({...input,notes},payload).notes.every(n=>n.finding==='not-observable')).toBe(true);});
});

it('persists immutable observations across instances and rejects damaged evidence', async () => {
 const root = await mkdtemp(join(tmpdir(), 'noobi-comparison-'));
 try {
  const saved = await new ReferenceComparisonStore(root).save(input, payload);
  expect(await new ReferenceComparisonStore(root).list('p', 'build-1')).toEqual([saved]);
  const path = join(root, 'p', 'build-1', saved.id + '.json');
  const envelope = JSON.parse(await readFile(path, 'utf8'));
  envelope.record.cameraAndState = 'changed after recording';
  await writeFile(path, JSON.stringify(envelope));
  await expect(new ReferenceComparisonStore(root).list('p', 'build-1')).rejects.toThrow('损坏');
  await expect(new ReferenceComparisonStore(root).list('../escape', 'build-1')).rejects.toThrow();
 } finally { await rm(root, { recursive: true, force: true }); }
});

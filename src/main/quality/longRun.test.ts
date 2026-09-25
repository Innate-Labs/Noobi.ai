import {describe,it,expect} from 'vitest';
import {parseLongRunPolicy,frameDistribution} from './longRun.js';
const policy={version:1,durationSeconds:1800,width:1280,height:720,graphicsPreset:'declared-normal',targetFps:60,maxLongFrameRatio:.01,maxRendererGrowthMiB:128,initial:[{key:'Enter',holdMs:80}],cycle:[{key:'D',holdMs:100},{waitMs:1000}]};
describe('long-run evidence policy',()=>{
 it('freezes bounded input and rejects invalid/unbounded measurement settings',()=>{expect(parseLongRunPolicy(policy)).toEqual(policy);for(const update of [{durationSeconds:9},{durationSeconds:Infinity},{targetFps:0},{maxLongFrameRatio:NaN},{cycle:[{key:'W',holdMs:999999}]},{cycle:[{waitMs:2,code:'cheat'}]}])expect(()=>parseLongRunPolicy({...policy,...update})).toThrow();});
 it('reports frame stalls without calling browser samples engine FPS',()=>{const r=frameDistribution([16,17,16,100,NaN],60);expect(r).toMatchObject({samples:4,p50Ms:16,p95Ms:100,longFrames:1,longFrameRatio:.25});expect(frameDistribution([],60).p95Ms).toBeNull();});
});

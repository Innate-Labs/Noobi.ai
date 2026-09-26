import { describe, it, expect } from 'vitest';
import { assertPortableSkinTracks } from './modelAnimationPortability.js';
const fixture=(node:number,path:string)=>({nodes:[{name:'ActorRoot'},{name:'Body',mesh:0,skin:0},{name:'Hip'}],animations:[{name:'move',channels:[{target:{node,path}}]}]});
describe('Godot skin animation portability',()=>{
  it.each(['translation','rotation','scale'])('rejects direct skinned-node %s including skin index zero',path=>{
    expect(()=>assertPortableSkinTracks(fixture(1,path))).toThrow('GODOT_SKIN_TRACK');
  });
  it('allows ordinary parent and joint transforms and morph weights',()=>{
    for(const value of [fixture(0,'translation'),fixture(2,'rotation'),fixture(1,'weights'),{nodes:[],animations:[]}])expect(()=>assertPortableSkinTracks(value)).not.toThrow();
  });
  it('checks every channel and identifies an unnamed offending clip',()=>{
    const value=fixture(0,'translation');value.animations.push({name:'',channels:[{target:{node:1,path:'scale'}}]});
    expect(()=>assertPortableSkinTracks(value)).toThrow('Body.scale');
  });
});

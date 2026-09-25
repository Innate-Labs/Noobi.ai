import{randomUUID,createHash}from'node:crypto';import{mkdir,readFile,readdir,writeFile,rename}from'node:fs/promises';import{join}from'node:path';
import{COMPARISON_DIMENSIONS,type ReferenceComparisonRecord,type ReferenceComparisonPayload,type SaveReferenceComparisonInput}from'../../shared/referenceComparison.js';
export function validateComparison(input:SaveReferenceComparisonInput,payload:ReferenceComparisonPayload):Omit<ReferenceComparisonRecord,'id'|'createdAt'> {
 const reference=payload.references.find(r=>r.id===input.referenceId),capture=payload.captures.find(c=>c.sha256===input.captureHash);
 if(!payload.currentSource || input.buildId!==payload.build.buildId || !reference || !capture)throw Error('参考、截图或构建已变化，请刷新后对照');
 if(typeof input.cameraAndState!=='string'||input.cameraAndState.trim().length<4||input.cameraAndState.length>2000)throw Error('请说明双方镜头、距离和游戏状态是否可比较');
 if(!Array.isArray(input.notes)||input.notes.length!==5||new Set(input.notes.map(n=>n.dimension)).size!==5)throw Error('请分别记录五个对照维度');
 for(const n of input.notes){if(!COMPARISON_DIMENSIONS.includes(n.dimension)||!['unreviewed','aligned','differs','adapted','not-observable'].includes(n.finding)||typeof n.note!=='string'||n.note.length>2000||n.finding!=='unreviewed'&&n.note.trim().length<4)throw Error('对照结论需要对应证据说明');}
 return{build:structuredClone(payload.build),referenceId:reference.id,referenceHash:reference.sha256,captureHash:capture.sha256,cameraAndState:input.cameraAndState.trim(),notes:structuredClone(input.notes),source:'manual-record'};
}
export class ReferenceComparisonStore {
 constructor(private readonly root:string){}
 private directory(projectId:string,buildId:string){if(!/^[a-zA-Z0-9_-]{1,128}$/u.test(projectId)||!/^[a-zA-Z0-9_-]{1,128}$/u.test(buildId))throw Error('对照记录 ID 无效');return join(this.root,projectId,buildId);}
 async list(projectId:string,buildId:string):Promise<ReferenceComparisonRecord[]>{const directory=this.directory(projectId,buildId);let entries:string[];try{entries=await readdir(directory)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return[];throw e;}const records=[];if(entries.length>1000)throw Error('对照记录过多，请归档后继续');for(const file of entries.filter(f=>/^[a-f0-9-]{36}\.json$/u.test(f))){const envelope=JSON.parse(await readFile(join(directory,file),'utf8'));if(!envelope.record||createHash('sha256').update(JSON.stringify(envelope.record)).digest('hex')!==envelope.sha256)throw Error('对照记录损坏，未采用');records.push(envelope.record as ReferenceComparisonRecord);}return records.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-100);}
 async save(input:SaveReferenceComparisonInput,payload:ReferenceComparisonPayload){const record={...validateComparison(input,payload),id:randomUUID(),createdAt:new Date().toISOString()};const directory=this.directory(input.projectId,input.buildId);await mkdir(directory,{recursive:true,mode:0o700});const destination=join(directory,record.id+'.json'),temporary=destination+'.tmp';await writeFile(temporary,JSON.stringify({record,sha256:createHash('sha256').update(JSON.stringify(record)).digest('hex')}),{flag:'wx',mode:0o600});await rename(temporary,destination);return record;}
}

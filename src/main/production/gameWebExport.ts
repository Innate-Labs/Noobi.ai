import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import {join,dirname,extname} from 'node:path';
import {safeRoot,scanVersionFiles,readVersionFile,digest,validRelative} from './versionFiles.js';
export interface WebExportInput {
 root:string; directory:string; destinationParent:string; versionId:string; title:string; status:string;
 binding:Record<string,string>; verify:()=>Promise<void>;
}
const allowed = new Set(['.html','.js','.mjs','.css','.json','.wasm','.pck','.png','.svg','.jpg','.jpeg','.webp','.gif','.ico','.ogg','.mp3','.wav','.woff','.woff2','.ttf','.otf','.glb','.bin','.data','.txt']);
export function assertExportSafe(path:string,bytes:Buffer):void {
 if(!validRelative(path) || path.split('/').some(p=>p.startsWith('.') || /^(?:auth|credentials|secrets)(?:\.|$)/iu.test(p)) || !allowed.has(extname(path).toLowerCase())) throw Error(`试玩包不支持该文件：${path}`);
 // Scan binary containers as well as text. This catches common accidental leaks, not encrypted/encoded secrets.
 const text=bytes.toString('latin1');
 // Godot/Emscripten embeds these virtual browser filesystem defaults; they are not host paths.
 const hostPathText=text.replace(/\/home\/web_user\/(?:\.cache|\.config|\.local\/share)(?=[\x00\s"']|$)/gu,'<virtual-user-dir>');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{32,}|\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}|\b(?:ghp|github_pat)_[a-zA-Z0-9_]{20,}|\bBearer [a-zA-Z0-9_.-]{20,}|["']?(?:api_key|access_token|refresh_token)["']?\s*[:=]\s*["'][^"']{12,}["']/iu.test(text)
   || /(?:\/Users\/|\/home\/)[^/\x00\r\n"'(){};]{1,100}\/|[A-Z]:\\Users\\/u.test(hostPathText)
   || /(?:\.codex\/auth\.json|\.env(?:\.local)?\x00)/u.test(text)) throw Error(`试玩包检测到凭据或机器路径，请先修复后重建：${path}`);
}
/** Copy verified exports only; no project metadata, development account, or source tree. */
export async function exportGameWeb(input:WebExportInput):Promise<{path:string;manifestHash:string;files:number}> {
 if(!['dist','build/web'].includes(input.directory) || !/^[a-zA-Z0-9_-]{1,128}$/u.test(input.versionId))throw Error('无效导出版本');
 await input.verify();const root=await safeRoot(input.root),parent=await safeRoot(input.destinationParent),source=await safeRoot(join(root,input.directory));
 const files=await scanVersionFiles(source);if(!files.some(f=>f.path==='index.html'))throw Error('版本没有 Web 入口');
 const id=randomUUID(),temporary=join(parent,`.noobi-export-${id}`),destination=join(parent,`Noobi-Web-${input.versionId.slice(0,12)}-${id.slice(0,8)}`);
 await mkdir(temporary,{mode:0o700});
 try {
  const copied=[];
  for(const f of files){const bytes=await readVersionFile(source,f.path);if(digest(bytes)!==f.sha256)throw Error('导出期间文件变化');assertExportSafe(f.path,bytes);const target=join(temporary,'game',f.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});copied.push({path:`game/${f.path}`,sha256:f.sha256,size:bytes.length});}
  // Preserve redistributable font notices outside the PCK too, without shipping any source/account JSON.
  for(const f of await scanVersionFiles(root)){
   if(!(/^(?:LICENSE[^/]*|CREDITS[^/]*)\.(?:txt|md)$/iu.test(f.path) || /^runtime\/noobi\/fonts\/(?:OFL\.txt|LICENSES\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.txt)$/u.test(f.path)))continue;
   const bytes=await readVersionFile(root,f.path);assertExportSafe(f.path.replace(/\.md$/u,'.txt'),bytes);const path=`licenses/${f.path}`;await mkdir(dirname(join(temporary,path)),{recursive:true});await writeFile(join(temporary,path),bytes,{flag:'wx'});copied.push({path,sha256:digest(bytes),size:bytes.length});
  }
  await input.verify();
  const manifest={schemaVersion:1,versionId:input.versionId,title:input.title,status:input.status,binding:input.binding,createdAt:new Date().toISOString(),target:'web-static',entrypoint:'game/index.html',files:copied,validation:{copiedBytesVerified:true,commonSecretPatternScan:true,encodedSecretAudit:'not-assessed',cleanDevice:'not-assessed',nativeDesktop:'not-included'}};
  const json=JSON.stringify(manifest,null,2)+'\n';await writeFile(join(temporary,'manifest.json'),json,{flag:'wx'});
  await writeFile(join(temporary,'README.txt'),`Noobi Web 试玩包\n\n版本：${input.versionId}\n检查状态：${input.status}\n\n将 game 文件夹作为网站根目录交给静态 HTTP/HTTPS 服务，访问 index.html。不要用 file:// 双击 HTML；WASM 和浏览器存档需要稳定的站点来源。离线本地试玩需提供本地 HTTP 服务。本包不包含桌面启动器，不声称已经通过干净设备验收。\n\n游玩不需要 Noobi、Godot 编辑器或模型账户；运行兼容性以该版本的实际试玩证据为准。首次点击游戏后音频才能启动。存档由游戏保存在此浏览器/此站点，隐私模式或清理站点数据可能移除存档；换站点不会自动迁移。若鼠标锁定不受支持，使用游戏提供的拖拽模式。全屏必须由用户手势触发。\n\n更新时保留旧包，先核对游戏存档兼容说明。manifest.json 记录本包每个产物文件的 SHA-256，导出不会重新生成游戏或公开发布。字体许可证在 licenses/，其他素材来源应以游戏署名和版本材料为准。\n`,{flag:'wx'});
  await rename(temporary,destination);return{path:destination,manifestHash:digest(json),files:copied.length};
 }catch(error){await rm(temporary,{recursive:true,force:true});throw error;}
}

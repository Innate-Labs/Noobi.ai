// Engineering export verification, not a complete-game or clean-device acceptance.
import {readFile,writeFile,mkdir,cp,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {assertExportSafe} from '../dist/main/production/gameWebExport.js';
import {GodotBuildStore} from '../dist/main/production/godotBuildStore.js';
const exec = promisify(execFile);
if(process.platform!=='darwin') throw Error('This engineering check targets macOS only');
const input=JSON.parse(await readFile('.noobi-private/game-ui/latest-build.json','utf8'));
const store=new GodotBuildStore(input.store),build=await store.get(input.projectId,input.buildId);
await store.verifyInputs(build);await store.verifyArtifacts(build);
const out=resolve('.noobi-private/stage-10/native',new Date().toISOString().replaceAll(':','-'));
const source=join(out,'export-source'),delivery=join(out,'delivery'),empty=join(out,'empty-cwd');
await mkdir(out,{recursive:true});await mkdir(delivery);await mkdir(empty);
const godot=process.env.NOOBI_GODOT_PATH||'/opt/homebrew/bin/godot';
const run=async(file,args,label,options={})=>{
 try{const result=await exec(file,args,{timeout:180000,maxBuffer:8*1024*1024,...options});
 await writeFile(join(out,label+'.log'),result.stdout+'\n'+result.stderr);
 if(/SCRIPT ERROR|Parse Error|ERROR:/u.test(result.stdout+'\n'+result.stderr))throw Error(label+' reported an engine error');return result;
 }catch(error){await writeFile(join(out,label+'-failed.log'),String(error.stdout||'')+'\n'+String(error.stderr||'')+'\n'+error.message);throw error;}
};
const version=(await run(godot,['--version'],'version')).stdout.trim();
if(version!==build.record.engineVersion)throw Error('Engine differs from frozen candidate');
await cp(build.root,source,{recursive:true});
// Native ARM/Universal export requires its own texture import target.
const projectPath=join(source,'project.godot');
let project=await readFile(projectPath,'utf8');
project=project.replace(/^textures\/vram_compression\/import_etc2_astc=.*\n?/mu,'');
if(!/^\[rendering\]$/mu.test(project))project+='\n[rendering]\n';
project=project.replace(/^\[rendering\]$/mu,'[rendering]\ntextures/vram_compression/import_etc2_astc=true');
await writeFile(projectPath,project);
await writeFile(join(source,'export_presets.cfg'),`[preset.0]
name="macOS"
platform="macOS"
runnable=true
export_filter="all_resources"
include_filter="data/*.json,runtime/noobi/fonts/*.json,runtime/noobi/fonts/*.txt,runtime/noobi/fonts/LICENSES/*/*.txt"
exclude_filter="build/*,artifacts/*"
export_path=""
script_export_mode=2
[preset.0.options]
application/bundle_identifier="local.noobi.engineering.ui"
application/short_version="0.1.0"
application/version="0.1.0"
application/category="games"
application/export_angle=0
codesign/codesign=1
notarization/notarization=0
privacy/microphone_usage_description=""
privacy/camera_usage_description=""
`);
await run(godot,['--headless','--path',source,'--editor','--quit'],'import');
const app=join(delivery,'Noobi-UI-Engineering.app');
await run(godot,['--headless','--path',source,'--export-release','macOS',app],'export');
// No editor, generated source path, development preload, or model account is passed.
const plist=JSON.parse((await exec('/usr/bin/plutil',['-convert','json','-o','-',join(app,'Contents/Info.plist')])).stdout);
const executable=join(app,'Contents/MacOS',plist.CFBundleExecutable);
await stat(executable);
const pack=join(app,'Contents/Resources',plist.CFBundleExecutable+'.pck');
await stat(pack);
assertExportSafe('native.pck',await readFile(pack));
const loaded=await run(executable,['--headless','--quit-after','120'],'standalone-headless',{cwd:empty});
const packets=loaded.stdout.split('\n').filter(line=>line.startsWith('NOOBI_RUNTIME ')).map(line=>JSON.parse(line.slice(14)));
if(!packets.some(p=>p.buildId===build.record.buildId&&p.state?.state==='title'&&p.nodes?.some(n=>n.class==='Button'&&n.text==='开始新的冒险')))throw Error('Native game did not expose its actual title and UI');
await run('/usr/bin/codesign',['--verify','--deep','--strict',app],'signature');
await run(executable,['--write-movie',join(out,'native-title.avi'),'--quit-after','5','--resolution','1280x720'],'standalone-visible',{cwd:empty,timeout:30000});
await run(process.env.NOOBI_FFMPEG_PATH||'/opt/homebrew/bin/ffmpeg',['-y','-i',join(out,'native-title.avi'),'-frames:v','1',join(out,'native-title.png')],'capture');
// The real engine supplies its own exact-version license and third-party notices.
const licenseScript=join(out,'engine-licenses.gd');
await writeFile(licenseScript,`extends SceneTree
func _initialize() -> void:
    var destination = OS.get_cmdline_user_args()[0]
    var file = FileAccess.open(destination.path_join("GODOT-LICENSE.txt"), FileAccess.WRITE)
    file.store_string(Engine.get_license_text())
    file.close()
    file = FileAccess.open(destination.path_join("GODOT-THIRD-PARTY.json"), FileAccess.WRITE)
    file.store_string(JSON.stringify({"copyright": Engine.get_copyright_info(), "licenses": Engine.get_license_info()}, "  "))
    file.close()
    quit()
`);
await run(godot,['--headless','--script',licenseScript,'--',delivery],'licenses');
await cp(join(source,'runtime/noobi/fonts'),join(delivery,'font-notices'),{recursive:true});
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
await store.verifyInputs(build);await store.verifyArtifacts(build);
const manifest={version:1,engineeringFixture:true,sourceBuild:{buildId:build.record.buildId,sourceHash:build.record.sourceHash,webArtifactHash:build.record.artifactHash},target:'macOS',engine:version,app:app.slice(delivery.length+1),nativePackHash:await hash(pack),executableHash:await hash(executable),exportProjectHash:await hash(projectPath),exportPresetHash:await hash(join(source,'export_presets.cfg')),validation:{nativeHeadlessLoad:true,nativeTitleCaptured:true,adHocSignatureVerified:true,interactivePlaythrough:false,cleanOsUser:false,otherDevice:false,notarized:false,sourceCandidateUnchanged:true,commonSecretAndPathScan:true},note:'Native artifact is a separately exported candidate and requires its own gameplay acceptance.'};
await writeFile(join(delivery,'manifest.json'),JSON.stringify(manifest,null,2));
await writeFile(join(delivery,'README.txt'),'Noobi macOS 工程验证包\n\n双击 Noobi-UI-Engineering.app 可启动工程游戏。运行无需 Noobi、Godot 编辑器或模型账户。此包仅经过当前电脑原生无界面加载检查；不代表完整游戏、原生交互、干净系统或其他设备验收。\n本地 ad-hoc 签名，未公证，下载到其他电脑后的 Gatekeeper 行为未验证。未修改系统安全设置。\nWeb 和原生存档属于不同存储位置，不承诺自动迁移。原生包是独立导出变体，其 hash 与 Web 包不同，见 manifest.json。\n');
await writeFile('.noobi-private/stage-10/native-latest.json',JSON.stringify({out,delivery,app,executable,manifest},null,2));
console.log(JSON.stringify({out,delivery,nativeHeadlessLoad:true,cleanDevice:false}));

import{app}from'electron';import{readFile,writeFile,mkdir}from'node:fs/promises';import{resolve,join}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';import assert from'node:assert/strict';
import{ProjectStore}from'../dist/main/projectStore.js';import{GodotBuildStore}from'../dist/main/production/godotBuildStore.js';import{GodotEnvironmentService}from'../dist/main/godotEnvironmentService.js';import{buildGodotCandidate}from'../dist/main/production/godotBuilder.js';
const out=resolve('.noobi-private/game-ui/font-check',new Date().toISOString().replaceAll(':','-'));app.setPath('userData',join(out,'electron'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{try{
await mkdir(out,{recursive:true});const projects=new ProjectStore(join(out,'projects.json'),join(out,'games'));await projects.init();const project=await projects.create({name:'Progression export fixture',idea:'Engineering JSON export only',engine:'godot',parentDirectory:join(out,'games')});await mkdir(join(project.root,'data'));
await writeFile(join(project.root,'data/progression.json'),await readFile('examples/progression/three-regions.json'));
await writeFile(join(project.root,'verify_pack.gd'),`extends SceneTree
func _initialize():
    var d = JSON.parse_string(FileAccess.get_file_as_string("res://data/progression.json"))
    assert(d is Dictionary and d.regions.size() == 3)
    var progress = load("res://runtime/noobi/progression_v1.gd").new()
    assert(progress.configure(d).ok)
    var font = load("res://runtime/noobi/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2")
    assert(font is FontFile)
    for character in "生命目标背包继续游戏暂停设置失败胜利保存音量":
        assert(font.has_char(character.unicode_at(0)))
    assert(FileAccess.file_exists("res://runtime/noobi/fonts/OFL.txt"))
    print("EXPORTED_CJK_FONT_OK")
    quit()
`);
const environment=new GodotEnvironmentService({storageFile:join(out,'godot.json')});const status=await environment.init();const store=new GodotBuildStore(join(out,'builds'));
const build=await buildGodotCandidate({projectId:project.id,projectRoot:project.root,environment,store});const report=JSON.parse(await readFile(join(build.root,'..','progression-check.json'),'utf8'));assert.ok(report.ok && report.complete);
const result=await promisify(execFile)(status.tool.binaryPath,['--headless','--path',build.root,'--main-pack',join(build.root,'build/web/index.pck'),'--script','res://verify_pack.gd'],{timeout:30000,maxBuffer:1024*1024});assert.ok(result.stdout.includes('EXPORTED_CJK_FONT_OK'),result.stderr);assert.ok(!result.stderr.includes('ERROR'),result.stderr);
await writeFile(join(out,'results.json'),JSON.stringify({build:build.record,report,output:result.stdout,passed:true},null,2));console.log('FONT_EXPORT_OK',out,build.record.buildId);app.exit(0);
}catch(error){console.error(error);app.exit(1)}}).catch(e=>{console.error(e);app.exit(1)});

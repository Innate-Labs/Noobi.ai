import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { safeRoot, scanVersionFiles, copyVersionFiles, readVersionFile, digest } from './versionFiles.js';
import { assertExportSafe } from './gameWebExport.js';

const execute = promisify(execFile);
export interface MacExportInput {
  root: string; destinationParent: string; versionId: string; projectId: string;
  title: string; status: string; binding: Record<string, string>;
  enginePath: string; expectedEngineVersion?: string; verify(): Promise<void>;
}
export function macExportProjectConfiguration(original: string): string {
  let project = original.replace(/^textures\/vram_compression\/import_etc2_astc=.*\r?\n?/mu, '');
  if (!/^\[rendering\]\r?$/mu.test(project)) project += '\n[rendering]\n';
  return project.replace(/^\[rendering\]\r?$/mu, '[rendering]\ntextures/vram_compression/import_etc2_astc=true');
}
export function macExportPreset(projectId: string): string {
  return `[preset.0]
name="macOS"
platform="macOS"
runnable=true
export_filter="all_resources"
include_filter="data/*.json,runtime/noobi/fonts/*.json,runtime/noobi/fonts/*.txt,runtime/noobi/fonts/LICENSES/*/*.txt"
exclude_filter="build/*,dist/*,artifacts/*"
export_path=""
script_export_mode=2
[preset.0.options]
application/bundle_identifier="local.noobi.game.${digest(projectId).slice(0,24)}"
application/short_version="0.1.0"
application/version="0.1.0"
application/category="games"
application/export_angle=0
codesign/codesign=1
notarization/notarization=0
`;
}
const LICENSE_SCRIPT = `extends SceneTree
func _initialize() -> void:
    var destination = OS.get_cmdline_user_args()[0]
    var file = FileAccess.open(destination.path_join("GODOT-LICENSE.txt"), FileAccess.WRITE)
    file.store_string(Engine.get_license_text())
    file.close()
    file = FileAccess.open(destination.path_join("GODOT-THIRD-PARTY.json"), FileAccess.WRITE)
    file.store_string(JSON.stringify({"copyright": Engine.get_copyright_info(), "licenses": Engine.get_license_info()}, "  "))
    file.close()
    quit()
`;

/** Export a separate native candidate from immutable inputs; never run the resulting game. */
export async function exportGameMac(input: MacExportInput): Promise<{ path: string; manifestHash: string; files: number }> {
  if (process.platform !== 'darwin') throw Error('macOS 导出目前只支持在 Mac 上执行');
  if (!/^[a-zA-Z0-9_-]{1,128}$/u.test(input.versionId)) throw Error('版本 ID 无效');
  await input.verify();
  const root = await safeRoot(input.root), parent = await safeRoot(input.destinationParent);
  const work = await mkdtemp(join(tmpdir(), 'noobi-mac-export-'));
  const source = join(work, 'source'), staging = join(parent, `.noobi-mac-${randomUUID()}`);
  const destination = join(parent, `Noobi-macOS-${input.versionId.slice(0,12)}-${randomUUID().slice(0,8)}`);
  const run = async (file: string, args: string[], phase: string) => {
    try {
      const result = await execute(file, args, { cwd: work, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
      if (/SCRIPT ERROR|Parse Error|ERROR:/u.test(result.stdout + '\n' + result.stderr)) throw Error((result.stderr || result.stdout).slice(-3000));
      return result;
    } catch (error) { throw Error(`${phase}失败：${String((error as Error).message).slice(-3500)}`); }
  };
  try {
    await mkdir(staging, { mode: 0o700 });
    const engine = (await run(input.enginePath, ['--version'], '检查引擎')).stdout.trim();
    if (input.expectedEngineVersion && engine !== input.expectedEngineVersion) throw Error('当前 Godot 与该构建引擎不同，请先选择匹配版本');
    const originals = await scanVersionFiles(root);
    await copyVersionFiles(root, source, originals.filter(f => !/^(?:build|dist|artifacts)\//u.test(f.path)));
    const projectFile = join(source, 'project.godot');
    await writeFile(projectFile, macExportProjectConfiguration(await readFile(projectFile, 'utf8')));
    await writeFile(join(source, 'export_presets.cfg'), macExportPreset(input.projectId));
    await run(input.enginePath, ['--headless', '--path', source, '--editor', '--quit'], '导入 macOS 资源');
    const app = join(staging, 'Game.app');
    await run(input.enginePath, ['--headless', '--path', source, '--export-release', 'macOS', app], '导出 macOS 游戏');
    const plist = JSON.parse((await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], '检查应用信息')).stdout) as { CFBundleExecutable?: string };
    if (!plist.CFBundleExecutable || !/^[^/\\\0]{1,200}$/u.test(plist.CFBundleExecutable)) throw Error('原生运行程序路径无效');
    const packPath = `Contents/Resources/${plist.CFBundleExecutable}.pck`;
    assertExportSafe('native.pck', await readVersionFile(await safeRoot(app), packPath));
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], '校验本地签名');
    await writeFile(join(work, 'licenses.gd'), LICENSE_SCRIPT);
    await run(input.enginePath, ['--headless', '--script', join(work, 'licenses.gd'), '--', staging], '保存引擎许可');
    for (const f of originals) {
      if (!(/^(?:LICENSE[^/]*|CREDITS[^/]*)\.(?:txt|md)$/iu.test(f.path) || /^runtime\/noobi\/fonts\/(?:OFL\.txt|LICENSES\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.txt)$/u.test(f.path))) continue;
      const bytes = await readVersionFile(root, f.path);
      if (digest(bytes) !== f.sha256) throw Error('导出期间许可文件变化');
      assertExportSafe(f.path.replace(/\.md$/u, '.txt'), bytes);
      const target = join(staging, 'licenses', f.path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: 'wx' });
    }
    await input.verify();
    const files = await scanVersionFiles(staging);
    const manifest = { schemaVersion: 1, target: 'macOS', entrypoint: 'Game.app', versionId: input.versionId,
      title: input.title, status: input.status, sourceBinding: input.binding, engineVersion: engine,
      exportProjectHash: digest(await readFile(projectFile)), exportPresetHash: digest(await readFile(join(source, 'export_presets.cfg'))), files,
      validation: { sourceUnchanged: true, adHocSignatureVerified: true, commonPackSecretScan: true,
        encodedSecretAudit: 'not-assessed', nativeGameplay: 'not-assessed', cleanDevice: 'not-assessed', notarized: false },
      createdAt: new Date().toISOString() };
    const json = JSON.stringify(manifest, null, 2) + '\n';
    await writeFile(join(staging, 'manifest.json'), json, { flag: 'wx' });
    await writeFile(join(staging, 'README.txt'), `Noobi macOS 游戏包\n\n作品：${input.title}\n来源版本：${input.versionId}\n来源检查状态：${input.status}\n\n双击 Game.app 启动；玩家无需 Noobi、Godot 编辑器或模型账户。此包由冻结源码单独导出，原生文件 hash 见 manifest.json。Web 试玩结论不自动适用于原生版本；仍需实际验证控制、音频与保存继续。\n\n使用本地 ad-hoc 签名，未进行 Apple 公证。其他电脑的 Gatekeeper 行为与干净环境尚未验收；没有更改系统安全设置。\n\n原生存档通常位于 ~/Library/Application Support/Godot/app_userdata/ 下，确切位置由作品配置决定。Web 与原生存档不自动迁移；更新前保留旧包并备份存档。导出不会覆盖现有游戏包、启动游戏或公开发布。引擎和已发现的许可说明随包提供；素材完整授权仍以作品的验收材料为准。\n`, { flag: 'wx' });
    await rename(staging, destination);
    return { path: destination, manifestHash: digest(json), files: files.length };
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
}

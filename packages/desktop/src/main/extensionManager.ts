import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import type {
  ProjectRecord,
  SkillLevel,
  SkillSourceInfo,
  SkillSummary,
} from '../shared/types.js';

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_IMPORT_FILES = 2_000;
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const SOURCE_METADATA_FILE = '.noobi-source.json';
const MAX_SOURCE_METADATA_BYTES = 16 * 1024;

export class ExtensionManager {
  async listSkills(project?: ProjectRecord): Promise<SkillSummary[]> {
    const result = [
      ...(project
        ? await this.listAtLevel(
            'project',
            this.skillsDirectory('project', project),
          )
        : []),
      ...(await this.listAtLevel('user', this.skillsDirectory('user'))),
    ];
    return result.sort((left, right) => {
      if (left.level !== right.level) return left.level === 'project' ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }

  skillsDirectory(level: SkillLevel, project?: ProjectRecord): string {
    if (level === 'project') {
      if (!project) throw new Error('请选择项目后再管理项目级 Skill。');
      return path.join(project.path, '.qwen', 'skills');
    }
    return path.join(homedir(), '.qwen', 'skills');
  }

  async ensureSkillsDirectory(
    level: SkillLevel,
    project?: ProjectRecord,
  ): Promise<string> {
    const directory = this.skillsDirectory(level, project);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('Skills 目录无效或为符号链接。');
    }
    return realpath(directory);
  }

  async importSkill(
    sourceDirectory: string,
    level: SkillLevel,
    project?: ProjectRecord,
    sourceMetadata?: SkillSourceInfo,
  ): Promise<SkillSummary> {
    const sourceInfo = await lstat(sourceDirectory);
    if (sourceInfo.isSymbolicLink() || !sourceInfo.isDirectory()) {
      throw new Error('请选择一个真实的 Skill 目录。');
    }
    const source = await realpath(sourceDirectory);
    const manifestPath = path.join(source, 'SKILL.md');
    const manifest = await this.readManifest(manifestPath);
    if (!manifest.valid) throw new Error(manifest.error ?? 'SKILL.md 无效。');

    const targetRoot = await this.ensureSkillsDirectory(level, project);
    const folderName = safeFolderName(path.basename(source), manifest.name);
    const destination = path.join(targetRoot, folderName);
    const temporary = path.join(targetRoot, `.noobi-import-${randomUUID()}`);
    assertContained(targetRoot, destination, false);
    try {
      await access(destination);
      throw new Error(`Skill “${manifest.name}” 已存在。`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('已存在'))
        throw error;
    }

    await mkdir(temporary, { mode: 0o700 });
    try {
      await copyDirectory(source, temporary);
      if (sourceMetadata) {
        await writeFile(
          path.join(temporary, SOURCE_METADATA_FILE),
          `${JSON.stringify(sourceMetadata, null, 2)}\n`,
          { encoding: 'utf8', mode: 0o600 },
        );
      }
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }

    return {
      id: skillId(level, folderName),
      name: manifest.name,
      description: manifest.description,
      level,
      directory: destination,
      valid: true,
      source: sourceMetadata,
    };
  }

  async resolveSkillDirectory(
    skillIdValue: string,
    project?: ProjectRecord,
  ): Promise<string> {
    const [levelValue, encodedFolder, extra] = skillIdValue.split(':');
    if (
      extra !== undefined ||
      (levelValue !== 'project' && levelValue !== 'user')
    ) {
      throw new Error('Skill 标识无效。');
    }
    const folderName = decodeURIComponent(encodedFolder ?? '');
    if (!folderName || path.basename(folderName) !== folderName) {
      throw new Error('Skill 标识无效。');
    }
    const root = await this.ensureSkillsDirectory(levelValue, project);
    const candidate = path.join(root, folderName);
    assertContained(root, candidate, false);
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('Skill 目录无效。');
    }
    const resolved = await realpath(candidate);
    assertContained(root, resolved, false);
    return resolved;
  }

  private async listAtLevel(
    level: SkillLevel,
    directory: string,
  ): Promise<SkillSummary[]> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }

    const skills: SkillSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const skillDirectory = path.join(directory, entry.name);
      const manifest = await this.readManifest(
        path.join(skillDirectory, 'SKILL.md'),
      );
      const source = await this.readSourceMetadata(skillDirectory);
      skills.push({
        id: skillId(level, entry.name),
        name: manifest.name || entry.name,
        description: manifest.description || '无法读取 Skill 描述',
        level,
        directory: skillDirectory,
        valid: manifest.valid,
        error: manifest.error,
        source,
      });
    }
    return skills;
  }

  private async readManifest(filePath: string): Promise<{
    name: string;
    description: string;
    valid: boolean;
    error?: string;
  }> {
    try {
      const info = await lstat(filePath);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new Error('SKILL.md 不是普通文件。');
      }
      if (info.size > MAX_MANIFEST_BYTES) throw new Error('SKILL.md 过大。');
      const content = await readFile(filePath, 'utf8');
      // Match the Runtime parser exactly so the desktop never marks a Skill as
      // usable when the SkillTool would reject it later.
      const match = content.match(/^---\n([\s\S]*?)\n---\n/);
      if (!match) throw new Error('SKILL.md 缺少 YAML frontmatter。');
      const name = scalar(match[1] ?? '', 'name');
      const description = scalar(match[1] ?? '', 'description');
      if (!name || !description) {
        throw new Error('SKILL.md 必须包含 name 和 description。');
      }
      return { name, description, valid: true };
    } catch (error) {
      return {
        name: '',
        description: '',
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readSourceMetadata(
    skillDirectory: string,
  ): Promise<SkillSourceInfo | undefined> {
    try {
      const filePath = path.join(skillDirectory, SOURCE_METADATA_FILE);
      const info = await lstat(filePath);
      if (
        info.isSymbolicLink() ||
        !info.isFile() ||
        info.size > MAX_SOURCE_METADATA_BYTES
      ) {
        return undefined;
      }
      const value = JSON.parse(await readFile(filePath, 'utf8')) as Record<
        string,
        unknown
      >;
      if (
        value.kind !== 'github' ||
        typeof value.repository !== 'string' ||
        typeof value.ref !== 'string' ||
        typeof value.path !== 'string' ||
        typeof value.url !== 'string'
      ) {
        return undefined;
      }
      const parsed = new URL(value.url);
      if (
        parsed.protocol !== 'https:' ||
        (parsed.hostname !== 'github.com' &&
          parsed.hostname !== 'www.github.com')
      ) {
        return undefined;
      }
      return {
        kind: 'github',
        repository: value.repository.slice(0, 300),
        ref: value.ref.slice(0, 300),
        path: value.path.slice(0, 2_000),
        url: parsed.href,
      };
    } catch {
      return undefined;
    }
  }
}

function scalar(frontmatter: string, key: string): string {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  const raw = (match[1] ?? '').trim();
  if (/^[>|][-+]?$/.test(raw)) {
    const start = (match.index ?? 0) + match[0].length;
    const lines: string[] = [];
    for (const line of frontmatter.slice(start).split('\n').slice(1)) {
      if (line.trim() && !/^\s/.test(line)) break;
      lines.push(line);
    }
    const nonEmpty = lines.filter((line) => line.trim());
    const indent = nonEmpty.length
      ? Math.min(
          ...nonEmpty.map((line) => line.length - line.trimStart().length),
        )
      : 0;
    const values = lines.map((line) =>
      line.trim() ? line.slice(Math.min(indent, line.length)).trimEnd() : '',
    );
    if (raw.startsWith('|')) return values.join('\n').trim();
    let folded = '';
    for (const value of values) {
      if (!value) folded = `${folded.trimEnd()}\n`;
      else folded += folded && !folded.endsWith('\n') ? ` ${value}` : value;
    }
    return folded.trim();
  }
  return raw
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, '$2')
    .trim();
}

function safeFolderName(sourceName: string, manifestName: string): string {
  const value = (sourceName || manifestName)
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  if (!value || value === '.' || value === '..') {
    throw new Error('Skill 名称无法生成安全目录名。');
  }
  return value;
}

function skillId(level: SkillLevel, folderName: string): string {
  return `${level}:${encodeURIComponent(folderName)}`;
}

function assertContained(root: string, target: string, allowRoot = true): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (
    (!allowRoot && relative === '') ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('路径超出 Skills 目录。');
  }
}

async function copyDirectory(
  source: string,
  destination: string,
): Promise<void> {
  let fileCount = 0;
  let totalBytes = 0;

  const walk = async (from: string, to: string): Promise<void> => {
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === SOURCE_METADATA_FILE) {
        continue;
      }
      const sourcePath = path.join(from, entry.name);
      const destinationPath = path.join(to, entry.name);
      const info = await lstat(sourcePath);
      if (info.isSymbolicLink()) {
        throw new Error(`Skill 包含不允许的符号链接：${entry.name}`);
      }
      if (info.isDirectory()) {
        await mkdir(destinationPath, { mode: 0o700 });
        await walk(sourcePath, destinationPath);
        continue;
      }
      if (!info.isFile()) continue;
      fileCount += 1;
      totalBytes += info.size;
      if (fileCount > MAX_IMPORT_FILES || totalBytes > MAX_IMPORT_BYTES) {
        throw new Error('Skill 包超过导入限制（2000 个文件 / 64 MB）。');
      }
      await writeFile(destinationPath, await readFile(sourcePath), {
        mode: info.mode & 0o777,
      });
    }
  };

  await walk(source, destination);
}

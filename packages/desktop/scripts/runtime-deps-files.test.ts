import { createRequire } from 'node:module';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  copyRuntimePackageTree,
  inspectRuntimeTree,
  isPathInside,
} from './runtime-deps-files.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe('Runtime dependency filesystem contract', () => {
  it('copies real package files, filters nested node_modules and reports bytes', async () => {
    const fixtureRoot = await createFixtureRoot();
    const source = path.join(fixtureRoot, 'source', 'tiktoken');
    const destination = path.join(fixtureRoot, 'staging', 'tiktoken');
    await mkdir(path.join(source, 'encoders'), { recursive: true });
    await mkdir(path.join(source, 'node_modules', 'leaked-package'), {
      recursive: true,
    });
    await mkdir(path.join(source, 'prebuilds', 'other-platform'), {
      recursive: true,
    });
    await writeFile(
      path.join(source, 'package.json'),
      '{"name":"tiktoken","version":"1.0.0"}\n',
    );
    await writeFile(
      path.join(source, 'index.js'),
      'export const ready = true;\n',
    );
    await writeFile(path.join(source, 'encoders', 'data.bin'), '123456');
    await writeFile(
      path.join(source, 'node_modules', 'leaked-package', 'index.js'),
      'must not be copied',
    );
    await writeFile(
      path.join(source, 'prebuilds', 'other-platform', 'native.node'),
      'must not be copied',
    );

    const copied = await copyRuntimePackageTree(source, destination, {
      filter: (segments: string[]) => !segments.includes('other-platform'),
    });
    const inspected = await inspectRuntimeTree(destination);

    expect(copied).toEqual(inspected);
    expect(copied.fileCount).toBe(3);
    expect(copied.sizeBytes).toBeGreaterThan(0);
    await expect(
      readFile(path.join(destination, 'package.json'), 'utf8'),
    ).resolves.toContain('tiktoken');
    await expect(
      readFile(
        path.join(destination, 'node_modules', 'leaked-package', 'index.js'),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(
        path.join(destination, 'prebuilds', 'other-platform', 'native.node'),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('resolves a package through the smoke node_modules link into staging', async () => {
    const fixtureRoot = await createFixtureRoot();
    const stagingNodeModules = path.join(
      fixtureRoot,
      'staging',
      'node_modules',
    );
    const packageDirectory = path.join(
      stagingNodeModules,
      'fixture-runtime-package',
    );
    const temporaryRuntime = path.join(fixtureRoot, 'isolated-runtime');
    await mkdir(packageDirectory, { recursive: true });
    await mkdir(temporaryRuntime, { recursive: true });
    await writeFile(
      path.join(packageDirectory, 'package.json'),
      '{"name":"fixture-runtime-package","version":"1.0.0","main":"index.js"}\n',
    );
    await writeFile(
      path.join(packageDirectory, 'index.js'),
      'module.exports = 1;\n',
    );
    await symlink(
      stagingNodeModules,
      path.join(temporaryRuntime, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const probePath = path.join(temporaryRuntime, 'probe.mjs');
    await writeFile(probePath, '', 'utf8');
    const resolvedEntry = await realpath(
      createRequire(probePath).resolve('fixture-runtime-package'),
    );
    const realStaging = await realpath(stagingNodeModules);

    expect(isPathInside(realStaging, resolvedEntry)).toBe(true);
    expect(await readFile(resolvedEntry, 'utf8')).toContain('module.exports');
  });

  it('uses Windows path semantics when checking staging containment', () => {
    expect(
      isPathInside(
        String.raw`D:\a\Noobi.ai\.runtime-deps\node_modules`,
        String.raw`D:\a\Noobi.ai\.runtime-deps\node_modules\tiktoken\tiktoken.cjs`,
        path.win32,
      ),
    ).toBe(true);
    expect(
      isPathInside(
        String.raw`D:\a\Noobi.ai\.runtime-deps\node_modules`,
        String.raw`D:\a\Noobi.ai\node_modules\tiktoken\tiktoken.cjs`,
        path.win32,
      ),
    ).toBe(false);
  });
});

async function createFixtureRoot() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'noobi-runtime-files-test-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

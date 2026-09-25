import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportGameMac, macExportProjectConfiguration } from './gameMacExport.js';

describe('native export input and cleanup', () => {
  it('adds native texture import without changing gameplay or unrelated settings', () => {
    const original = '[application]\nconfig/name="Adventure"\n[rendering]\ntextures/vram_compression/import_etc2_astc=false\nrenderer/rendering_method="gl_compatibility"\n';
    const native = macExportProjectConfiguration(original);
    expect(native).toContain('config/name="Adventure"');
    expect(native).toContain('renderer/rendering_method="gl_compatibility"');
    expect(native.match(/import_etc2_astc=/gu)).toHaveLength(1);
    expect(native).toContain('import_etc2_astc=true');
    expect(macExportProjectConfiguration(native)).toBe(native);
  });
  it.skipIf(process.platform !== 'darwin')('does not publish partial output or disturb existing exports when the engine mismatches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noobi-native-test-'));
    try {
      const source = join(root, 'source'), destination = join(root, 'exports');
      await mkdir(source); await mkdir(destination);
      await writeFile(join(destination, 'existing.txt'), 'keep');
      let verified = false;
      await expect(exportGameMac({ root: source, destinationParent: destination, versionId: 'version-1', projectId: 'project-1',
        title: 'Fixture', status: 'backup', binding: {}, enginePath: process.execPath, expectedEngineVersion: '4.7.1',
        verify: async () => { verified = true; } })).rejects.toThrow('引擎不同');
      expect(verified).toBe(true);
      expect(await readdir(destination)).toEqual(['existing.txt']);
      expect(await readFile(join(destination, 'existing.txt'), 'utf8')).toBe('keep');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Windows desktop runtime contract', () => {
  it('keeps native non-macOS title bars and a stable Windows app identity', async () => {
    const source = await readFile('src/main/main.ts', 'utf8');

    expect(source).toContain("const applicationId = 'com.gameagent.desktop'");
    expect(source).toContain('app.setAppUserModelId(applicationId)');
    expect(source).not.toContain(
      "process.platform === 'darwin' ? 'hiddenInset' : 'hidden'",
    );
  });

  it('provides a packaged renderer and secure-storage smoke signal', async () => {
    const source = await readFile('src/main/main.ts', 'utf8');

    expect(source).toContain("process.argv.includes('--noobi-smoke-test')");
    expect(source).toContain('safeStorage.isEncryptionAvailable()');
    expect(source).toContain('NOOBI_PACKAGED_SMOKE_READY');
  });
});

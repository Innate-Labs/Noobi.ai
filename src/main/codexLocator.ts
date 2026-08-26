import { access, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const TARGETS: Record<string, { packageName: string; triple: string; executable: string }> = {
  'darwin-arm64': {
    packageName: '@openai/codex-darwin-arm64',
    triple: 'aarch64-apple-darwin',
    executable: 'codex',
  },
  'darwin-x64': {
    packageName: '@openai/codex-darwin-x64',
    triple: 'x86_64-apple-darwin',
    executable: 'codex',
  },
  'linux-arm64': {
    packageName: '@openai/codex-linux-arm64',
    triple: 'aarch64-unknown-linux-musl',
    executable: 'codex',
  },
  'linux-x64': {
    packageName: '@openai/codex-linux-x64',
    triple: 'x86_64-unknown-linux-musl',
    executable: 'codex',
  },
  'win32-arm64': {
    packageName: '@openai/codex-win32-arm64',
    triple: 'aarch64-pc-windows-msvc',
    executable: 'codex.exe',
  },
  'win32-x64': {
    packageName: '@openai/codex-win32-x64',
    triple: 'x86_64-pc-windows-msvc',
    executable: 'codex.exe',
  },
};

export async function locateCodexBinary(): Promise<string> {
  const candidates: string[] = [];
  if (process.env.NOOBI_CODEX_BIN) candidates.push(process.env.NOOBI_CODEX_BIN);

  const target = TARGETS[`${process.platform}-${process.arch}`];
  if (target) {
    try {
      const packageJson = require.resolve(`${target.packageName}/package.json`);
      candidates.push(
        join(dirname(packageJson), 'vendor', target.triple, 'bin', target.executable),
      );
    } catch {
      // The platform package is optional; continue to installed Codex candidates.
    }
  }

  if (process.platform === 'darwin') {
    candidates.push('/Applications/ChatGPT.app/Contents/Resources/codex');
    candidates.push('/Applications/Codex.app/Contents/Resources/codex');
  }

  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], {
    encoding: 'utf8',
    timeout: 3_000,
  });
  if (which.status === 0 && which.stdout.trim()) {
    candidates.push(which.stdout.trim().split(/\r?\n/u)[0]!);
  }

  const failures: string[] = [];
  for (const lexical of deduplicate(candidates)) {
    const candidate = unpackedAsarPath(lexical);
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch (error) {
      failures.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `Unable to locate a runnable Codex binary. Set NOOBI_CODEX_BIN. Checked ${failures.length} candidate(s).`,
  );
}

export function readCodexVersion(binaryPath: string): string | null {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

function unpackedAsarPath(value: string): string {
  return value.replace(/([/\\])app\.asar([/\\])/u, '$1app.asar.unpacked$2');
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}


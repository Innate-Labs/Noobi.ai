import { chmod, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export interface SmokeHome {
  path: string;
  cleanup(): Promise<void>;
}

/**
 * Uses an isolated config/state directory so write-capable smoke threads never
 * add trusted temporary workspaces to the user's real ~/.codex/config.toml.
 * Only the existing auth envelope is copied into the mode-0700 temp directory
 * and the entire directory is deleted in the test's finally block.
 */
export async function prepareSmokeHome(): Promise<SmokeHome> {
  const explicit = process.env.NOOBI_SMOKE_CODEX_HOME?.trim();
  if (explicit) {
    if (!isAbsolute(explicit)) throw new Error('NOOBI_SMOKE_CODEX_HOME must be absolute');
    await mkdir(explicit, { recursive: true, mode: 0o700 });
    return { path: resolve(explicit), cleanup: async () => undefined };
  }

  const directory = await mkdtemp(join(tmpdir(), 'noobi-codex-home-smoke-'));
  await chmod(directory, 0o700);
  const sourceHome = resolve(process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'));
  try {
    await copyFile(join(sourceHome, 'auth.json'), join(directory, 'auth.json'));
    await chmod(join(directory, 'auth.json'), 0o600);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(
      `Unable to prepare isolated Codex smoke authentication from ${sourceHome}. Sign in with Codex first or set NOOBI_SMOKE_CODEX_HOME.`,
      { cause: error },
    );
  }
  return {
    path: directory,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

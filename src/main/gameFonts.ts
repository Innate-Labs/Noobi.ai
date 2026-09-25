import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/** The whole font and its licenses travel with new projects; never copy system fonts. */
export async function bundledGameFonts(): Promise<Record<string, Buffer>> {
  const directory = fileURLToPath(new URL('../../resources/game-fonts/', import.meta.url));
  const manifestBytes = await readFile(join(directory, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString()) as { files: Record<string, string> };
  const files: Record<string, Buffer> = { 'runtime/noobi/fonts/manifest.json': manifestBytes };
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/u.test(path) || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid bundled font path');
    const bytes = await readFile(join(directory, path));
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Bundled font checksum mismatch: ${path}`);
    files[`runtime/noobi/fonts/${path}`] = bytes;
  }
  return files;
}

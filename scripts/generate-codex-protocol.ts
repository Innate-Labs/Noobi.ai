import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { locateCodexBinary, readCodexVersion } from '../src/main/codexLocator.js';

const binary = await locateCodexBinary();
const tsOut = resolve('src/generated/codex');
const schemaOut = resolve('schemas/codex');

await Promise.all([
  rm(tsOut, { recursive: true, force: true }),
  rm(schemaOut, { recursive: true, force: true }),
]);
await Promise.all([mkdir(tsOut, { recursive: true }), mkdir(schemaOut, { recursive: true })]);

run(['app-server', 'generate-ts', '--experimental', '--out', tsOut]);
run(['app-server', 'generate-json-schema', '--experimental', '--out', schemaOut]);

process.stdout.write(
  `Generated Codex App Server protocol from ${readCodexVersion(binary) ?? binary}.\n`,
);

function run(args: string[]): void {
  const result = spawnSync(binary, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Codex protocol generation failed: ${args.join(' ')}`);
  }
}

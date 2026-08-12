import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RUNTIME_SMOKE_TIMEOUT_MS,
  MODULE_PROBE_TIMEOUT_MS,
  REQUIRED_RUNTIME_PACKAGES,
  formatRuntimeSmokeFailure,
} from './runtime-smoke-contract.mjs';

const smokeSource = readFileSync(
  new URL('./smoke-runtime.mjs', import.meta.url),
  'utf8',
);

describe('Runtime smoke observability contract', () => {
  it('bounds only the heavyweight module probe at 120 seconds', () => {
    expect(DEFAULT_RUNTIME_SMOKE_TIMEOUT_MS).toBe(30_000);
    expect(MODULE_PROBE_TIMEOUT_MS).toBe(120_000);
    expect(MODULE_PROBE_TIMEOUT_MS).toBeGreaterThan(
      DEFAULT_RUNTIME_SMOKE_TIMEOUT_MS,
    );
  });

  it('keeps every required runtime package in the actual probe', () => {
    expect(REQUIRED_RUNTIME_PACKAGES).toEqual([
      'tiktoken',
      'sharp',
      'onnxruntime-node',
      '@imgly/background-removal-node',
      '@lydell/node-pty',
      'node-pty',
    ]);
    for (const packageName of REQUIRED_RUNTIME_PACKAGES) {
      expect(smokeSource).toContain(`await import('${packageName}')`);
      expect(smokeSource).toContain(`importing:${packageName}`);
    }
    expect(smokeSource).not.toMatch(/from ['"]tiktoken['"]/);
    expect(smokeSource).toContain('tokenCount < 1');
    expect(smokeSource).toContain("'[runtime-probe] complete\\\\n'");
    expect(smokeSource).toContain('process.exit(0)');
  });

  it('applies the extended bound only to the module probe and kills Windows trees', () => {
    expect(smokeSource).toContain('timeoutMs: MODULE_PROBE_TIMEOUT_MS');
    expect(smokeSource).toContain(
      'timeoutMs = DEFAULT_RUNTIME_SMOKE_TIMEOUT_MS',
    );
    expect(
      smokeSource.match(/timeoutMs: MODULE_PROBE_TIMEOUT_MS/g),
    ).toHaveLength(1);
    expect(smokeSource).toContain("spawn(\n        'taskkill.exe'");
    expect(smokeSource).toContain("['/pid', String(child.pid), '/t', '/f']");
  });

  it('includes partial progress streams in timeout diagnostics', () => {
    const message = formatRuntimeSmokeFailure({
      label: '模块探针超时',
      command: 'electron.exe',
      args: ['probe.mjs'],
      timeoutMs: MODULE_PROBE_TIMEOUT_MS,
      stdout: '[runtime-probe] importing:onnxruntime-node\n',
      stderr: 'native loader warning\n',
    });

    expect(message).toContain('120000ms');
    expect(message).toContain('importing:onnxruntime-node');
    expect(message).toContain('native loader warning');
  });
});

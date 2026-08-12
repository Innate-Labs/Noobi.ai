export const DEFAULT_RUNTIME_SMOKE_TIMEOUT_MS = 30_000;
export const MODULE_PROBE_TIMEOUT_MS = 120_000;

export const REQUIRED_RUNTIME_PACKAGES = [
  'tiktoken',
  'sharp',
  'onnxruntime-node',
  '@imgly/background-removal-node',
  '@lydell/node-pty',
  'node-pty',
];

export function formatRuntimeSmokeFailure({
  label,
  command,
  args,
  timeoutMs,
  stdout,
  stderr,
}) {
  return (
    `Runtime smoke test ${label}（${timeoutMs}ms）：${command} ${args.join(' ')}\n` +
    `--- stdout ---\n${stdout || '(empty)'}\n` +
    `--- stderr ---\n${stderr || '(empty)'}`
  );
}

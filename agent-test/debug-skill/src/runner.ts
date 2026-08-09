import { execFile } from 'node:child_process';
import type { RunResult, ParsedError, RunStage } from './types.js';

// =============================================================================
// Runner — executes build / test / dev and returns structured results
// =============================================================================
//
// Corresponds to Algorithm 1 step 5:
//   "Run verification and execution (build, test, run) guided by P"
//
// The runner does NOT interpret errors — it only runs commands and parses
// raw output into structured ParsedError objects. Interpretation is left
// to the Diagnoser.
// =============================================================================

const STAGE_COMMANDS: Record<RunStage, { cmd: string; args: string[] }> = {
  build: { cmd: 'npm', args: ['run', 'build'] },
  test: { cmd: 'npm', args: ['run', 'test'] },
  dev: { cmd: 'npm', args: ['run', 'dev'] },
};

/** Default timeout for build and test stages (ms). */
const DEFAULT_TIMEOUT = 120_000;

/** Timeout for dev server probe — we only check if it starts, not run forever. */
const DEV_TIMEOUT = 15_000;

/**
 * Run a single verification stage in a project directory.
 *
 * @param projectDir - Absolute path to the game project
 * @param stage - Which stage to run
 * @returns Structured result with parsed errors
 */
export async function runStage(
  projectDir: string,
  stage: RunStage,
): Promise<RunResult> {
  const { cmd, args } = STAGE_COMMANDS[stage];
  const timeout = stage === 'dev' ? DEV_TIMEOUT : DEFAULT_TIMEOUT;
  const startTime = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd: projectDir,
        timeout,
        maxBuffer: 1024 * 1024 * 5,
        env: { ...process.env, FORCE_COLOR: '0' },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;

        const combined = `${stdout}\n${stderr}`;
        const errors = parseErrors(combined, stage);

        resolve({
          stage,
          success: exitCode === 0 && errors.length === 0,
          exitCode,
          stdout,
          stderr,
          errors,
          durationMs,
        });
      },
    );

    // For dev stage, kill after timeout (it's a long-running server)
    if (stage === 'dev') {
      setTimeout(() => {
        child.kill('SIGTERM');
      }, timeout);
    }
  });
}

/**
 * Run the standard verification sequence: build → test.
 * Stops at the first failing stage.
 */
export async function runVerification(
  projectDir: string,
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  const buildResult = await runStage(projectDir, 'build');
  results.push(buildResult);
  if (!buildResult.success) return results;

  const testResult = await runStage(projectDir, 'test');
  results.push(testResult);

  return results;
}

// -----------------------------------------------------------------------------
// Error parsers
// -----------------------------------------------------------------------------

/**
 * Parse raw build/test/runtime output into structured errors.
 */
function parseErrors(output: string, stage: RunStage): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const parsed = parseTSError(line) ?? parseRuntimeError(line, stage);
    if (parsed) errors.push(parsed);
  }

  return deduplicateErrors(errors);
}

/** Parse TypeScript compiler error: "src/foo.ts(10,5): error TS2339: ..." */
function parseTSError(line: string): ParsedError | null {
  const match = line.match(
    /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/,
  );
  if (!match) {
    // Alternative format: "src/foo.ts:10:5 - error TS2339: ..."
    const alt = line.match(
      /^(.+?):(\d+):(\d+)\s*-\s*error\s+(TS\d+):\s*(.+)$/,
    );
    if (!alt) return null;
    return {
      code: alt[4]!,
      message: alt[5]!.trim(),
      file: alt[1]!,
      line: parseInt(alt[2]!, 10),
      column: parseInt(alt[3]!, 10),
    };
  }
  return {
    code: match[4]!,
    message: match[5]!.trim(),
    file: match[1]!,
    line: parseInt(match[2]!, 10),
    column: parseInt(match[3]!, 10),
  };
}

/** Parse common runtime errors from test/dev output. */
function parseRuntimeError(line: string, stage: RunStage): ParsedError | null {
  if (stage === 'build') return null;

  // ReferenceError, TypeError, RangeError, etc.
  const runtimeMatch = line.match(
    /^\s*(ReferenceError|TypeError|RangeError|SyntaxError|Error):\s*(.+)$/,
  );
  if (runtimeMatch) {
    return {
      code: runtimeMatch[1]!,
      message: runtimeMatch[2]!.trim(),
    };
  }

  // Phaser-specific errors
  const phaserMatch = line.match(
    /Texture\s+'(.+)'\s+not found/i,
  );
  if (phaserMatch) {
    return {
      code: 'TextureNotFound',
      message: `Texture '${phaserMatch[1]}' not found`,
    };
  }

  const animMatch = line.match(
    /Animation\s+'(.+)'\s+(doesn't exist|not found)/i,
  );
  if (animMatch) {
    return {
      code: 'AnimationNotFound',
      message: `Animation '${animMatch[1]}' not found`,
    };
  }

  const sceneMatch = line.match(
    /Scene\s+'(.+)'\s+not found/i,
  );
  if (sceneMatch) {
    return {
      code: 'SceneNotFound',
      message: `Scene '${sceneMatch[1]}' not found`,
    };
  }

  return null;
}

/** Remove duplicate errors with the same code + file + line. */
function deduplicateErrors(errors: ParsedError[]): ParsedError[] {
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.code}:${e.file ?? ''}:${e.line ?? ''}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import type {
  DebugProtocol,
  DebugTrace,
  DebugIteration,
  ValidationResult,
  RunResult,
} from './types.js';
import { loadOrInitProtocol, bumpAndSave } from './protocol-manager.js';
import { validateProject } from './validator.js';
import { runStage } from './runner.js';
import { diagnoseErrors } from './diagnoser.js';
import { applyRepair } from './repairer.js';
import { recordOutcome } from './recorder.js';
import { evolveInline } from './evolve.js';
import { MAX_DEBUG_ITERATIONS } from './config.js';

// =============================================================================
// Debug Loop — implements Algorithm 1's REPEAT...UNTIL cycle
// =============================================================================
//
// Algorithm 1 (paper):
//   REPEAT
//     Run verification and execution (build, test, run) guided by P
//     IF failure observed
//       Diagnose the failure using P and repair y
//       Append a verified (signature, cause, fix) entry to P if new
//   UNTIL y is buildable and runnable
//
// This module orchestrates the full loop:
//   1. Pre-execution validation (proactive entries in P)
//   2. Build → parse errors
//   3. For each error: diagnose → repair → verify → record
//   4. Repeat until clean or max iterations reached
//   5. Evolve P with accumulated experience
// =============================================================================

export interface DebugLoopOptions {
  /** Absolute path to the game project */
  projectDir: string;

  /** Maximum iterations (defaults to MAX_DEBUG_ITERATIONS) */
  maxIterations?: number;

  /** Whether to run the dev stage after build + test pass */
  runDev?: boolean;

  /** Whether to evolve the protocol after the session */
  evolveAfter?: boolean;
}

export interface DebugLoopResult {
  success: boolean;
  trace: DebugTrace;
  protocol: DebugProtocol;
}

/**
 * Run the complete debug loop on a project.
 *
 * This is the main entry point that implements Algorithm 1.
 */
export async function debugLoop(
  options: DebugLoopOptions,
): Promise<DebugLoopResult> {
  const {
    projectDir,
    maxIterations = MAX_DEBUG_ITERATIONS,
    runDev = false,
    evolveAfter = true,
  } = options;

  const startedAt = new Date().toISOString();
  let protocol = await loadOrInitProtocol();

  const trace: DebugTrace = {
    projectPath: projectDir,
    startedAt,
    completedAt: '',
    success: false,
    totalIterations: 0,
    maxIterations,
    validationResults: [],
    iterations: [],
    newEntries: [],
    matchedEntries: [],
    totalDurationMs: 0,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Debug Loop: ${projectDir}`);
  console.log(`Protocol v${protocol.version} | ${protocol.entries.length} entries | ${protocol.rules.length} rules`);
  console.log(`${'='.repeat(60)}\n`);

  // ── Step 0: Pre-execution validations (proactive checks) ──────────────
  console.log('=== Pre-execution validation ===');
  const validationResults = await validateProject(projectDir, protocol);
  trace.validationResults = validationResults;

  const violations = validationResults.filter((r) => !r.passed);
  if (violations.length > 0) {
    console.log(`  ⚠ ${violations.length} validation(s) flagged:`);
    for (const v of violations) {
      for (const msg of v.violations) {
        console.log(`    - ${msg}`);
      }
    }
  } else {
    console.log('  ✓ All pre-execution validations passed');
  }

  // ── REPEAT...UNTIL loop ───────────────────────────────────────────────
  let iteration = 0;
  let allPassed = false;

  while (iteration < maxIterations && !allPassed) {
    iteration++;
    const iterStart = Date.now();
    console.log(`\n--- Iteration ${iteration}/${maxIterations} ---`);

    // Run build
    const buildResult = await runStage(projectDir, 'build');
    console.log(
      `  Build: ${buildResult.success ? '✓ PASS' : `✗ FAIL (${buildResult.errors.length} error(s))`}`,
    );

    if (!buildResult.success) {
      const iterResult = await handleFailure(
        buildResult,
        protocol,
        projectDir,
        iteration,
        trace,
      );
      protocol = iterResult.protocol;
      trace.iterations.push(iterResult.iteration);
      continue;
    }

    // Run test
    const testResult = await runStage(projectDir, 'test');
    console.log(
      `  Test: ${testResult.success ? '✓ PASS' : `✗ FAIL (${testResult.errors.length} error(s))`}`,
    );

    if (!testResult.success) {
      const iterResult = await handleFailure(
        testResult,
        protocol,
        projectDir,
        iteration,
        trace,
      );
      protocol = iterResult.protocol;
      trace.iterations.push(iterResult.iteration);
      continue;
    }

    // Both passed
    allPassed = true;

    const passIteration: DebugIteration = {
      iteration,
      timestamp: new Date().toISOString(),
      stage: 'test',
      passed: true,
      durationMs: Date.now() - iterStart,
    };
    trace.iterations.push(passIteration);
    console.log('  ✓ Build and test both pass');
  }

  // ── Optional: dev server probe ────────────────────────────────────────
  if (allPassed && runDev) {
    console.log('\n=== Dev server probe ===');
    const devResult = await runStage(projectDir, 'dev');
    console.log(
      `  Dev: ${devResult.success ? '✓ Server started' : '✗ Server failed'}`,
    );
  }

  // ── Finalize trace ────────────────────────────────────────────────────
  trace.totalIterations = iteration;
  trace.success = allPassed;
  trace.completedAt = new Date().toISOString();
  trace.totalDurationMs = Date.now() - new Date(startedAt).getTime();

  // ── Evolve protocol (Algorithm 1 step 11) ─────────────────────────────
  if (evolveAfter) {
    console.log('\n=== Evolving protocol ===');
    const { newRules } = await evolveInline(trace, protocol);
    if (newRules > 0) {
      console.log(`  Generated ${newRules} new rule(s)`);
    }
  } else {
    await bumpAndSave(protocol);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Debug Loop ${allPassed ? 'SUCCEEDED' : 'FAILED'}`);
  console.log(
    `  Iterations: ${iteration}/${maxIterations} | ` +
    `New entries: ${trace.newEntries.length} | ` +
    `Matched: ${trace.matchedEntries.length}`,
  );
  console.log(
    `  Protocol v${protocol.version} | ` +
    `${protocol.entries.length} entries | ${protocol.rules.length} rules`,
  );
  console.log(`  Duration: ${(trace.totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`${'='.repeat(60)}\n`);

  return { success: allPassed, trace, protocol };
}

// -----------------------------------------------------------------------------
// Failure handling: diagnose → repair → record
// -----------------------------------------------------------------------------

interface FailureHandleResult {
  protocol: DebugProtocol;
  iteration: DebugIteration;
}

async function handleFailure(
  runResult: RunResult,
  protocol: DebugProtocol,
  projectDir: string,
  iterationNum: number,
  trace: DebugTrace,
): Promise<FailureHandleResult> {
  const iterStart = Date.now();

  // Diagnose all errors
  const diagnoses = await diagnoseErrors(
    runResult.errors,
    protocol,
    projectDir,
  );

  let repairAction = '';
  let matchedEntryId: string | undefined;
  let newEntryId: string | undefined;

  // Process the first diagnosable error (prioritize matched entries)
  const primaryDiag =
    diagnoses.find((d) => d.matched) ?? diagnoses.find((d) => d.candidateEntry) ?? diagnoses[0];

  if (primaryDiag) {
    const primaryError = runResult.errors[diagnoses.indexOf(primaryDiag)]!;

    // Repair
    console.log(`  Diagnosing: ${primaryError.code} — ${primaryError.message.slice(0, 80)}`);
    if (primaryDiag.matched) {
      console.log(`  → Matched protocol entry: ${primaryDiag.matchedEntryId}`);
    } else {
      console.log('  → Novel error, using LLM diagnosis');
    }

    const repair = await applyRepair(primaryDiag, primaryError, projectDir);
    repairAction = repair.description;
    console.log(`  Repair: ${repair.applied ? '✓ Applied' : '✗ Not applied'} — ${repair.description.slice(0, 80)}`);

    // Verify fix: re-run the same stage
    const verifyResult = await runStage(projectDir, runResult.stage);
    const verified = verifyResult.success ||
      verifyResult.errors.length < runResult.errors.length;

    // Record outcome to P
    const { logEntry } = recordOutcome(
      protocol,
      primaryDiag,
      repair,
      projectDir,
      verified,
    );

    if (primaryDiag.matched && primaryDiag.matchedEntryId) {
      matchedEntryId = primaryDiag.matchedEntryId;
      if (!trace.matchedEntries.includes(matchedEntryId)) {
        trace.matchedEntries.push(matchedEntryId);
      }
    } else if (logEntry.entryId) {
      newEntryId = logEntry.entryId;
      trace.newEntries.push(newEntryId);
    }
  }

  const iteration: DebugIteration = {
    iteration: iterationNum,
    timestamp: new Date().toISOString(),
    stage: runResult.stage === 'dev' ? 'runtime' : runResult.stage,
    passed: false,
    rawError: runResult.errors
      .map((e) => `${e.code}: ${e.message}`)
      .join('\n')
      .slice(0, 2000),
    matchedEntryId,
    newEntryId,
    repairAction,
    durationMs: Date.now() - iterStart,
  };

  return { protocol, iteration };
}

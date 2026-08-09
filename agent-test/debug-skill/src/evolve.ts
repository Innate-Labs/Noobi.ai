import * as fs from 'fs/promises';
import * as path from 'path';
import type { DebugProtocol, DebugTrace, EvolveResult } from './types.js';
import { loadOrInitProtocol, bumpAndSave, saveTrace } from './protocol-manager.js';
import { generalizeProtocol } from './generalizer.js';
import { HISTORY_PATH } from './config.js';

// =============================================================================
// Evolve — offline evolution of the debug protocol through trace analysis
// =============================================================================
//
// Analogous to Template Skill's evolve.ts: processes completed debug sessions
// and generalizes accumulated knowledge.
//
// Pipeline:
//   Debug Traces (from past sessions)
//     -> Load protocol P
//     -> Scan for generalization opportunities
//     -> Generate new ProtocolRules
//     -> Persist updated P
//
// =============================================================================

/**
 * Evolve the protocol from a single project's debug trace.
 *
 * This is typically called automatically at the end of a debug-loop session,
 * but can also be run offline to re-process historical traces.
 */
export async function evolveFromTrace(
  tracePath: string,
): Promise<EvolveResult> {
  const startTime = Date.now();
  let protocol = await loadOrInitProtocol();

  try {
    console.log('\n=== Evolution: Loading trace ===');
    const raw = await fs.readFile(tracePath, 'utf-8');
    const trace = JSON.parse(raw) as DebugTrace;
    console.log(
      `  Project: ${trace.projectPath} | Iterations: ${trace.totalIterations} | ` +
      `New entries: ${trace.newEntries.length} | Matched: ${trace.matchedEntries.length}`,
    );

    // Generalize: check if any patterns now exceed the threshold
    console.log('\n=== Evolution: Generalizing patterns ===');
    const { newRules } = await generalizeProtocol(protocol);
    console.log(`  New rules generated: ${newRules.length}`);
    for (const rule of newRules) {
      console.log(`    - ${rule.name} (from ${rule.derivedFrom.length} entries)`);
    }

    // Persist
    await bumpAndSave(protocol);
    console.log(
      `\n  Protocol saved (v${protocol.version}, ` +
      `${protocol.entries.length} entries, ${protocol.rules.length} rules)`,
    );

    return {
      success: true,
      protocol,
      newEntries: trace.newEntries.length,
      matchedEntries: trace.matchedEntries.length,
      newRules: newRules.length,
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`\n[Evolve] Error: ${error}`);

    return {
      success: false,
      protocol,
      newEntries: 0,
      matchedEntries: 0,
      newRules: 0,
      durationMs: Date.now() - startTime,
      error,
    };
  }
}

/**
 * Batch evolve: process all available traces in the history folder.
 * Simulates experience accumulation across many tasks.
 */
export async function evolveBatch(): Promise<EvolveResult[]> {
  const results: EvolveResult[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log('Starting batch evolution from history');
  console.log(`${'='.repeat(60)}\n`);

  let projectDirs: string[];
  try {
    projectDirs = await fs.readdir(HISTORY_PATH);
  } catch {
    console.log('No history directory found. Run some debug sessions first.');
    return results;
  }

  for (let i = 0; i < projectDirs.length; i++) {
    const projectId = projectDirs[i]!;
    const tracePath = path.join(HISTORY_PATH, projectId, 'trace.json');

    try {
      await fs.access(tracePath);
    } catch {
      continue;
    }

    console.log(`\n${'~'.repeat(60)}`);
    console.log(`Trace ${i + 1}/${projectDirs.length}: ${projectId}`);
    console.log(`${'~'.repeat(60)}`);

    const result = await evolveFromTrace(tracePath);
    results.push(result);
  }

  // Final generalization pass across all accumulated data
  console.log(`\n${'='.repeat(60)}`);
  console.log('Final generalization pass');
  console.log(`${'='.repeat(60)}`);

  const protocol = await loadOrInitProtocol();
  const { newRules } = await generalizeProtocol(protocol);
  if (newRules.length > 0) {
    await bumpAndSave(protocol);
    console.log(`Generated ${newRules.length} new rules in final pass`);
  } else {
    console.log('No new rules generated');
  }

  // Summary
  const successful = results.filter((r) => r.success).length;
  const totalNewEntries = results.reduce((sum, r) => sum + r.newEntries, 0);
  const totalNewRules = results.reduce((sum, r) => sum + r.newRules, 0);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Batch complete: ${successful}/${results.length} traces processed`);
  console.log(
    `Protocol v${protocol.version} | ` +
    `${protocol.entries.length} entries | ${protocol.rules.length} rules`,
  );
  console.log(
    `New entries accumulated: ${totalNewEntries} | New rules: ${totalNewRules + newRules.length}`,
  );
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

/**
 * Process a trace inline (from a just-completed debug session)
 * and evolve the protocol.
 */
export async function evolveInline(
  trace: DebugTrace,
  protocol: DebugProtocol,
): Promise<{ protocol: DebugProtocol; newRules: number }> {
  // Save trace to history
  const projectId = path.basename(trace.projectPath) || `session-${Date.now()}`;
  await saveTrace(projectId, trace);

  // Generalize
  const { newRules } = await generalizeProtocol(protocol);

  // Persist
  await bumpAndSave(protocol);

  return { protocol, newRules: newRules.length };
}

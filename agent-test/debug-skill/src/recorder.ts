import { randomBytes } from 'node:crypto';
import type { DebugProtocol, DebugEntry, EvolutionEntry, FailureSignature } from './types.js';
import { addEntry, recordMatch } from './protocol-manager.js';
import type { DiagnosisResult } from './diagnoser.js';
import type { RepairResult } from './repairer.js';

// =============================================================================
// Recorder — records (signature, cause, fix) entries to protocol P
// =============================================================================
//
// Corresponds to Algorithm 1 step 8:
//   "Append a verified (signature, cause, fix) entry to P if the pattern is new"
//
// Two paths:
//   1. Existing match: increment occurrence count (experience reinforcement)
//   2. Novel entry: create and append a new DebugEntry to P
// =============================================================================

/**
 * Record the outcome of a diagnosis + repair cycle.
 *
 * @param protocol - Current protocol state
 * @param diagnosis - The diagnosis result
 * @param repair - The repair result
 * @param projectPath - Path to the project being debugged
 * @param verified - Whether the fix was verified (next build/test passed)
 * @returns Updated protocol and the evolution log entry
 */
export function recordOutcome(
  protocol: DebugProtocol,
  diagnosis: DiagnosisResult,
  repair: RepairResult,
  projectPath: string,
  verified: boolean,
): { protocol: DebugProtocol; logEntry: EvolutionEntry } {
  const timestamp = new Date().toISOString();

  // Path 1: Matched an existing entry — reinforce it
  if (diagnosis.matched && diagnosis.matchedEntryId) {
    recordMatch(protocol, diagnosis.matchedEntryId, projectPath);

    const logEntry: EvolutionEntry = {
      taskId: generateTaskId(),
      timestamp,
      projectPath,
      action: 'matched_existing',
      entryId: diagnosis.matchedEntryId,
      details: `Matched existing entry ${diagnosis.matchedEntryId} (confidence: ${diagnosis.confidence.toFixed(2)})`,
    };
    protocol.evolutionLog.push(logEntry);

    return { protocol, logEntry };
  }

  // Path 2: Novel error — create a new entry if the repair was verified
  if (!verified) {
    const logEntry: EvolutionEntry = {
      taskId: generateTaskId(),
      timestamp,
      projectPath,
      action: 'new_entry',
      details: `Unverified fix — not recording to protocol`,
    };
    protocol.evolutionLog.push(logEntry);
    return { protocol, logEntry };
  }

  const newEntry = buildNewEntry(diagnosis, repair, projectPath);
  addEntry(protocol, newEntry);

  const logEntry: EvolutionEntry = {
    taskId: generateTaskId(),
    timestamp,
    projectPath,
    action: 'new_entry',
    entryId: newEntry.id,
    details: `New entry: ${newEntry.signature.errorCode} — ${newEntry.rootCause.slice(0, 80)}`,
  };
  protocol.evolutionLog.push(logEntry);

  return { protocol, logEntry };
}

// -----------------------------------------------------------------------------
// Entry construction
// -----------------------------------------------------------------------------

function buildNewEntry(
  diagnosis: DiagnosisResult,
  repair: RepairResult,
  projectPath: string,
): DebugEntry {
  const now = new Date().toISOString();
  const candidate = diagnosis.candidateEntry;

  let signature: FailureSignature;
  let rootCause: string;
  let tags: string[];
  let fix: DebugEntry['fix'];

  if (candidate) {
    // Use LLM-generated candidate
    signature = candidate.signature;
    rootCause = candidate.rootCause;
    tags = candidate.tags;
    fix = repair.fix ?? candidate.fix;
  } else {
    // Minimal entry from repair result
    signature = {
      stage: 'build',
      errorCode: 'UNKNOWN',
      messagePattern: '.*',
    };
    rootCause = repair.description;
    tags = ['auto-recorded'];
    fix = repair.fix ?? {
      type: 'edit',
      description: repair.description,
      patch: '',
    };
  }

  const id = `entry-${signature.errorCode}-${randomBytes(4).toString('hex')}`;

  return {
    id,
    kind: 'reactive',
    signature,
    rootCause,
    tags,
    fix,
    occurrences: 1,
    contributingProjects: [projectPath],
    createdAt: now,
    lastMatchedAt: now,
  };
}

function generateTaskId(): string {
  return `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

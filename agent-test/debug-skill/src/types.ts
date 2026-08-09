// =============================================================================
// Debug Skill — Core Type Definitions
// =============================================================================
//
// Maps directly to paper concepts:
//   - DebugEntry          ↔ structured (signature, cause, fix) entry in P
//   - FailureSignature    ↔ error signature for matching
//   - ProtocolRule        ↔ generalized reusable rule (from repeated patterns)
//   - DebugProtocol       ↔ living debugging protocol P
//   - DebugTrace          ↔ one complete debug session's log
// =============================================================================

// -----------------------------------------------------------------------------
// Failure Signature — fingerprint for fast matching
// -----------------------------------------------------------------------------

/** Stage at which the failure was observed. */
export type FailureStage = 'build' | 'test' | 'runtime';

/**
 * A normalized fingerprint for an observed failure.
 * Used to match new failures against known entries in the protocol.
 */
export interface FailureSignature {
  /** Which verification stage produced this error */
  stage: FailureStage;

  /**
   * Error class / code, e.g. "TS2339", "MODULE_NOT_FOUND", "TextureNotFound".
   * Acts as the primary grouping key.
   */
  errorCode: string;

  /**
   * Normalized regex pattern that matches the error message.
   * Concrete names are replaced with capture groups, e.g.:
   *   "Property '(.+)' does not exist on type '(.+)'"
   */
  messagePattern: string;

  /**
   * Optional file-context glob, e.g. "src/scenes/*.ts" or "src/entities/*.ts".
   * Helps narrow matches when the same error code appears in different contexts.
   */
  fileContext?: string;
}

// -----------------------------------------------------------------------------
// Debug Entry — the atomic unit of protocol P
// -----------------------------------------------------------------------------

/** Whether this entry is used reactively (diagnose after failure) or
 *  proactively (validate before execution). */
export type EntryKind = 'reactive' | 'proactive';

/** How the verified fix is applied. */
export type FixType = 'edit' | 'shell' | 'config' | 'delete' | 'create';

/**
 * A single (signature, cause, fix) entry in the protocol.
 * Corresponds to the paper's "structured entry containing an error signature,
 * a root cause, and a verified fix."
 */
export interface DebugEntry {
  /** Unique identifier, e.g. "entry-TS2339-abc12345" */
  id: string;

  /** Reactive = used during diagnosis; proactive = used for pre-validation */
  kind: EntryKind;

  /** Error fingerprint for matching */
  signature: FailureSignature;

  /** Human-readable root-cause explanation */
  rootCause: string;

  /** Categorized tags for filtering, e.g. ["import", "type-mismatch"] */
  tags: string[];

  /** The verified fix */
  fix: {
    type: FixType;
    /** Natural-language description of the fix */
    description: string;
    /**
     * Machine-applicable patch or command.
     * For 'edit': a unified diff or search/replace pair.
     * For 'shell': a shell command string.
     * For 'config': a JSON-patch-like operation.
     */
    patch: string;
  };

  /** How many times this entry has been matched across tasks */
  occurrences: number;

  /** Which projects contributed to / validated this entry */
  contributingProjects: string[];

  /** ISO timestamp of creation */
  createdAt: string;

  /** ISO timestamp of last match */
  lastMatchedAt: string;

  /** If this entry was generalized from multiple entries, their IDs */
  generalizedFrom?: string[];
}

// -----------------------------------------------------------------------------
// Protocol Rule — generalized from repeated entries
// -----------------------------------------------------------------------------

/**
 * A reusable rule derived from multiple similar DebugEntries.
 * Corresponds to the paper's "protocol generalizes [a repeated pattern]
 * into a reusable rule."
 */
export interface ProtocolRule {
  id: string;

  /** Human-readable name, e.g. "Asset key consistency check" */
  name: string;

  /** Detailed description of what this rule checks */
  description: string;

  /** Conditions under which this rule applies, e.g. ["has asset-pack.json"] */
  preconditions: string[];

  /** What to do when the rule fires */
  action: 'flag' | 'fix' | 'block';

  /**
   * Validation logic expressed as a list of checks.
   * Each check is a mini-program the validator can execute.
   */
  checks: ValidationCheck[];

  /** The DebugEntry IDs this rule was derived from */
  derivedFrom: string[];

  /** How many tasks this rule has successfully prevented regressions in */
  preventionCount: number;

  createdAt: string;
  updatedAt: string;
}

/** A single validation check within a ProtocolRule. */
export interface ValidationCheck {
  /** What to examine */
  target: 'file' | 'config' | 'imports' | 'scene_registration' | 'assets';

  /** Glob or path pattern, e.g. src/STAR/STAR/STAR.ts */
  filePattern?: string;

  /** Regex or structured query to run against the target */
  query: string;

  /** What a violation looks like */
  violationMessage: string;
}

// -----------------------------------------------------------------------------
// Evolution Log Entry
// -----------------------------------------------------------------------------

export interface EvolutionEntry {
  taskId: string;
  timestamp: string;
  projectPath: string;
  action: 'new_entry' | 'matched_existing' | 'generalized_rule';
  entryId?: string;
  ruleId?: string;
  details: string;
}

// -----------------------------------------------------------------------------
// Debug Protocol — top-level persistent state (the "living protocol P")
// -----------------------------------------------------------------------------

/**
 * The living debugging protocol P.
 * Persisted to output/protocol.json and updated after every debug session.
 */
export interface DebugProtocol {
  version: number;
  createdAt: string;
  updatedAt: string;

  /**
   * Path to the seed protocol (P0) that this protocol was initialized from.
   * Analogous to Template Skill's meta-template path.
   */
  seedProtocolPath: string;

  /** All (signature, cause, fix) entries */
  entries: DebugEntry[];

  /** Generalized rules derived from repeated entries */
  rules: ProtocolRule[];

  /** Complete evolution log */
  evolutionLog: EvolutionEntry[];
}

// -----------------------------------------------------------------------------
// Debug Trace — log of a single debug session (Algorithm 1's REPEAT loop)
// -----------------------------------------------------------------------------

/** One iteration of the verify → diagnose → repair loop. */
export interface DebugIteration {
  iteration: number;
  timestamp: string;

  /** Verification stage that was run */
  stage: FailureStage;

  /** Whether this iteration passed */
  passed: boolean;

  /** Raw error output (if failed) */
  rawError?: string;

  /** Matched entry from P (if any) */
  matchedEntryId?: string;

  /** New entry created (if novel failure) */
  newEntryId?: string;

  /** What repair action was taken */
  repairAction?: string;

  /** Duration of this iteration in ms */
  durationMs: number;
}

/** Complete trace for a single debug session on one project. */
export interface DebugTrace {
  projectPath: string;
  startedAt: string;
  completedAt: string;
  success: boolean;

  /** Total iterations of the REPEAT loop */
  totalIterations: number;

  /** Max iterations allowed before giving up */
  maxIterations: number;

  /** Pre-execution validations that were run */
  validationResults: ValidationResult[];

  /** Each iteration of the debug loop */
  iterations: DebugIteration[];

  /** Entries added to P during this session */
  newEntries: string[];

  /** Existing entries matched during this session */
  matchedEntries: string[];

  totalDurationMs: number;
}

/** Result of a single pre-execution validation check. */
export interface ValidationResult {
  ruleId: string;
  passed: boolean;
  violations: string[];
}

// -----------------------------------------------------------------------------
// Runner output — structured build/test/run results
// -----------------------------------------------------------------------------

export type RunStage = 'build' | 'test' | 'dev';

export interface RunResult {
  stage: RunStage;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Parsed errors extracted from the raw output */
  errors: ParsedError[];
  durationMs: number;
}

/** A single error extracted from build/test/runtime output. */
export interface ParsedError {
  /** Normalized error code, e.g. "TS2339", "ReferenceError" */
  code: string;
  /** Original error message */
  message: string;
  /** File path (if available) */
  file?: string;
  /** Line number (if available) */
  line?: number;
  /** Column number (if available) */
  column?: number;
}

// -----------------------------------------------------------------------------
// Evolve result
// -----------------------------------------------------------------------------

export interface EvolveResult {
  success: boolean;
  protocol: DebugProtocol;
  newEntries: number;
  matchedEntries: number;
  newRules: number;
  durationMs: number;
  error?: string;
}

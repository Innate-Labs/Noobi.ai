import type {
  DebugProtocol,
  DebugEntry,
  ParsedError,
  FailureSignature,
  FailureStage,
} from './types.js';
import { getReactiveEntries } from './protocol-manager.js';
import { type LLMConfig, getDiagnoserConfig, SIGNATURE_MATCH_THRESHOLD } from './config.js';

// =============================================================================
// Diagnoser — matches errors against protocol P, or uses LLM for novel errors
// =============================================================================
//
// Corresponds to Algorithm 1 step 7:
//   "Diagnose the failure using P and repair y"
//
// Two-phase diagnosis:
//   1. Signature matching: try to match the error against known entries in P
//   2. LLM fallback: if no match, call LLM to analyze the error and produce
//      a new (signature, cause, fix) candidate
// =============================================================================

export interface DiagnosisResult {
  /** Whether the error matched a known entry */
  matched: boolean;

  /** Matched entry ID (if found in P) */
  matchedEntryId?: string;

  /** Matched entry (if found) */
  matchedEntry?: DebugEntry;

  /** Confidence of the match (0–1) */
  confidence: number;

  /** For novel errors: LLM-generated candidate entry */
  candidateEntry?: Omit<DebugEntry, 'id' | 'occurrences' | 'contributingProjects' | 'createdAt' | 'lastMatchedAt'>;
}

/**
 * Diagnose a set of parsed errors using the protocol.
 * Returns diagnoses in the same order as input errors.
 */
export async function diagnoseErrors(
  errors: ParsedError[],
  protocol: DebugProtocol,
  projectDir: string,
): Promise<DiagnosisResult[]> {
  const results: DiagnosisResult[] = [];

  for (const error of errors) {
    const result = await diagnoseSingleError(error, protocol, projectDir);
    results.push(result);
  }

  return results;
}

/**
 * Diagnose a single error: first try signature matching, then LLM fallback.
 */
async function diagnoseSingleError(
  error: ParsedError,
  protocol: DebugProtocol,
  projectDir: string,
): Promise<DiagnosisResult> {
  // Phase 1: Signature matching against known entries
  const matchResult = matchAgainstProtocol(error, protocol);
  if (matchResult) return matchResult;

  // Phase 2: LLM fallback for novel errors
  try {
    const candidate = await llmDiagnose(error, protocol, projectDir);
    if (candidate) {
      return {
        matched: false,
        confidence: candidate.confidence,
        candidateEntry: candidate.entry,
      };
    }
  } catch (e) {
    console.warn(
      `[Diagnoser] LLM fallback failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // No match and LLM failed — return undiagnosed
  return { matched: false, confidence: 0 };
}

// -----------------------------------------------------------------------------
// Phase 1: Signature matching
// -----------------------------------------------------------------------------

function matchAgainstProtocol(
  error: ParsedError,
  protocol: DebugProtocol,
): DiagnosisResult | null {
  const reactiveEntries = getReactiveEntries(protocol);
  let bestMatch: { entry: DebugEntry; score: number } | null = null;

  for (const entry of reactiveEntries) {
    const score = computeMatchScore(error, entry.signature);
    if (score > SIGNATURE_MATCH_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { entry, score };
    }
  }

  if (!bestMatch) return null;

  return {
    matched: true,
    matchedEntryId: bestMatch.entry.id,
    matchedEntry: bestMatch.entry,
    confidence: bestMatch.score,
  };
}

/**
 * Compute a similarity score (0–1) between a parsed error and a signature.
 */
function computeMatchScore(
  error: ParsedError,
  signature: FailureSignature,
): number {
  let score = 0;
  let weights = 0;

  // Error code match (highest weight)
  if (error.code === signature.errorCode) {
    score += 0.5;
  } else if (
    error.code.toLowerCase() === signature.errorCode.toLowerCase()
  ) {
    score += 0.3;
  }
  weights += 0.5;

  // Message pattern match
  try {
    const regex = new RegExp(signature.messagePattern, 'i');
    if (regex.test(error.message)) {
      score += 0.35;
    }
  } catch {
    // Invalid regex — skip pattern matching
    if (error.message.toLowerCase().includes(signature.messagePattern.toLowerCase())) {
      score += 0.2;
    }
  }
  weights += 0.35;

  // File context match (optional, lower weight)
  if (signature.fileContext && error.file) {
    const globToRegex = signature.fileContext
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    try {
      if (new RegExp(globToRegex).test(error.file)) {
        score += 0.15;
      }
    } catch {
      // Invalid glob — skip
    }
  }
  weights += 0.15;

  return weights > 0 ? score / weights : 0;
}

// -----------------------------------------------------------------------------
// Phase 2: LLM fallback
// -----------------------------------------------------------------------------

interface LLMDiagnosisResult {
  entry: Omit<DebugEntry, 'id' | 'occurrences' | 'contributingProjects' | 'createdAt' | 'lastMatchedAt'>;
  confidence: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message: string;
  };
}

async function llmDiagnose(
  error: ParsedError,
  protocol: DebugProtocol,
  projectDir: string,
): Promise<LLMDiagnosisResult | null> {
  const config = getDiagnoserConfig();
  if (!config.apiKey) {
    console.log('[Diagnoser] No API key configured, skipping LLM diagnosis');
    return null;
  }

  const systemPrompt = buildDiagnoserSystemPrompt(protocol);
  const userPrompt = buildDiagnoserUserPrompt(error, projectDir);

  const content = await callLLM(config, systemPrompt, userPrompt);
  if (!content) return null;

  return parseLLMDiagnosis(content, error);
}

function buildDiagnoserSystemPrompt(protocol: DebugProtocol): string {
  const existingCodes = protocol.entries
    .map((e) => `${e.signature.errorCode}: ${e.rootCause.slice(0, 100)}`)
    .join('\n');

  return `You are a game project debugger. You diagnose errors in Phaser + TypeScript web game projects.

Given an error, produce a structured diagnosis with:
1. A normalized error signature (error code + message pattern with concrete names replaced by capture groups)
2. The root cause explanation
3. A verified fix

Known error patterns in the protocol (for reference — do NOT duplicate these):
${existingCodes || '(none yet)'}

Respond with ONLY a JSON object:
{
  "errorCode": "string (e.g. TS2339, TypeError, TextureNotFound)",
  "messagePattern": "string (regex with capture groups for variable parts)",
  "stage": "build | test | runtime",
  "rootCause": "string (clear explanation)",
  "tags": ["string"],
  "fixType": "edit | shell | config | delete | create",
  "fixDescription": "string (how to fix)",
  "fixPatch": "string (concrete fix instruction)",
  "confidence": 0.0-1.0
}`;
}

function buildDiagnoserUserPrompt(error: ParsedError, projectDir: string): string {
  return `Diagnose this error from project at ${projectDir}:

Error Code: ${error.code}
Message: ${error.message}
${error.file ? `File: ${error.file}` : ''}
${error.line ? `Line: ${error.line}` : ''}

Produce a structured diagnosis as JSON.`;
}

function parseLLMDiagnosis(
  content: string,
  error: ParsedError,
): LLMDiagnosisResult | null {
  try {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const stage = (['build', 'test', 'runtime'].includes(parsed['stage'] as string)
      ? parsed['stage']
      : 'build') as FailureStage;

    return {
      entry: {
        kind: 'reactive',
        signature: {
          stage,
          errorCode: (parsed['errorCode'] as string) || error.code,
          messagePattern: (parsed['messagePattern'] as string) || error.message,
          fileContext: error.file,
        },
        rootCause: (parsed['rootCause'] as string) || 'Unknown',
        tags: (parsed['tags'] as string[]) || [],
        fix: {
          type: (['edit', 'shell', 'config', 'delete', 'create'].includes(
            parsed['fixType'] as string,
          )
            ? parsed['fixType']
            : 'edit') as DebugEntry['fix']['type'],
          description: (parsed['fixDescription'] as string) || '',
          patch: (parsed['fixPatch'] as string) || '',
        },
        generalizedFrom: undefined,
      },
      confidence: (parsed['confidence'] as number) ?? 0.5,
    };
  } catch {
    return null;
  }
}

async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const payload = {
    model: config.modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
  };

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content ?? null;
}

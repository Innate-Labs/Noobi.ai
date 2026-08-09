import { randomBytes } from 'node:crypto';
import type {
  DebugProtocol,
  DebugEntry,
  ProtocolRule,
  ValidationCheck,
  EvolutionEntry,
} from './types.js';
import { addRule } from './protocol-manager.js';
import { type LLMConfig, getGeneralizerConfig, GENERALIZATION_THRESHOLD } from './config.js';

// =============================================================================
// Generalizer — detects repeated patterns and promotes them to reusable rules
// =============================================================================
//
// Corresponds to the paper:
//   "When a failure pattern repeats across tasks, the protocol generalizes
//    it into a reusable rule."
//
// Process:
//   1. Group entries by errorCode
//   2. For groups exceeding GENERALIZATION_THRESHOLD, generate a ProtocolRule
//   3. Rules contain automated ValidationChecks for the Validator
// =============================================================================

export interface GeneralizationResult {
  newRules: ProtocolRule[];
  protocol: DebugProtocol;
}

/**
 * Scan the protocol for repeated patterns and generate rules.
 */
export async function generalizeProtocol(
  protocol: DebugProtocol,
): Promise<GeneralizationResult> {
  const newRules: ProtocolRule[] = [];

  // Group reactive entries by errorCode
  const groups = groupByErrorCode(protocol.entries);

  for (const [errorCode, entries] of groups) {
    // Skip if below threshold
    if (entries.length < GENERALIZATION_THRESHOLD) continue;

    // Skip if a rule already exists for this errorCode
    const existingRule = protocol.rules.find((r) =>
      r.derivedFrom.some((id) => entries.some((e) => e.id === id)),
    );
    if (existingRule) continue;

    // Generate a rule from the group
    const rule = await generateRule(errorCode, entries);
    if (rule) {
      addRule(protocol, rule);
      newRules.push(rule);

      const logEntry: EvolutionEntry = {
        taskId: `gen-${Date.now()}-${randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        projectPath: '',
        action: 'generalized_rule',
        ruleId: rule.id,
        details: `Generalized ${entries.length} entries into rule: ${rule.name}`,
      };
      protocol.evolutionLog.push(logEntry);
    }
  }

  return { newRules, protocol };
}

// -----------------------------------------------------------------------------
// Grouping
// -----------------------------------------------------------------------------

function groupByErrorCode(entries: DebugEntry[]): Map<string, DebugEntry[]> {
  const groups = new Map<string, DebugEntry[]>();

  for (const entry of entries) {
    if (entry.kind !== 'reactive') continue;
    const code = entry.signature.errorCode;
    const group = groups.get(code) ?? [];
    group.push(entry);
    groups.set(code, group);
  }

  return groups;
}

// -----------------------------------------------------------------------------
// Rule generation
// -----------------------------------------------------------------------------

async function generateRule(
  errorCode: string,
  entries: DebugEntry[],
): Promise<ProtocolRule | null> {
  // First try LLM-based rule generation
  try {
    const llmRule = await llmGenerateRule(errorCode, entries);
    if (llmRule) return llmRule;
  } catch {
    // Fall through to rule-based
  }

  // Fallback: rule-based generalization
  return ruleBasedGeneralize(errorCode, entries);
}

/**
 * Rule-based generalization: aggregate common patterns from entries.
 */
function ruleBasedGeneralize(
  errorCode: string,
  entries: DebugEntry[],
): ProtocolRule {
  const id = `rule-${errorCode.toLowerCase()}-${randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  // Extract common tags
  const tagCounts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const commonTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= entries.length * 0.5)
    .map(([tag]) => tag);

  // Build validation checks from file contexts
  const checks: ValidationCheck[] = [];
  const fileContexts = new Set(
    entries
      .map((e) => e.signature.fileContext)
      .filter((ctx): ctx is string => ctx !== undefined),
  );

  for (const fileContext of fileContexts) {
    // Collect message patterns for this context
    const patterns = entries
      .filter((e) => e.signature.fileContext === fileContext)
      .map((e) => e.signature.messagePattern);

    for (const pattern of patterns) {
      checks.push({
        target: 'file',
        filePattern: fileContext,
        query: pattern,
        violationMessage: `Pattern "${errorCode}" detected: ${entries[0]!.rootCause.slice(0, 80)}`,
      });
    }
  }

  // Compute a descriptive name
  const name = `${errorCode} prevention (${commonTags.join(', ') || 'general'})`;
  const description = entries
    .map((e) => e.rootCause)
    .slice(0, 3)
    .join('; ');

  return {
    id,
    name,
    description: `Generalized from ${entries.length} occurrences. Common causes: ${description}`,
    preconditions: fileContexts.size > 0
      ? [...fileContexts].map((ctx) => `files matching ${ctx} exist`)
      : ['project has TypeScript source files'],
    action: 'flag',
    checks,
    derivedFrom: entries.map((e) => e.id),
    preventionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// -----------------------------------------------------------------------------
// LLM-based rule generation
// -----------------------------------------------------------------------------

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function llmGenerateRule(
  errorCode: string,
  entries: DebugEntry[],
): Promise<ProtocolRule | null> {
  const config = getGeneralizerConfig();
  if (!config.apiKey) return null;

  const entrySummaries = entries
    .map(
      (e, i) =>
        `${i + 1}. [${e.signature.stage}] ${e.signature.messagePattern}\n   Root cause: ${e.rootCause}\n   Fix: ${e.fix.description}`,
    )
    .join('\n');

  const systemPrompt = `You are a pattern generalizer for a game project debug protocol.
Given multiple related error entries, produce a generalized validation rule that can PREVENT these errors proactively.

Output ONLY a JSON object:
{
  "name": "short rule name",
  "description": "what this rule checks and why",
  "preconditions": ["when this rule applies"],
  "action": "flag | fix | block",
  "checks": [
    {
      "target": "file | config | imports | scene-registration | assets",
      "filePattern": "glob pattern (optional)",
      "query": "what to check (regex or description)",
      "violationMessage": "human-readable violation message"
    }
  ]
}`;

  const userPrompt = `Error code: ${errorCode}
Number of occurrences: ${entries.length}

Related entries:
${entrySummaries}

Generalize these into a single reusable validation rule.`;

  const content = await callLLM(config, systemPrompt, userPrompt);
  if (!content) return null;

  return parseLLMRule(content, errorCode, entries);
}

function parseLLMRule(
  content: string,
  errorCode: string,
  entries: DebugEntry[],
): ProtocolRule | null {
  try {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const now = new Date().toISOString();
    const id = `rule-${errorCode.toLowerCase()}-${randomBytes(4).toString('hex')}`;

    const checks: ValidationCheck[] = [];
    if (Array.isArray(parsed['checks'])) {
      for (const check of parsed['checks'] as Record<string, unknown>[]) {
        checks.push({
          target: (check['target'] as ValidationCheck['target']) || 'file',
          filePattern: check['filePattern'] as string | undefined,
          query: (check['query'] as string) || '',
          violationMessage: (check['violationMessage'] as string) || '',
        });
      }
    }

    return {
      id,
      name: (parsed['name'] as string) || `${errorCode} rule`,
      description: (parsed['description'] as string) || '',
      preconditions: (parsed['preconditions'] as string[]) || [],
      action: (['flag', 'fix', 'block'].includes(parsed['action'] as string)
        ? parsed['action']
        : 'flag') as ProtocolRule['action'],
      checks,
      derivedFrom: entries.map((e) => e.id),
      preventionCount: 0,
      createdAt: now,
      updatedAt: now,
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

import * as fs from 'fs/promises';
import * as path from 'path';
import type { DebugEntry, ParsedError } from './types.js';
import { type LLMConfig, getRepairerConfig } from './config.js';
import type { DiagnosisResult } from './diagnoser.js';

// =============================================================================
// Repairer — applies verified fixes from P or generates new fixes via LLM
// =============================================================================
//
// Corresponds to Algorithm 1 step 7:
//   "Diagnose the failure using P and repair y"
//
// Two modes:
//   1. Known fix: apply the patch from the matched DebugEntry
//   2. Novel fix: generate a repair via LLM using the diagnosis context
// =============================================================================

export interface RepairResult {
  /** Whether the repair was applied successfully */
  applied: boolean;

  /** What type of repair was performed */
  repairType: 'known_fix' | 'llm_generated' | 'skipped';

  /** Description of the repair action taken */
  description: string;

  /** Files that were modified */
  modifiedFiles: string[];

  /** The fix that was applied (for recording) */
  fix?: DebugEntry['fix'];
}

/**
 * Apply a repair for a diagnosed error.
 *
 * @param diagnosis - The diagnosis result from the diagnoser
 * @param error - The original parsed error
 * @param projectDir - Project directory
 * @returns Result of the repair attempt
 */
export async function applyRepair(
  diagnosis: DiagnosisResult,
  error: ParsedError,
  projectDir: string,
): Promise<RepairResult> {
  // Case 1: Known entry with verified fix
  if (diagnosis.matched && diagnosis.matchedEntry) {
    return applyKnownFix(diagnosis.matchedEntry, error, projectDir);
  }

  // Case 2: LLM-generated candidate
  if (diagnosis.candidateEntry) {
    return applyGeneratedFix(diagnosis.candidateEntry.fix, error, projectDir);
  }

  // Case 3: No diagnosis — attempt LLM-based direct repair
  return attemptDirectRepair(error, projectDir);
}

// -----------------------------------------------------------------------------
// Known fix application
// -----------------------------------------------------------------------------

async function applyKnownFix(
  entry: DebugEntry,
  error: ParsedError,
  projectDir: string,
): Promise<RepairResult> {
  const { fix } = entry;

  switch (fix.type) {
    case 'edit':
      return applyEditFix(fix, error, projectDir);
    case 'config':
      return applyConfigFix(fix, error, projectDir);
    case 'shell':
      return applyShellFix(fix, projectDir);
    case 'delete':
      return applyDeleteFix(fix, projectDir);
    case 'create':
      return applyCreateFix(fix, projectDir);
    default:
      return {
        applied: false,
        repairType: 'known_fix',
        description: `Unknown fix type: ${fix.type}`,
        modifiedFiles: [],
        fix,
      };
  }
}

async function applyEditFix(
  fix: DebugEntry['fix'],
  error: ParsedError,
  projectDir: string,
): Promise<RepairResult> {
  if (!error.file) {
    return {
      applied: false,
      repairType: 'known_fix',
      description: 'Edit fix requires a file path, but none was provided in the error.',
      modifiedFiles: [],
      fix,
    };
  }

  const filePath = path.isAbsolute(error.file)
    ? error.file
    : path.join(projectDir, error.file);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Attempt search/replace if patch contains a recognizable pattern
    const patchResult = tryApplyPatch(content, fix.patch);
    if (patchResult.modified) {
      await fs.writeFile(filePath, patchResult.content);
      return {
        applied: true,
        repairType: 'known_fix',
        description: fix.description,
        modifiedFiles: [filePath],
        fix,
      };
    }

    // Could not apply mechanically — log the instruction
    return {
      applied: false,
      repairType: 'known_fix',
      description: `Could not apply patch mechanically. Manual instruction: ${fix.description}`,
      modifiedFiles: [],
      fix,
    };
  } catch {
    return {
      applied: false,
      repairType: 'known_fix',
      description: `File not accessible: ${filePath}`,
      modifiedFiles: [],
      fix,
    };
  }
}

async function applyConfigFix(
  fix: DebugEntry['fix'],
  _error: ParsedError,
  projectDir: string,
): Promise<RepairResult> {
  const configPath = path.join(projectDir, 'src', 'gameConfig.json');

  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;

    // Attempt to parse patch as JSON operations
    try {
      const operations = JSON.parse(fix.patch) as Record<string, unknown>;
      Object.assign(config, operations);
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      return {
        applied: true,
        repairType: 'known_fix',
        description: fix.description,
        modifiedFiles: [configPath],
        fix,
      };
    } catch {
      return {
        applied: false,
        repairType: 'known_fix',
        description: `Config patch not parseable as JSON. Manual instruction: ${fix.description}`,
        modifiedFiles: [],
        fix,
      };
    }
  } catch {
    return {
      applied: false,
      repairType: 'known_fix',
      description: `Config file not accessible: ${configPath}`,
      modifiedFiles: [],
      fix,
    };
  }
}

async function applyShellFix(
  fix: DebugEntry['fix'],
  _projectDir: string,
): Promise<RepairResult> {
  // Shell fixes are logged but not auto-executed for safety
  return {
    applied: false,
    repairType: 'known_fix',
    description: `Shell fix requires manual execution: ${fix.patch}`,
    modifiedFiles: [],
    fix,
  };
}

async function applyDeleteFix(
  fix: DebugEntry['fix'],
  projectDir: string,
): Promise<RepairResult> {
  const targetPath = path.join(projectDir, fix.patch);
  try {
    await fs.unlink(targetPath);
    return {
      applied: true,
      repairType: 'known_fix',
      description: fix.description,
      modifiedFiles: [targetPath],
      fix,
    };
  } catch {
    return {
      applied: false,
      repairType: 'known_fix',
      description: `Could not delete: ${targetPath}`,
      modifiedFiles: [],
      fix,
    };
  }
}

async function applyCreateFix(
  fix: DebugEntry['fix'],
  projectDir: string,
): Promise<RepairResult> {
  // Create fix expects patch as "path::content" format
  const separatorIndex = fix.patch.indexOf('::');
  if (separatorIndex === -1) {
    return {
      applied: false,
      repairType: 'known_fix',
      description: `Create fix patch format invalid. Expected "path::content".`,
      modifiedFiles: [],
      fix,
    };
  }

  const relPath = fix.patch.slice(0, separatorIndex);
  const content = fix.patch.slice(separatorIndex + 2);
  const targetPath = path.join(projectDir, relPath);

  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
    return {
      applied: true,
      repairType: 'known_fix',
      description: fix.description,
      modifiedFiles: [targetPath],
      fix,
    };
  } catch {
    return {
      applied: false,
      repairType: 'known_fix',
      description: `Could not create file: ${targetPath}`,
      modifiedFiles: [],
      fix,
    };
  }
}

// -----------------------------------------------------------------------------
// LLM-generated fix
// -----------------------------------------------------------------------------

async function applyGeneratedFix(
  fix: DebugEntry['fix'],
  error: ParsedError,
  projectDir: string,
): Promise<RepairResult> {
  const result = await applyEditFix(fix, error, projectDir);
  return { ...result, repairType: 'llm_generated' };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function attemptDirectRepair(
  error: ParsedError,
  projectDir: string,
): Promise<RepairResult> {
  const config = getRepairerConfig();
  if (!config.apiKey) {
    return {
      applied: false,
      repairType: 'skipped',
      description: 'No API key configured for LLM repair.',
      modifiedFiles: [],
    };
  }

  try {
    const content = await callRepairLLM(config, error, projectDir);
    if (!content) {
      return {
        applied: false,
        repairType: 'skipped',
        description: 'LLM returned no repair suggestion.',
        modifiedFiles: [],
      };
    }

    // Parse LLM response and attempt to apply
    const fix = parseRepairResponse(content);
    if (fix) {
      const result = await applyEditFix(fix, error, projectDir);
      return { ...result, repairType: 'llm_generated' };
    }

    return {
      applied: false,
      repairType: 'llm_generated',
      description: `LLM suggestion (not auto-applied): ${content.slice(0, 200)}`,
      modifiedFiles: [],
    };
  } catch {
    return {
      applied: false,
      repairType: 'skipped',
      description: 'LLM repair failed.',
      modifiedFiles: [],
    };
  }
}

async function callRepairLLM(
  config: LLMConfig,
  error: ParsedError,
  projectDir: string,
): Promise<string | null> {
  let fileContent = '';
  if (error.file) {
    const filePath = path.isAbsolute(error.file)
      ? error.file
      : path.join(projectDir, error.file);
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File not accessible
    }
  }

  const payload = {
    model: config.modelName,
    messages: [
      {
        role: 'system',
        content: `You are a repair agent for Phaser + TypeScript game projects.
Given an error and file content, produce a fix as JSON:
{
  "search": "exact string to find in the file",
  "replace": "replacement string",
  "description": "what this fix does"
}
Output ONLY the JSON object.`,
      },
      {
        role: 'user',
        content: `Error: ${error.code}: ${error.message}
${error.file ? `File: ${error.file}` : ''}
${error.line ? `Line: ${error.line}` : ''}
${fileContent ? `\nFile content:\n${fileContent.slice(0, 3000)}` : ''}`,
      },
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

function parseRepairResponse(content: string): DebugEntry['fix'] | null {
  try {
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }
    const parsed = JSON.parse(jsonStr) as Record<string, string>;
    if (parsed['search'] && parsed['replace']) {
      return {
        type: 'edit',
        description: parsed['description'] || 'LLM-generated fix',
        patch: `${parsed['search']}|||${parsed['replace']}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Patch application utilities
// -----------------------------------------------------------------------------

interface PatchResult {
  modified: boolean;
  content: string;
}

/**
 * Try to apply a patch string to file content.
 * Supports "search|||replace" format.
 */
function tryApplyPatch(content: string, patch: string): PatchResult {
  // Format: "search|||replace"
  const separatorIndex = patch.indexOf('|||');
  if (separatorIndex === -1) {
    return { modified: false, content };
  }

  const search = patch.slice(0, separatorIndex);
  const replace = patch.slice(separatorIndex + 3);

  if (content.includes(search)) {
    return {
      modified: true,
      content: content.replace(search, replace),
    };
  }

  return { modified: false, content };
}

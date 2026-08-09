import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Root of the debug-skill module */
export const MODULE_ROOT = path.join(__dirname, '..');

/** Path to the seed protocol P0 */
export const SEED_PROTOCOL_PATH = path.join(MODULE_ROOT, 'seed-protocol');

/** Path to the evolution output (protocol.json + history/) */
export const OUTPUT_PATH = path.join(MODULE_ROOT, 'output');

/** Path to the live protocol.json */
export const PROTOCOL_JSON_PATH = path.join(OUTPUT_PATH, 'protocol.json');

/** Path to the rendered protocol.md (auto-generated from protocol.json) */
export const PROTOCOL_MD_PATH = path.join(OUTPUT_PATH, 'protocol.md');

/** Path to per-project debug trace history */
export const HISTORY_PATH = path.join(OUTPUT_PATH, 'history');

/** Path to the seed protocol.json (P0) */
export const SEED_JSON_PATH = path.join(SEED_PROTOCOL_PATH, 'protocol.json');

// -----------------------------------------------------------------------------
// Debug Loop Limits
// -----------------------------------------------------------------------------

/** Maximum iterations for the REPEAT...UNTIL debug loop */
export const MAX_DEBUG_ITERATIONS = 10;

/** Minimum occurrences before a pattern is eligible for generalization */
export const GENERALIZATION_THRESHOLD = 3;

/** Similarity threshold for matching error signatures (0–1) */
export const SIGNATURE_MATCH_THRESHOLD = 0.8;

// -----------------------------------------------------------------------------
// LLM Configuration
// -----------------------------------------------------------------------------

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
}

function env(key: string, fallback: string = ''): string {
  return process.env[key] ?? fallback;
}

/** LLM config for diagnosis (precise, low temperature) */
export function getDiagnoserConfig(): LLMConfig {
  return {
    apiKey:
      env('REASONING_MODEL_API_KEY') ||
      env('DASHSCOPE_API_KEY') ||
      env('OPENAI_API_KEY'),
    baseUrl:
      env('REASONING_MODEL_BASE_URL') ||
      env('OPENAI_BASE_URL') ||
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelName:
      env('DIAGNOSER_MODEL_NAME') ||
      env('REASONING_MODEL_NAME') ||
      'qwen-plus',
    temperature: 0.2,
    maxTokens: 2000,
    timeout: 30_000,
  };
}

/** LLM config for generalization (slightly higher creativity) */
export function getGeneralizerConfig(): LLMConfig {
  return {
    apiKey:
      env('REASONING_MODEL_API_KEY') ||
      env('DASHSCOPE_API_KEY') ||
      env('OPENAI_API_KEY'),
    baseUrl:
      env('REASONING_MODEL_BASE_URL') ||
      env('OPENAI_BASE_URL') ||
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelName:
      env('GENERALIZER_MODEL_NAME') ||
      env('REASONING_MODEL_NAME') ||
      'qwen-plus',
    temperature: 0.4,
    maxTokens: 4000,
    timeout: 60_000,
  };
}

/** LLM config for repair generation */
export function getRepairerConfig(): LLMConfig {
  return {
    apiKey:
      env('REASONING_MODEL_API_KEY') ||
      env('DASHSCOPE_API_KEY') ||
      env('OPENAI_API_KEY'),
    baseUrl:
      env('REASONING_MODEL_BASE_URL') ||
      env('OPENAI_BASE_URL') ||
      'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    modelName:
      env('REPAIRER_MODEL_NAME') ||
      env('REASONING_MODEL_NAME') ||
      'qwen-plus',
    temperature: 0.3,
    maxTokens: 4000,
    timeout: 60_000,
  };
}

import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Root of the template-skill module */
export const MODULE_ROOT = path.join(__dirname, '..');

/** Path to the meta template M0 */
export const META_TEMPLATE_PATH = path.join(MODULE_ROOT, 'meta-template');

/** Path to the evolution output (library.json + families/) */
export const OUTPUT_PATH = path.join(MODULE_ROOT, 'output');

/** Path to library.json */
export const LIBRARY_JSON_PATH = path.join(OUTPUT_PATH, 'library.json');

/** Path to evolved family directories */
export const FAMILIES_PATH = path.join(OUTPUT_PATH, 'families');

/** M0's core gameConfig.json — used as baseline for diff */
export const M0_GAME_CONFIG_PATH = path.join(
  META_TEMPLATE_PATH,
  'core',
  'src',
  'gameConfig.json',
);

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

/** LLM config for the classifier (fast, low-temperature) */
export function getClassifierConfig(): LLMConfig {
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
      env('CLASSIFIER_MODEL_NAME') ||
      env('REASONING_MODEL_NAME') ||
      'qwen-plus',
    temperature: 0.3,
    maxTokens: 800,
    timeout: 30_000,
  };
}

/** LLM config for the abstractor (higher creativity) */
export function getAbstractorConfig(): LLMConfig {
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
      env('ABSTRACTOR_MODEL_NAME') ||
      env('REASONING_MODEL_NAME') ||
      'qwen-plus',
    temperature: 0.5,
    maxTokens: 8000,
    timeout: 120_000,
  };
}

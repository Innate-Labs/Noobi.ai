import type {
  ExtractedPatterns,
  AbstractedTemplates,
  TemplateFileDef,
  HookDef,
  ConfigField,
} from './types.js';
import { getAbstractorConfig, type LLMConfig } from './config.js';

// =============================================================================
// Abstractor — LLM-driven template generalization
// =============================================================================

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

async function callLLM(
  config: LLMConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM API ${response.status}: ${body}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    if (data.error) throw new Error(`LLM Error: ${data.error.message}`);

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// -----------------------------------------------------------------------------
// System prompt for abstraction
// -----------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `# Template Abstractor

You are a code analysis expert. Your task is to take CONCRETE game code extracted
from a completed project and generalize it into REUSABLE template code.

## Your Goals

1. **Identify stable patterns**: Code that would appear in ANY game of this type
   (e.g., gravity setup for platformers, grid initialization for grid logic)
2. **Replace game-specific content** with generic placeholders:
   - Specific character names → "Player", "Enemy", "Entity"
   - Hardcoded values → config references (gameConfig.xxx.value)
   - Specific texture keys → placeholder_texture comments
   - Specific dialogue → TODO comments
3. **Preserve the architecture**: Keep class hierarchies, hook patterns, and
   lifecycle methods intact
4. **Mark extension points**: Add TODO/override comments where game-specific
   customization should happen

## Output Format

Return a JSON object with this structure:
{
  "templateFiles": [
    {
      "relativePath": "src/scenes/BaseLevelScene.ts",
      "content": "// ... generalized TypeScript code ...",
      "role": "base_class" | "copy_template" | "system" | "behavior" | "utility"
    }
  ],
  "summary": "Brief description of what this template family provides"
}

## Rules
- Output VALID JSON only (no markdown fences around the top-level JSON)
- Template file contents should be valid TypeScript
- Keep imports but generalize paths where needed
- base_class: Engine code that should NOT be modified (KEEP files)
- copy_template: Files meant to be copied and customized (_Template* pattern)
- system: Reusable system managers (BoardManager, WaveManager, etc.)
- behavior: Reusable behavior components (PatrolAI, MeleeAttack, etc.)
- utility: Shared utility functions`;
}

function buildUserPrompt(patterns: ExtractedPatterns): string {
  const parts: string[] = [];

  parts.push(`## Archetype: ${patterns.archetype}`);
  parts.push(
    `## Physics: gravity=${patterns.physicsProfile.hasGravity}, ` +
      `perspective=${patterns.physicsProfile.perspective}, ` +
      `movement=${patterns.physicsProfile.movementType}`,
  );

  // File structure
  parts.push('\n## Directory Structure');
  for (const dir of patterns.fileStructure.directories) {
    const files = patterns.fileStructure.filesByDirectory[dir] ?? [];
    parts.push(`${dir}/: ${files.join(', ')}`);
  }

  // Class hierarchy
  parts.push('\n## Class Hierarchy');
  for (const cls of patterns.classes) {
    const ext = cls.parentClass ? ` extends ${cls.parentClass}` : '';
    const abs = cls.isAbstract ? 'abstract ' : '';
    parts.push(`- ${abs}${cls.name}${ext} (${cls.filePath})`);
    for (const m of cls.methods.filter((m) => m.isAbstract || m.isOverride)) {
      parts.push(`    ${m.signature}`);
    }
  }

  // Hooks
  parts.push('\n## Hooks');
  for (const hook of patterns.hooks) {
    const abs = hook.isAbstract ? ' [ABSTRACT]' : '';
    parts.push(`- ${hook.declaringClass}::${hook.name}${abs}`);
  }

  // Config extensions
  if (patterns.configExtensions.length > 0) {
    parts.push('\n## Config Extensions (beyond M0 baseline)');
    for (const cf of patterns.configExtensions) {
      parts.push(`- ${cf.path}: ${JSON.stringify(cf.value)} (${cf.type})`);
    }
  }

  // Code snippets (limited to key files)
  parts.push('\n## Key Source Code');
  const snippetEntries = Object.entries(patterns.codeSnippets);
  for (const [filePath, code] of snippetEntries.slice(0, 8)) {
    const truncated = code.slice(0, 3000);
    parts.push(`\n### ${filePath}\n\`\`\`typescript\n${truncated}\n\`\`\``);
  }

  parts.push(
    '\n\nGeneralize this into a reusable template family. ' +
      'Replace game-specific content with placeholders. ' +
      'Focus on the BASE CLASSES and SYSTEMS that would be reusable across different games of this archetype. ' +
      'Output JSON only.',
  );

  return parts.join('\n');
}

// -----------------------------------------------------------------------------
// Parse LLM response
// -----------------------------------------------------------------------------

interface LLMAbstractionResponse {
  templateFiles: Array<{
    relativePath: string;
    content: string;
    role: string;
  }>;
  summary: string;
}

function parseLLMResponse(raw: string): LLMAbstractionResponse {
  let jsonStr = raw.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr
      .replace(/```json?\n?/g, '')
      .replace(/```/g, '')
      .trim();
  }

  return JSON.parse(jsonStr) as LLMAbstractionResponse;
}

// -----------------------------------------------------------------------------
// Fallback: rule-based abstraction (when LLM unavailable)
// -----------------------------------------------------------------------------

function abstractByRules(patterns: ExtractedPatterns): AbstractedTemplates {
  const templateFiles: TemplateFileDef[] = [];

  // Promote base classes from the extracted code
  for (const [filePath, code] of Object.entries(patterns.codeSnippets)) {
    if (/Base\w+/.test(filePath)) {
      templateFiles.push({
        relativePath: filePath,
        content: code,
        role: 'base_class',
      });
    } else if (/_Template\w+/.test(filePath)) {
      templateFiles.push({
        relativePath: filePath,
        content: code,
        role: 'copy_template',
      });
    } else if (/utils\.ts$/.test(filePath)) {
      templateFiles.push({
        relativePath: filePath,
        content: code,
        role: 'utility',
      });
    }
  }

  return {
    archetype: patterns.archetype,
    templateFiles,
    hooks: patterns.hooks,
    configSchema: patterns.configExtensions,
    summary:
      `Rule-based abstraction for ${patterns.archetype}: ` +
      `${templateFiles.length} template files, ${patterns.hooks.length} hooks`,
  };
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

/**
 * Abstract extracted patterns into generalized, reusable templates.
 * Tries LLM first, falls back to rule-based extraction.
 */
export async function abstractPatterns(
  patterns: ExtractedPatterns,
): Promise<AbstractedTemplates> {
  const config = getAbstractorConfig();

  if (config.apiKey) {
    try {
      console.log(`[Abstractor] Calling LLM (${config.modelName})...`);
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(patterns);
      const raw = await callLLM(config, systemPrompt, userPrompt);
      const parsed = parseLLMResponse(raw);

      const templateFiles: TemplateFileDef[] = parsed.templateFiles.map(
        (f) => ({
          relativePath: f.relativePath,
          content: f.content,
          role: f.role as TemplateFileDef['role'],
        }),
      );

      console.log(
        `[Abstractor] LLM produced ${templateFiles.length} template files`,
      );

      return {
        archetype: patterns.archetype,
        templateFiles,
        hooks: patterns.hooks,
        configSchema: patterns.configExtensions,
        summary: parsed.summary,
      };
    } catch (e) {
      console.warn(`[Abstractor] LLM failed, falling back to rules: ${e}`);
    }
  } else {
    console.log('[Abstractor] No API key, using rule-based abstraction');
  }

  const result = abstractByRules(patterns);
  console.log(
    `[Abstractor] Rule-based: ${result.templateFiles.length} template files`,
  );
  return result;
}

import type {
  ProjectSnapshot,
  ClassificationResult,
  TemplateLibrary,
  TemplateFamily,
} from './types.js';
import { getClassifierConfig, type LLMConfig } from './config.js';

// =============================================================================
// Classifier -- Library-aware, emergent archetype classification
//
// Key design principle: NO predefined archetype categories.
// - When the library is empty, the LLM freely names the physics regime it
//   observes in the code. This becomes the first family label.
// - When the library already contains families, the LLM is shown their
//   physics profiles and decides whether the new project matches an existing
//   family or represents a genuinely new regime.
// - The rule-based fallback also uses library state, matching against code
//   signatures previously recorded in each family.
// =============================================================================

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message: string };
}

// -----------------------------------------------------------------------------
// Prompt construction
// -----------------------------------------------------------------------------

function buildSystemPrompt(library: TemplateLibrary): string {
  const familySection =
    library.families.length > 0
      ? buildExistingFamiliesSection(library.families)
      : `## Existing Families\nNone yet. You are naming the FIRST physics regime ever observed.\n`;

  return `# Game Project Physics Classifier

You analyze COMPLETED game project source code to determine its physics and
interaction regime. You do NOT rely on genre names -- you observe the actual
physics, perspective, and movement system in the code.

${familySection}
## Your Task

1. Analyze the source code for three physical properties:
   - **hasGravity**: Does the code apply Y-axis gravity? (setGravityY, jumpPower, fall logic)
   - **perspective**: Is the camera side-view, top-down, or not applicable?
   - **movementType**: Is movement continuous, grid-discrete, path-following, or UI-only?

2. Decide classification:
${
  library.families.length > 0
    ? `   - If the physics profile MATCHES an existing family, use that family's archetype name.
   - If the physics profile is CLEARLY DIFFERENT from all existing families, invent a
     short, descriptive snake_case label (e.g., "side_gravity", "free_top_down",
     "discrete_grid", "path_wave", "ui_state_machine"). The label should describe the
     PHYSICS, not the genre.`
    : `   - Invent a short, descriptive snake_case label for the physics regime you observe
     (e.g., "side_gravity", "free_top_down", "discrete_grid"). The label should
     describe the PHYSICS and INTERACTION model, not a genre name.`
}

## Output Format

Respond with ONLY a JSON object:
{
  "archetype": "<snake_case label>",
  "reasoning": "Brief explanation citing specific code evidence",
  "physicsProfile": {
    "hasGravity": true | false,
    "perspective": "side" | "top_down" | "none",
    "movementType": "continuous" | "grid" | "path" | "ui_only"
  },
  "confidence": 0.0 to 1.0,
  "isNewFamily": true | false
}`;
}

function buildExistingFamiliesSection(families: TemplateFamily[]): string {
  const lines = ['## Existing Families in the Library\n'];
  for (const f of families) {
    const pp = f.physicsProfile;
    lines.push(
      `### "${f.archetype}" (stability: ${(f.stability * 100).toFixed(0)}%, projects: ${f.contributingProjects.length})`,
    );
    lines.push(
      `- gravity: ${pp.hasGravity}, perspective: ${pp.perspective}, movement: ${pp.movementType}`,
    );
    lines.push(`- summary: ${f.summary}`);
    lines.push('');
  }
  lines.push(
    'If the new project clearly fits one of these, reuse its archetype name.',
  );
  lines.push(
    'Only create a new archetype if the physics regime is fundamentally different.\n',
  );
  return lines.join('\n');
}

function buildUserPrompt(snapshot: ProjectSnapshot): string {
  const truncatedSummary = snapshot.codeSummary.slice(0, 12_000);
  return `Classify this completed game project based on its source code.

## File Tree
${snapshot.fileTree.join('\n')}

## Code Analysis
${truncatedSummary}

Analyze the PHYSICS, PERSPECTIVE, and MOVEMENT in the actual code. Output JSON only.`;
}

// -----------------------------------------------------------------------------
// LLM call
// -----------------------------------------------------------------------------

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
// Parse LLM response
// -----------------------------------------------------------------------------

function parseClassification(raw: string): ClassificationResult {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr
      .replace(/```json?\n?/g, '')
      .replace(/```/g, '')
      .trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      archetype: parsed.archetype ?? 'unknown',
      reasoning: parsed.reasoning ?? '',
      physicsProfile: parsed.physicsProfile ?? {
        hasGravity: false,
        perspective: 'none',
        movementType: 'continuous',
      },
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return classifyByPhysicsHeuristics(raw, []);
  }
}

// -----------------------------------------------------------------------------
// Rule-based fallback -- NO predefined categories
//
// Instead of hardcoded archetype names, we detect physics SIGNALS and build
// a profile, then match against existing families or mint a new label.
// -----------------------------------------------------------------------------

interface PhysicsSignal {
  name: string;
  patterns: RegExp[];
  profileHint: {
    hasGravity: boolean;
    perspective: string;
    movementType: string;
  };
}

const PHYSICS_SIGNALS: PhysicsSignal[] = [
  {
    name: 'gravity',
    patterns: [
      /setGravityY/i,
      /jumpPower/i,
      /PlatformerMovement/i,
      /coyoteTime/i,
      /gravity\s*[:=]\s*\{?\s*y\s*:/i,
    ],
    profileHint: {
      hasGravity: true,
      perspective: 'side',
      movementType: 'continuous',
    },
  },
  {
    name: 'free_movement',
    patterns: [
      /EightWayMovement/i,
      /DashAbility/i,
      /ySortGroup/i,
      /FaceTarget/i,
    ],
    profileHint: {
      hasGravity: false,
      perspective: 'top_down',
      movementType: 'continuous',
    },
  },
  {
    name: 'grid_discrete',
    patterns: [
      /BoardManager/i,
      /cellSize/i,
      /gridCols/i,
      /BaseGridScene/i,
      /worldToGrid/i,
    ],
    profileHint: {
      hasGravity: false,
      perspective: 'top_down',
      movementType: 'grid',
    },
  },
  {
    name: 'path_wave',
    patterns: [
      /WaveManager/i,
      /EconomyManager/i,
      /BaseTDScene/i,
      /BaseTower/i,
      /waypoints/i,
    ],
    profileHint: {
      hasGravity: false,
      perspective: 'top_down',
      movementType: 'path',
    },
  },
  {
    name: 'ui_state',
    patterns: [
      /DialogueManager/i,
      /CardManager/i,
      /QuizManager/i,
      /BaseBattleScene/i,
      /ComboManager/i,
    ],
    profileHint: {
      hasGravity: false,
      perspective: 'none',
      movementType: 'ui_only',
    },
  },
];

/**
 * Detect physics signals in code and produce a profile + tentative label.
 * Then try to match against existing families.
 */
export function classifyByPhysicsHeuristics(
  code: string,
  existingFamilies: TemplateFamily[],
): ClassificationResult {
  // Score each signal group
  const signalScores: Array<{ signal: PhysicsSignal; score: number }> = [];
  for (const signal of PHYSICS_SIGNALS) {
    let score = 0;
    for (const pat of signal.patterns) {
      if (pat.test(code)) score += 1;
    }
    signalScores.push({ signal, score });
  }

  signalScores.sort((a, b) => b.score - a.score);
  const best = signalScores[0]!;
  const totalMatches = signalScores.reduce((s, v) => s + v.score, 0);

  if (totalMatches === 0) {
    return {
      archetype: 'unknown',
      reasoning: 'No recognizable physics signals found in code',
      physicsProfile: {
        hasGravity: false,
        perspective: 'none',
        movementType: 'continuous',
      },
      confidence: 0.1,
    };
  }

  const detectedProfile = {
    hasGravity: best.signal.profileHint.hasGravity,
    perspective: best.signal.profileHint.perspective as
      | 'side'
      | 'top_down'
      | 'none',
    movementType: best.signal.profileHint.movementType as
      | 'continuous'
      | 'grid'
      | 'path'
      | 'ui_only',
  };

  // Try to match against an existing family by physics profile
  for (const family of existingFamilies) {
    const fp = family.physicsProfile;
    if (
      fp.hasGravity === detectedProfile.hasGravity &&
      fp.perspective === detectedProfile.perspective &&
      fp.movementType === detectedProfile.movementType
    ) {
      return {
        archetype: family.archetype,
        reasoning:
          `Heuristic match to existing family "${family.archetype}" ` +
          `(signal: ${best.signal.name}, score: ${best.score}/${totalMatches})`,
        physicsProfile: detectedProfile,
        confidence: totalMatches > 0 ? best.score / totalMatches : 0.2,
      };
    }
  }

  // No existing family matches -- mint a new label from the signal name
  return {
    archetype: best.signal.name,
    reasoning:
      `New regime detected via heuristic signal "${best.signal.name}" ` +
      `(score: ${best.score}/${totalMatches})`,
    physicsProfile: detectedProfile,
    confidence: totalMatches > 0 ? best.score / totalMatches : 0.2,
  };
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

/**
 * Classify a completed project's archetype.
 *
 * The classifier is LIBRARY-AWARE:
 * - It receives the current library state so it can compare against
 *   existing families before creating a new archetype.
 * - When the library is empty, it freely names the first physics regime.
 * - Tries LLM first; falls back to physics-heuristic rules.
 */
export async function classifyProject(
  snapshot: ProjectSnapshot,
  library: TemplateLibrary,
): Promise<ClassificationResult> {
  const config = getClassifierConfig();

  const allCode = snapshot.files
    .filter((f) => f.extension === '.ts')
    .map((f) => f.content)
    .join('\n');

  // Try LLM classification (library-aware prompt)
  if (config.apiKey) {
    try {
      console.log(
        `[Classifier] Calling LLM (${config.modelName}), ` +
          `library has ${library.families.length} existing families...`,
      );
      const systemPrompt = buildSystemPrompt(library);
      const userPrompt = buildUserPrompt(snapshot);
      const raw = await callLLM(config, systemPrompt, userPrompt);
      const result = parseClassification(raw);
      console.log(
        `[Classifier] LLM result: "${result.archetype}" (confidence: ${result.confidence})`,
      );
      return result;
    } catch (e) {
      console.warn(`[Classifier] LLM failed, falling back to heuristics: ${e}`);
    }
  } else {
    console.log(
      '[Classifier] No API key configured, using heuristic classification',
    );
  }

  // Fallback: physics-heuristic classification (also library-aware)
  const result = classifyByPhysicsHeuristics(allCode, library.families);
  console.log(
    `[Classifier] Heuristic result: "${result.archetype}" (confidence: ${result.confidence})`,
  );
  return result;
}

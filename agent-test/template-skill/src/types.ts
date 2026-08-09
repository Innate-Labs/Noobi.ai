// =============================================================================
// Template Skill — Core Type Definitions
// =============================================================================

/**
 * Game archetype label — NOT a fixed enum.
 * New archetypes emerge dynamically as the library evolves through
 * experience accumulation. The initial library has zero archetypes;
 * labels like "platformer" or "grid_logic" are discovered, not assumed.
 */
export type GameArchetype = string;

// -----------------------------------------------------------------------------
// Physics Profile
// -----------------------------------------------------------------------------

export interface PhysicsProfile {
  hasGravity: boolean;
  perspective: 'side' | 'top_down' | 'none';
  movementType: 'continuous' | 'grid' | 'path' | 'ui_only';
}

// -----------------------------------------------------------------------------
// Project Snapshot (Collector output)
// -----------------------------------------------------------------------------

export interface FileEntry {
  /** Relative path from project root, e.g. "src/scenes/Level1Scene.ts" */
  relativePath: string;
  content: string;
  extension: string;
}

export interface ProjectSnapshot {
  projectPath: string;
  files: FileEntry[];
  fileTree: string[];
  gameConfig: Record<string, unknown> | null;
  /** Human-readable summary for LLM context */
  codeSummary: string;
}

// -----------------------------------------------------------------------------
// Classification Result (Classifier output)
// -----------------------------------------------------------------------------

export interface ClassificationResult {
  archetype: GameArchetype;
  reasoning: string;
  physicsProfile: PhysicsProfile;
  confidence: number;
}

// -----------------------------------------------------------------------------
// Extracted Patterns (Extractor output)
// -----------------------------------------------------------------------------

export interface ClassDef {
  name: string;
  parentClass: string | null;
  filePath: string;
  isAbstract: boolean;
  methods: MethodDef[];
}

export interface MethodDef {
  name: string;
  visibility: 'public' | 'protected' | 'private';
  isAbstract: boolean;
  isOverride: boolean;
  /** Simplified signature string */
  signature: string;
}

export interface HookDef {
  name: string;
  /** Which base class declares this hook */
  declaringClass: string;
  signature: string;
  isAbstract: boolean;
  /** How many projects use this hook */
  occurrenceCount: number;
}

export interface ImportEdge {
  fromFile: string;
  toFile: string;
  importedNames: string[];
}

export interface DirectoryPattern {
  /** e.g., ["behaviors", "characters", "scenes"] */
  directories: string[];
  /** e.g., { "behaviors": ["PatrolAI.ts", "ChaseAI.ts"], ... } */
  filesByDirectory: Record<string, string[]>;
}

export interface ConfigField {
  path: string;
  value: unknown;
  type: string;
  description?: string;
}

export interface ExtractedPatterns {
  archetype: GameArchetype;
  physicsProfile: PhysicsProfile;
  projectPath: string;
  fileStructure: DirectoryPattern;
  classes: ClassDef[];
  hooks: HookDef[];
  configExtensions: ConfigField[];
  imports: ImportEdge[];
  /** Raw code snippets for base classes / key files */
  codeSnippets: Record<string, string>;
}

// -----------------------------------------------------------------------------
// Abstracted Templates (Abstractor output)
// -----------------------------------------------------------------------------

export interface TemplateFileDef {
  /** Relative path in the family, e.g. "src/scenes/BaseLevelScene.ts" */
  relativePath: string;
  /** Generalized content (game-specific names replaced with placeholders) */
  content: string;
  /** Role: base_class, copy_template, system, behavior, utility */
  role: 'base_class' | 'copy_template' | 'system' | 'behavior' | 'utility';
}

export interface AbstractedTemplates {
  archetype: GameArchetype;
  templateFiles: TemplateFileDef[];
  hooks: HookDef[];
  configSchema: ConfigField[];
  /** Natural-language summary of what this family provides */
  summary: string;
}

// -----------------------------------------------------------------------------
// Template Family (Library unit)
// -----------------------------------------------------------------------------

export interface TemplateFamily {
  id: string;
  archetype: GameArchetype;
  physicsProfile: PhysicsProfile;
  /** Which task number first discovered this family */
  discoveredAtTask: number;
  /** Paths of projects that contributed to this family */
  contributingProjects: string[];
  /** 0–1 score: higher = more projects have reinforced this family */
  stability: number;
  fileStructure: DirectoryPattern;
  baseClasses: ClassDef[];
  hooks: HookDef[];
  configExtensions: ConfigField[];
  templateFiles: TemplateFileDef[];
  summary: string;
}

// -----------------------------------------------------------------------------
// Evolution Log Entry
// -----------------------------------------------------------------------------

export interface EvolutionEntry {
  taskId: string;
  timestamp: string;
  projectPath: string;
  archetype: GameArchetype;
  action: 'created_family' | 'merged_to_family';
  familyId: string;
  patternsExtracted: number;
  patternsMerged: number;
}

// -----------------------------------------------------------------------------
// Template Library (top-level persistent state)
// -----------------------------------------------------------------------------

export interface TemplateLibrary {
  version: number;
  createdAt: string;
  updatedAt: string;
  metaTemplatePath: string;
  families: TemplateFamily[];
  evolutionLog: EvolutionEntry[];
}

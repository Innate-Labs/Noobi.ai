export type PipelineStage =
  | 'brief'
  | 'scaffold'
  | 'gdd'
  | 'assets'
  | 'world'
  | 'code'
  | 'verify'
  | 'complete';

export type ProjectStatus =
  | 'draft'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'stopped';

export const TARGET_FRAME_RATES = [30, 60, 120] as const;
export type TargetFrameRate = (typeof TARGET_FRAME_RATES)[number];
export const DEFAULT_TARGET_FRAME_RATE: TargetFrameRate = 60;

export const GAME_ENGINES = ['web', 'godot'] as const;
export type GameEngine = (typeof GAME_ENGINES)[number];
export const DEFAULT_GAME_ENGINE: GameEngine = 'web';

export const NOOBI_SCENE_IDS = ['collaboration', 'fishing'] as const;
export type NoobiSceneId = (typeof NOOBI_SCENE_IDS)[number];
export const DEFAULT_NOOBI_SCENE_ID: NoobiSceneId = 'collaboration';

export const NOOBI_STAGE_MODES = ['solo', 'crew'] as const;
export type NoobiStageMode = (typeof NOOBI_STAGE_MODES)[number];
export const DEFAULT_NOOBI_STAGE_MODE: NoobiStageMode = 'solo';

export const NOOBI_PACK_IDS = [
  'classic',
  'mosslight',
  'starforge',
  'twilight',
  'hellokitty',
] as const;
export type NoobiPackId = (typeof NOOBI_PACK_IDS)[number];
export const DEFAULT_NOOBI_PACK_ID: NoobiPackId = 'classic';
export const DEFAULT_NOOBI_SOLO_SCENE_ID: NoobiPackId = 'classic';

export const NOOBI_CREW_ROLES = ['planner', 'artist', 'engineer', 'tester'] as const;
export type NoobiCrewRole = (typeof NOOBI_CREW_ROLES)[number];
export const NOOBI_CREW_MIN_SIZE = 2;
export const NOOBI_CREW_MAX_SIZE = 4;

/** Persisted crew identity. Visual assets are resolved from packId at render time. */
export interface NoobiCrewMember {
  packId: NoobiPackId;
  role: NoobiCrewRole;
}

export const DEFAULT_NOOBI_CREW: readonly NoobiCrewMember[] = [
  { packId: 'classic', role: 'planner' },
  { packId: 'twilight', role: 'artist' },
  { packId: 'hellokitty', role: 'engineer' },
  { packId: 'starforge', role: 'tester' },
] as const;

export function isGameEngine(value: unknown): value is GameEngine {
  return typeof value === 'string' && GAME_ENGINES.some((engine) => engine === value);
}

export function isNoobiSceneId(value: unknown): value is NoobiSceneId {
  return typeof value === 'string' && NOOBI_SCENE_IDS.some((sceneId) => sceneId === value);
}

export function isNoobiStageMode(value: unknown): value is NoobiStageMode {
  return typeof value === 'string' && NOOBI_STAGE_MODES.some((mode) => mode === value);
}

export function isNoobiPackId(value: unknown): value is NoobiPackId {
  return typeof value === 'string' && NOOBI_PACK_IDS.some((packId) => packId === value);
}

export function isNoobiCrewRole(value: unknown): value is NoobiCrewRole {
  return typeof value === 'string' && NOOBI_CREW_ROLES.some((role) => role === value);
}

export function isNoobiCrew(value: unknown): value is NoobiCrewMember[] {
  if (!Array.isArray(value)
    || value.length < NOOBI_CREW_MIN_SIZE
    || value.length > NOOBI_CREW_MAX_SIZE) return false;
  const packIds = new Set<NoobiPackId>();
  const roles = new Set<NoobiCrewRole>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const member = candidate as Record<string, unknown>;
    if (Object.keys(member).some((key) => key !== 'packId' && key !== 'role')
      || !isNoobiPackId(member.packId)
      || !isNoobiCrewRole(member.role)
      || packIds.has(member.packId)
      || roles.has(member.role)) return false;
    packIds.add(member.packId);
    roles.add(member.role);
  }
  return true;
}

export function isTargetFrameRate(value: unknown): value is TargetFrameRate {
  return typeof value === 'number'
    && TARGET_FRAME_RATES.some((frameRate) => frameRate === value);
}

export interface ProjectRecord {
  id: string;
  name: string;
  /** Pinned projects stay above recently updated projects in navigation. */
  pinned: boolean;
  idea: string;
  root: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  stage: PipelineStage;
  /** Creation-time Engine Advisor decision. Existing projects migrate to web. */
  engine: GameEngine;
  /** Host-selected simulation/presentation target for generated game code and animation variants. */
  targetFrameRate: TargetFrameRate;
  /** Null follows the app-wide default; otherwise this project keeps its own production-studio pack. */
  noobiPackOverrideId: NoobiPackId | null;
  /** Null follows the app-wide crew. Members persist identity and role only. */
  noobiCrewOverride: NoobiCrewMember[] | null;
  model: string | null;
  threadId: string | null;
  /** Version of the host dynamic-tool contract persisted on threadId. */
  toolsetVersion: number;
  activeTurnId: string | null;
  lastError: string | null;
}

export type AgentEventKind =
  | 'user'
  | 'lifecycle'
  | 'assistant'
  | 'thought'
  | 'tool'
  | 'file'
  | 'plan'
  | 'approval'
  | 'error';

export interface AgentEvent {
  id: string;
  projectId: string;
  kind: AgentEventKind;
  title: string;
  message: string;
  stage: PipelineStage;
  timestamp: string;
  method?: string;
  itemId?: string;
  isDelta?: boolean;
}

export interface ModelOption {
  id: string;
  model: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  defaultEffort: string;
  efforts: string[];
}

export interface RuntimeAccount {
  type: string;
  email: string | null;
  planType: string | null;
}

export interface RuntimeCapabilities {
  namespaceTools: boolean;
  imageGeneration: boolean;
  /** App-private external image provider is configured and usable. */
  externalImageGeneration: boolean;
  webSearch: boolean;
}

export interface RuntimeStatus {
  state: 'stopped' | 'starting' | 'ready' | 'error';
  binaryPath: string | null;
  version: string | null;
  codexHome: string | null;
  account: RuntimeAccount | null;
  models: ModelOption[];
  capabilities: RuntimeCapabilities;
  error: string | null;
}

export interface AppSettings {
  defaultWorkspace: string;
  defaultModel: string | null;
  defaultEffort: string;
  defaultNoobiStageMode: NoobiStageMode;
  defaultNoobiSoloSceneId: NoobiPackId;
  defaultNoobiSceneId: NoobiSceneId;
  defaultNoobiPackId: NoobiPackId;
  defaultNoobiCrew: NoobiCrewMember[];
  theme: 'dark' | 'light';
}

export type EnvironmentToolId = 'node' | 'codex' | 'godot';
export type EnvironmentToolState = 'ready' | 'missing' | 'incompatible' | 'error';
export type EnvironmentToolSource =
  | 'process'
  | 'bundled'
  | 'configured'
  | 'environment'
  | 'path'
  | 'application';

export interface EnvironmentToolStatus {
  id: EnvironmentToolId;
  label: string;
  state: EnvironmentToolState;
  version: string | null;
  binaryPath: string | null;
  configuredPath: string | null;
  source: EnvironmentToolSource | null;
  message: string;
}

export interface GodotExportTemplatesStatus {
  state: 'ready' | 'missing' | 'unknown';
  /** Exact directory tag required by the detected editor, for example `4.7.1.stable`. */
  expectedVersion: string | null;
  basePath: string | null;
  versionPath: string | null;
  installedVersions: string[];
  targets: {
    web: boolean;
    macos: boolean;
    windows: boolean;
    linux: boolean;
  };
  issues: string[];
}

export interface EnvironmentStatusSnapshot {
  state: 'ready' | 'attention' | 'blocked';
  tools: EnvironmentToolStatus[];
  exportTemplates: GodotExportTemplatesStatus;
  canCreateGodotProjects: boolean;
  canExportGodotProjects: boolean;
  checkedAt: string;
}

export interface BootstrapPayload {
  projects: ProjectRecord[];
  settings: AppSettings;
  runtime: RuntimeStatus;
  events?: Record<string, AgentEvent[]>;
}

export interface CreateProjectInput {
  idea: string;
  projectDirectory: string;
  model?: string | null;
}

/** Main-only store input. Renderer creation requests never choose the engine or a parent directory. */
export interface ProjectStoreCreateInput {
  name: string;
  idea: string;
  /** Legacy/internal path: the store creates a unique child directory below this parent. */
  parentDirectory?: string;
  /** User-selected path: the store initializes this exact empty directory. */
  projectDirectory?: string;
  model?: string | null;
  /** Omitted only by legacy/store tests, where it migrates to the browser engine. */
  engine?: GameEngine;
}

export interface RunProjectInput {
  projectId: string;
  prompt: string;
  model?: string | null;
  effort?: string | null;
}

export interface FileNode {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

export interface FileReadResult {
  relativePath: string;
  content: string;
  truncated: boolean;
  binary: boolean;
}

export type GameAssetKind = 'image' | 'audio' | 'model3d';
export type GameAssetSource = 'generated' | 'imported' | 'procedural';

export interface GameAssetRecord {
  id: string;
  name: string;
  kind: GameAssetKind;
  source: GameAssetSource;
  relativePath: string;
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  prompt?: string;
  provider?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface GameAssetManifest {
  version: 1;
  projectId: string;
  updatedAt: string;
  assets: GameAssetRecord[];
}

/** Host-owned lifecycle for an expected asset. Unlike GameAssetRecord, these
 * entries may exist before any file has been created. */
export type AssetPlanStatus =
  | 'planned'
  | 'queued'
  | 'generating'
  | 'waiting-agent'
  | 'generated'
  | 'ready'
  | 'failed';

export type AssetPlanRoute =
  | 'configured-api'
  | 'codex-imagegen'
  | 'procedural-audio'
  | 'threejs-fallback'
  | 'workspace-agent';

export interface AssetPlanError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AssetPlanRecord {
  id: string;
  projectId: string;
  name: string;
  kind: GameAssetKind;
  prompt: string;
  required: boolean;
  status: AssetPlanStatus;
  attemptCount: number;
  /** Validated generation options only; secrets and provider endpoints never appear here. */
  options?: Record<string, string | number | boolean>;
  model?: string;
  assetId?: string;
  relativePath?: string;
  sha256?: string;
  referencedBy?: string;
  route?: AssetPlanRoute;
  error?: AssetPlanError;
  createdAt: string;
  updatedAt: string;
}

export interface ImageGenerationGate {
  state: 'missing' | 'trusted-unreferenced' | 'trusted-referenced';
  /** Project-relative paths proven by the app-private host attestation ledger. */
  relativePaths: string[];
}

export type GameplayExperienceVerdict = 'pass' | 'repair';

export type GameplayExperienceCheckId =
  | 'load'
  | 'runtime-errors'
  | 'visible-surface'
  | 'input-response'
  | 'continuous-render'
  | 'restart';

export type GameplayExperienceCheckStatus = 'pass' | 'repair' | 'skipped';

/** One observable playtest assertion. These are host-authored results rather
 * than claims made by the generated game or its workspace agent. */
export interface GameplayExperienceCheck {
  id: GameplayExperienceCheckId;
  label: string;
  status: GameplayExperienceCheckStatus;
  message: string;
  durationMs?: number;
}

/** A compact, persisted summary of the latest automated play session. */
export interface GameplayExperienceReport {
  version: 1;
  verdict: GameplayExperienceVerdict;
  /** Normalized host score, clamped by the producer to the inclusive 0–100 range. */
  score: number;
  checkedAt: string;
  durationMs?: number;
  reportPath: string;
  summary?: string;
  checks: GameplayExperienceCheck[];
}

export interface ProjectInspectorPayload {
  files: FileNode[];
  previewUrl: string;
  assets: GameAssetRecord[];
  assetPlans: AssetPlanRecord[];
  imageGenerationGate: ImageGenerationGate;
  experienceReport: GameplayExperienceReport | null;
}

export type MediaCapability = GameAssetKind;
export type ConnectionStatus = 'unconfigured' | 'untested' | 'testing' | 'ready' | 'error';

export interface MediaProviderSetting {
  capability: MediaCapability;
  provider: string;
  model: string;
  endpoint: string;
  enabled: boolean;
  hasApiKey: boolean;
  keyHint: string | null;
  status: ConnectionStatus;
  statusMessage: string | null;
  lastTestedAt: string | null;
}

export interface SaveMediaProviderInput {
  capability: MediaCapability;
  provider: string;
  model: string;
  endpoint: string;
  enabled: boolean;
  /** Write-only. Omit to retain the persisted secret. */
  apiKey?: string;
}

export interface MediaProviderTestResult {
  capability: MediaCapability;
  ok: boolean;
  message: string;
  latencyMs?: number;
  testedAt: string;
}

export interface SkillSetting {
  id: string;
  name: string;
  description: string;
  source: 'built-in' | 'user' | 'plugin' | 'workspace';
  path: string | null;
  enabled: boolean;
}

export interface McpServerSetting {
  id: string;
  transport: 'stdio' | 'http';
  command: string | null;
  args: string[];
  url: string | null;
  enabled: boolean;
  bearerTokenEnvVar: string | null;
  status: 'connected' | 'starting' | 'stopped' | 'error';
  statusMessage: string | null;
}

export interface SaveMcpServerInput {
  id: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  /** Environment-variable name only; secret values never cross IPC. */
  bearerTokenEnvVar?: string;
}

export type PromptTemplateId = 'planner' | 'implementer' | 'reviewer' | 'repair';

export interface PromptTemplateSetting {
  id: PromptTemplateId;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  customized: boolean;
}

export interface ExtensionSettingsSnapshot {
  mediaProviders: MediaProviderSetting[];
  skills: SkillSetting[];
  mcpServers: McpServerSetting[];
  promptTemplates: PromptTemplateSetting[];
}

export type ApprovalKind = 'command' | 'file' | 'permissions' | 'input';

export interface ApprovalRequest {
  token: string;
  projectId: string | null;
  kind: ApprovalKind;
  method: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel';
export type ApprovalAnswers = Record<string, string[]>;

export interface LoginStartResult {
  type: string;
  loginId?: string;
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}

export interface NoobiApi {
  bootstrap(): Promise<BootstrapPayload>;
  refreshRuntime(): Promise<RuntimeStatus>;
  startLogin(): Promise<LoginStartResult>;
  logout(): Promise<RuntimeStatus>;
  chooseDirectory(): Promise<string | null>;
  chooseProjectDirectory(): Promise<string | null>;
  /** Files stay opaque in Renderer; Preload resolves their native paths for Main. */
  createProject(input: CreateProjectInput, files?: readonly unknown[]): Promise<ProjectRecord>;
  renameProject(projectId: string, name: string): Promise<ProjectRecord>;
  setProjectPinned(projectId: string, pinned: boolean): Promise<ProjectRecord>;
  /** Permanently removes the catalog record and its verified workspace directory. */
  deleteProject(projectId: string): Promise<ProjectRecord>;
  runProject(input: RunProjectInput): Promise<ProjectRecord>;
  stopProject(projectId: string): Promise<ProjectRecord>;
  /** Opens the project folder, prompting to reconnect it first if it was moved or renamed. */
  revealProject(projectId: string): Promise<ProjectRecord | null>;
  importProjectAssets(projectId: string): Promise<GameAssetRecord[]>;
  /** Files are resolved to native paths in preload and validated again by AssetStore in Main. */
  importDroppedProjectAssets(projectId: string, files: readonly unknown[]): Promise<GameAssetRecord[]>;
  /** Queues a host-owned expected asset for a later Agent retry. */
  retryAssetPlan(projectId: string, planId: string): Promise<AssetPlanRecord>;
  inspectProject(projectId: string): Promise<ProjectInspectorPayload>;
  /** Runs the host-owned hidden-browser playtest against the production build. */
  evaluateProjectExperience(projectId: string): Promise<GameplayExperienceReport>;
  /** Cancels a manually requested experience playtest, if one is active. */
  cancelProjectExperience(projectId: string): Promise<void>;
  readProjectFile(projectId: string, relativePath: string): Promise<FileReadResult>;
  /** Pass null to make the project follow the app-wide Noobi production pack again. */
  saveProjectNoobiPack(projectId: string, packId: NoobiPackId | null): Promise<ProjectRecord>;
  /** Pass null to make the project follow the app-wide Noobi crew again. */
  saveProjectNoobiCrew(
    projectId: string,
    crew: readonly NoobiCrewMember[] | null,
  ): Promise<ProjectRecord>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  getEnvironmentStatus(): Promise<EnvironmentStatusSnapshot>;
  refreshEnvironmentStatus(): Promise<EnvironmentStatusSnapshot>;
  chooseGodotExecutable(): Promise<string | null>;
  /** Pass null to clear the override and resume automatic Godot discovery. */
  saveGodotExecutable(binaryPath: string | null): Promise<EnvironmentStatusSnapshot>;
  getExtensionSettings(): Promise<ExtensionSettingsSnapshot>;
  saveMediaProvider(input: SaveMediaProviderInput): Promise<MediaProviderSetting>;
  testMediaProvider(capability: MediaCapability): Promise<MediaProviderTestResult>;
  listSkills(): Promise<SkillSetting[]>;
  setSkillEnabled(input: { id: string; enabled: boolean }): Promise<SkillSetting>;
  listMcpServers(): Promise<McpServerSetting[]>;
  saveMcpServer(input: SaveMcpServerInput): Promise<McpServerSetting>;
  removeMcpServer(id: string): Promise<void>;
  listPromptTemplates(): Promise<PromptTemplateSetting[]>;
  savePromptTemplate(input: {
    id: PromptTemplateId;
    content: string;
    enabled: boolean;
  }): Promise<PromptTemplateSetting>;
  resetPromptTemplate(id: PromptTemplateId): Promise<PromptTemplateSetting>;
  resolveApproval(
    token: string,
    decision: ApprovalDecision,
    answers?: ApprovalAnswers,
  ): Promise<void>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
  onProjectChanged(listener: (project: ProjectRecord) => void): () => void;
  onRuntimeChanged(listener: (status: RuntimeStatus) => void): () => void;
  onApproval(listener: (approval: ApprovalRequest) => void): () => void;
  onApprovalClosed(listener: (token: string) => void): () => void;
  onAssetsChanged(listener: (payload: { projectId: string; assets: GameAssetRecord[] }) => void): () => void;
  onAssetPlansChanged(listener: (payload: { projectId: string; assetPlans: AssetPlanRecord[] }) => void): () => void;
}

export const PIPELINE_STAGES: ReadonlyArray<{
  id: PipelineStage;
  label: string;
  short: string;
}> = [
  { id: 'brief', label: '需求拆解', short: 'BRIEF' },
  { id: 'scaffold', label: '工程骨架', short: 'SCAFFOLD' },
  { id: 'gdd', label: '玩法设计', short: 'GDD' },
  { id: 'assets', label: '素材准备', short: 'ASSETS' },
  { id: 'world', label: '场景关卡', short: 'WORLD' },
  { id: 'code', label: '代码实现', short: 'CODE' },
  { id: 'verify', label: '构建验证', short: 'VERIFY' },
  { id: 'complete', label: '完成交付', short: 'DONE' },
];

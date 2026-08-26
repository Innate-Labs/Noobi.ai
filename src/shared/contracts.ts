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

export function isTargetFrameRate(value: unknown): value is TargetFrameRate {
  return typeof value === 'number'
    && TARGET_FRAME_RATES.some((frameRate) => frameRate === value);
}

export interface ProjectRecord {
  id: string;
  name: string;
  idea: string;
  root: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  stage: PipelineStage;
  /** Host-selected simulation/presentation target for generated game code and animation variants. */
  targetFrameRate: TargetFrameRate;
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
  theme: 'dark' | 'light';
}

export interface BootstrapPayload {
  projects: ProjectRecord[];
  settings: AppSettings;
  runtime: RuntimeStatus;
  events?: Record<string, AgentEvent[]>;
}

export interface CreateProjectInput {
  name: string;
  idea: string;
  parentDirectory: string;
  model?: string | null;
  /** Defaults to 60 for new projects. */
  targetFrameRate?: TargetFrameRate;
}

export interface RunProjectInput {
  projectId: string;
  prompt: string;
  model?: string | null;
  effort?: string | null;
  /** Optional per-run selection; Main persists it before starting the Harness. */
  targetFrameRate?: TargetFrameRate;
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

export interface ImageGenerationGate {
  state: 'missing' | 'trusted-unreferenced' | 'trusted-referenced';
  /** Project-relative paths proven by the app-private host attestation ledger. */
  relativePaths: string[];
}

export interface ProjectInspectorPayload {
  files: FileNode[];
  previewUrl: string;
  assets: GameAssetRecord[];
  imageGenerationGate: ImageGenerationGate;
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
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  runProject(input: RunProjectInput): Promise<ProjectRecord>;
  stopProject(projectId: string): Promise<ProjectRecord>;
  revealProject(projectId: string): Promise<void>;
  importProjectAssets(projectId: string): Promise<GameAssetRecord[]>;
  /** Files are resolved to native paths in preload and validated again by AssetStore in Main. */
  importDroppedProjectAssets(projectId: string, files: readonly unknown[]): Promise<GameAssetRecord[]>;
  inspectProject(projectId: string): Promise<ProjectInspectorPayload>;
  readProjectFile(projectId: string, relativePath: string): Promise<FileReadResult>;
  saveSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
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

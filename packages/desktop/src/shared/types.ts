export type PipelineStageId =
  | 'brief'
  | 'classify'
  | 'scaffold'
  | 'gdd'
  | 'assets'
  | 'tilemap'
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

export type AgentEventType =
  | 'user'
  | 'lifecycle'
  | 'thought'
  | 'assistant'
  | 'text_delta'
  | 'tool_call'
  | 'tool_result'
  | 'stderr'
  | 'error'
  | 'complete';

export interface AgentEvent {
  id: string;
  projectId: string;
  type: AgentEventType;
  stage: PipelineStageId;
  title: string;
  message: string;
  toolName?: string;
  isError?: boolean;
  timestamp: string;
}

export interface AgentHistoryResult {
  projectId: string;
  events: AgentEvent[];
  hasMore: boolean;
  source: 'persisted' | 'recording' | 'empty';
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  prompt: string;
  status: ProjectStatus;
  stage: PipelineStageId;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProviderName =
  | 'openai-compat'
  | 'tongyi'
  | 'doubao'
  | 'elevenlabs'
  | 'minimax'
  | 'stability'
  | 'google-lyria'
  | 'mureka';

export interface ProviderEndpoint {
  provider: ProviderName;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyConfigured?: boolean;
  apiKeyInherited?: boolean;
}

export type ProviderSlot = 'main' | 'reasoning' | 'image' | 'video' | 'audio';

export interface ProviderConnectionInput {
  slot: ProviderSlot;
  endpoint: ProviderEndpoint;
}

export interface ProviderConnectionResult {
  status: 'success' | 'warning' | 'error';
  message: string;
  latencyMs: number;
}

export interface AppSettings {
  main: ProviderEndpoint;
  reasoning: ProviderEndpoint;
  image: ProviderEndpoint;
  video: ProviderEndpoint;
  audio: ProviderEndpoint;
  defaultWorkspace: string;
  permissionMode: 'auto-edit' | 'yolo';
  developerMode: boolean;
}

export type ApiCallSource = 'agent' | 'connection-test' | 'asset';
export type ApiCallStatus = 'success' | 'warning' | 'error';

export interface ApiUsageRecord {
  id: string;
  provider: string;
  model?: string;
  slot?: string;
  projectId?: string;
  source: ApiCallSource;
  status: ApiCallStatus;
  durationMs: number;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  occurredAt: string;
}

export interface ApiUsageTotals {
  runs: number;
  calls: number;
  successes: number;
  warnings: number;
  failures: number;
  durationMs: number;
  averageDurationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export interface ProviderUsageSummary extends ApiUsageTotals {
  provider: string;
  lastCalledAt: string;
}

export interface ApiUsageSnapshot {
  generatedAt: string;
  totals: ApiUsageTotals;
  providers: ProviderUsageSummary[];
  recent: ApiUsageRecord[];
}

export type DesktopDependencyId =
  | 'npx'
  | 'uvx'
  | 'godot'
  | 'blender'
  | 'unity-hub'
  | 'unity-editor';

export type DependencyAction = 'install' | 'update' | 'open';
export type DependencyStatus = 'installed' | 'missing' | 'unsupported';

export interface DependencyInstallation {
  version?: string;
  path: string;
}

export interface DesktopDependency {
  id: DesktopDependencyId;
  name: string;
  description: string;
  status: DependencyStatus;
  path?: string;
  version?: string;
  installations?: DependencyInstallation[];
  availableActions: DependencyAction[];
  management: 'homebrew' | 'unity-hub' | 'manual';
  detail?: string;
}

export interface DependencyActionInput {
  id: string;
  action: string;
}

export interface DependencyOutput {
  stream: 'system' | 'stdout' | 'stderr';
  text: string;
}

export interface DependencyActionResult {
  id: DesktopDependencyId;
  action: DependencyAction;
  success: boolean;
  message: string;
  command: string;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type SkillLevel = 'project' | 'user';

export interface SkillSourceInfo {
  kind: 'github';
  repository: string;
  ref: string;
  path: string;
  url: string;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  level: SkillLevel;
  directory: string;
  valid: boolean;
  error?: string;
  source?: SkillSourceInfo;
}

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface SecretField {
  name: string;
  value: string;
  configured?: boolean;
}

export interface McpServerDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  transport: McpTransport;
  command: string;
  args: string[];
  cwd: string;
  url: string;
  timeoutMs: number;
  trust: boolean;
  env: SecretField[];
  headers: SecretField[];
}

export interface ExtensionsSnapshot {
  skills: SkillSummary[];
  skillDirectories: {
    user: string;
    project?: string;
  };
  mcpServers: McpServerDefinition[];
}

export interface ImportSkillInput {
  level: SkillLevel;
  projectId?: string;
}

export interface InstallGitHubSkillInput extends ImportSkillInput {
  url: string;
  path?: string;
  ref?: string;
}

export interface BootstrapState {
  projects: ProjectRecord[];
  settings: AppSettings;
  version: string;
  runtimeReady: boolean;
  runtimeMessage: string;
}

export interface CreateProjectInput {
  name: string;
  directory: string;
  prompt: string;
}

export interface StartAgentInput {
  projectId: string;
  prompt: string;
  resume?: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
}

export interface GameAgentAPI {
  bootstrap(): Promise<BootstrapState>;
  chooseDirectory(): Promise<string | null>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  testProviderConnection(
    input: ProviderConnectionInput,
  ): Promise<ProviderConnectionResult>;
  loadApiUsage(): Promise<ApiUsageSnapshot>;
  inspectDependencies(): Promise<DesktopDependency[]>;
  runDependencyAction(
    input: DependencyActionInput,
  ): Promise<DependencyActionResult | null>;
  startAgent(input: StartAgentInput): Promise<{ accepted: boolean }>;
  stopAgent(projectId: string): Promise<void>;
  loadAgentHistory(projectId: string): Promise<AgentHistoryResult>;
  listFiles(projectId: string): Promise<FileNode[]>;
  readFile(projectId: string, filePath: string): Promise<FileContent>;
  startPreview(projectId: string): Promise<string>;
  revealProject(projectId: string): Promise<void>;
  loadExtensions(projectId?: string): Promise<ExtensionsSnapshot>;
  saveMcpServers(
    servers: McpServerDefinition[],
  ): Promise<McpServerDefinition[]>;
  importSkill(input: ImportSkillInput): Promise<SkillSummary | null>;
  installGitHubSkill(input: InstallGitHubSkillInput): Promise<SkillSummary>;
  removeSkill(projectId: string | undefined, skillId: string): Promise<void>;
  revealSkill(projectId: string | undefined, skillId: string): Promise<void>;
  revealSkillDirectory(level: SkillLevel, projectId?: string): Promise<void>;
  openGitHubUrl(url: string): Promise<void>;
  onAgentEvent(callback: (event: AgentEvent) => void): () => void;
  onProjectUpdated(callback: (project: ProjectRecord) => void): () => void;
  onDependencyOutput(callback: (output: DependencyOutput) => void): () => void;
}

declare global {
  interface Window {
    gameAgent: GameAgentAPI;
  }
}

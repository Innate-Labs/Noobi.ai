import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  AgentEvent,
  AppSettings,
  ApprovalAnswers,
  ApprovalDecision,
  ApprovalRequest,
  AssetPlanRecord,
  BootstrapPayload,
  CreateProjectInput,
  EnvironmentStatusSnapshot,
  FileReadResult,
  GameAssetRecord,
  GameplayExperienceReport,
  ExtensionSettingsSnapshot,
  LoginStartResult,
  McpServerSetting,
  MediaCapability,
  MediaProviderSetting,
  MediaProviderTestResult,
  NoobiCrewMember,
  NoobiPackId,
  NoobiApi,
  PromptTemplateId,
  PromptTemplateSetting,
  ProjectInspectorPayload,
  ProjectRecord,
  RunProjectInput,
  RuntimeStatus,
  SaveMcpServerInput,
  SaveMediaProviderInput,
  SkillSetting,
} from '../shared/contracts.js';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: NoobiApi = {
  bootstrap: () => ipcRenderer.invoke('noobi:bootstrap') as Promise<BootstrapPayload>,
  refreshRuntime: () => ipcRenderer.invoke('noobi:runtime:refresh') as Promise<RuntimeStatus>,
  startLogin: () => ipcRenderer.invoke('noobi:runtime:login') as Promise<LoginStartResult>,
  logout: () => ipcRenderer.invoke('noobi:runtime:logout') as Promise<RuntimeStatus>,
  chooseDirectory: () => ipcRenderer.invoke('noobi:dialog:directory') as Promise<string | null>,
  chooseProjectDirectory: () =>
    ipcRenderer.invoke('noobi:dialog:project-directory') as Promise<string | null>,
  createProject: (input: CreateProjectInput, files: readonly unknown[] = []) => {
    if (!Array.isArray(files) || files.length > 50) {
      return Promise.reject(new Error('一次最多上传 50 个附件'));
    }
    let paths: string[];
    try {
      paths = files.map((file) => webUtils.getPathForFile(file as File)).filter(Boolean);
    } catch {
      return Promise.reject(new Error('无法读取上传文件的本地路径'));
    }
    if (paths.length !== files.length) return Promise.reject(new Error('上传文件缺少本地路径'));
    return ipcRenderer.invoke('noobi:project:create', input, paths) as Promise<ProjectRecord>;
  },
  renameProject: (projectId: string, name: string) =>
    ipcRenderer.invoke('noobi:project:rename', projectId, name) as Promise<ProjectRecord>,
  setProjectPinned: (projectId: string, pinned: boolean) =>
    ipcRenderer.invoke('noobi:project:pin', projectId, pinned) as Promise<ProjectRecord>,
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:delete', projectId) as Promise<ProjectRecord>,
  runProject: (input: RunProjectInput) =>
    ipcRenderer.invoke('noobi:project:run', input) as Promise<ProjectRecord>,
  stopProject: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:stop', projectId) as Promise<ProjectRecord>,
  revealProject: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:reveal', projectId) as Promise<ProjectRecord | null>,
  importProjectAssets: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:assets:import', projectId) as Promise<GameAssetRecord[]>,
  importDroppedProjectAssets: (projectId: string, files: readonly unknown[]) => {
    if (!Array.isArray(files) || files.length === 0 || files.length > 50) {
      return Promise.reject(new Error('一次只能拖入 1–50 张图片'));
    }
    let paths: string[];
    try {
      paths = files.map((file) => webUtils.getPathForFile(file as File)).filter(Boolean);
    } catch {
      return Promise.reject(new Error('无法读取拖入文件的本地路径'));
    }
    if (paths.length !== files.length) return Promise.reject(new Error('拖入文件缺少本地路径'));
    return ipcRenderer.invoke('noobi:project:assets:import-paths', projectId, paths) as Promise<GameAssetRecord[]>;
  },
  retryAssetPlan: (projectId: string, planId: string) =>
    ipcRenderer.invoke('noobi:project:asset-plan:retry', projectId, planId) as Promise<AssetPlanRecord>,
  inspectProject: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:inspect', projectId) as Promise<ProjectInspectorPayload>,
  evaluateProjectExperience: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:experience:evaluate', projectId) as Promise<GameplayExperienceReport>,
  cancelProjectExperience: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:experience:cancel', projectId) as Promise<void>,
  readProjectFile: (projectId: string, relativePath: string) =>
    ipcRenderer.invoke('noobi:project:read', projectId, relativePath) as Promise<FileReadResult>,
  saveProjectNoobiPack: (projectId: string, packId: NoobiPackId | null) =>
    ipcRenderer.invoke('noobi:project:noobi-pack:save', projectId, packId) as Promise<ProjectRecord>,
  saveProjectNoobiCrew: (projectId: string, crew: readonly NoobiCrewMember[] | null) =>
    ipcRenderer.invoke('noobi:project:noobi-crew:save', projectId, crew) as Promise<ProjectRecord>,
  saveSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke('noobi:settings:save', patch) as Promise<AppSettings>,
  getEnvironmentStatus: () =>
    ipcRenderer.invoke('noobi:environment:get') as Promise<EnvironmentStatusSnapshot>,
  refreshEnvironmentStatus: () =>
    ipcRenderer.invoke('noobi:environment:refresh') as Promise<EnvironmentStatusSnapshot>,
  chooseGodotExecutable: () =>
    ipcRenderer.invoke('noobi:environment:godot:choose') as Promise<string | null>,
  saveGodotExecutable: (binaryPath: string | null) =>
    ipcRenderer.invoke('noobi:environment:godot:save', binaryPath) as Promise<EnvironmentStatusSnapshot>,
  getExtensionSettings: () =>
    ipcRenderer.invoke('noobi:extensions:get') as Promise<ExtensionSettingsSnapshot>,
  saveMediaProvider: (input: SaveMediaProviderInput) =>
    ipcRenderer.invoke('noobi:media-provider:save', input) as Promise<MediaProviderSetting>,
  testMediaProvider: (capability: MediaCapability) =>
    ipcRenderer.invoke('noobi:media-provider:test', capability) as Promise<MediaProviderTestResult>,
  listSkills: () => ipcRenderer.invoke('noobi:skills:list') as Promise<SkillSetting[]>,
  setSkillEnabled: (input: { id: string; enabled: boolean }) =>
    ipcRenderer.invoke('noobi:skills:set-enabled', input) as Promise<SkillSetting>,
  listMcpServers: () => ipcRenderer.invoke('noobi:mcp:list') as Promise<McpServerSetting[]>,
  saveMcpServer: (input: SaveMcpServerInput) =>
    ipcRenderer.invoke('noobi:mcp:save', input) as Promise<McpServerSetting>,
  removeMcpServer: (id: string) => ipcRenderer.invoke('noobi:mcp:remove', id) as Promise<void>,
  listPromptTemplates: () =>
    ipcRenderer.invoke('noobi:prompts:list') as Promise<PromptTemplateSetting[]>,
  savePromptTemplate: (input: { id: PromptTemplateId; content: string; enabled: boolean }) =>
    ipcRenderer.invoke('noobi:prompts:save', input) as Promise<PromptTemplateSetting>,
  resetPromptTemplate: (id: PromptTemplateId) =>
    ipcRenderer.invoke('noobi:prompts:reset', id) as Promise<PromptTemplateSetting>,
  resolveApproval: (token: string, decision: ApprovalDecision, answers?: ApprovalAnswers) =>
    ipcRenderer.invoke('noobi:approval:resolve', token, decision, answers) as Promise<void>,
  onAgentEvent: (listener: (event: AgentEvent) => void) =>
    subscribe('noobi:event:agent', listener),
  onProjectChanged: (listener: (project: ProjectRecord) => void) =>
    subscribe('noobi:event:project', listener),
  onRuntimeChanged: (listener: (status: RuntimeStatus) => void) =>
    subscribe('noobi:event:runtime', listener),
  onApproval: (listener: (approval: ApprovalRequest) => void) =>
    subscribe('noobi:event:approval', listener),
  onApprovalClosed: (listener: (token: string) => void) =>
    subscribe('noobi:event:approval-closed', listener),
  onAssetsChanged: (listener: (payload: { projectId: string; assets: GameAssetRecord[] }) => void) =>
    subscribe('noobi:event:assets', listener),
  onAssetPlansChanged: (listener: (payload: { projectId: string; assetPlans: AssetPlanRecord[] }) => void) =>
    subscribe('noobi:event:asset-plans', listener),
};

contextBridge.exposeInMainWorld('noobi', Object.freeze(api));

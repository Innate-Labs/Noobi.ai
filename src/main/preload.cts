import type { GeneratePlansInput, PlanDraft, StartPlanInput, ResumeProjectInput } from '../shared/planning.js';
import type { ProductionProgress } from '../shared/productionProgress.js';
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
  InlineAttachmentInput,
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
  ProjectIconData,
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
  importVideoReference: (candidate: unknown, requestId: string) => {
    const file = candidate as File;
    if (!(file instanceof File) || file.size > 200 * 1024 ** 2 || !/\.(mp4|mov)$/iu.test(file.name)) throw new Error('请上传不超过 200 MiB 的 MP4/MOV');
    const path = webUtils.getPathForFile(file);
    if (!path) throw new Error('请选择本机视频文件');
    return ipcRenderer.invoke('noobi:video:import', path, requestId);
  },
  prepareVideoReference: input => ipcRenderer.invoke('noobi:video:prepare', input),
  cancelVideoReference: id => ipcRenderer.invoke('noobi:video:cancel', id),
  getVideoReference: id => ipcRenderer.invoke('noobi:video:get', id),
  saveVideoSpec: input => ipcRenderer.invoke('noobi:plans:video-spec', input),
  importVisualReferences: async (files: readonly unknown[]) => {
    if (!Array.isArray(files) || files.length < 1 || files.length > 5) throw new Error('请上传 1–5 张视觉参考');
    let total = 0;
    const images = [];
    for (const candidate of files) {
      const file = candidate as File;
      if (!(file instanceof File) || !file.size || file.size > 12 * 1024 ** 2) throw new Error('每张视觉参考需为不超过 12 MiB 的图片文件');
      total += file.size; if (total > 32 * 1024 ** 2) throw new Error('视觉参考总量最多 32 MiB');
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      images.push({ name: file.name, dataBase64: btoa(binary) });
    }
    return ipcRenderer.invoke('noobi:references:import', images);
  },
  getVisualReferences: ids => ipcRenderer.invoke('noobi:references:get', ids),
  saveReferenceSpec: input => ipcRenderer.invoke('noobi:plans:reference-spec', input),
  bootstrap: () => ipcRenderer.invoke('noobi:bootstrap') as Promise<BootstrapPayload>,
  refreshRuntime: () => ipcRenderer.invoke('noobi:runtime:refresh') as Promise<RuntimeStatus>,
  startLogin: () => ipcRenderer.invoke('noobi:runtime:login') as Promise<LoginStartResult>,
  logout: () => ipcRenderer.invoke('noobi:runtime:logout') as Promise<RuntimeStatus>,
  chooseDirectory: () => ipcRenderer.invoke('noobi:dialog:directory') as Promise<string | null>,
  chooseProjectDirectory: () =>
    ipcRenderer.invoke('noobi:dialog:project-directory') as Promise<string | null>,
  createProject: (input: CreateProjectInput) => ipcRenderer.invoke('noobi:project:create', input),
  generatePlans: (input: GeneratePlansInput) => ipcRenderer.invoke('noobi:plans:generate', input) as Promise<PlanDraft>,
  savePlanEdits: input => ipcRenderer.invoke('noobi:plans:edit', input) as Promise<PlanDraft>,
  revisePlans: input => ipcRenderer.invoke('noobi:plans:revise', input) as Promise<PlanDraft>,
  listPlans: () => ipcRenderer.invoke('noobi:plans:list') as Promise<PlanDraft[]>,
  getPlan: (id: string) => ipcRenderer.invoke('noobi:plans:get', id) as Promise<PlanDraft>,
  retryPlan: (id: string) => ipcRenderer.invoke('noobi:plans:retry', id) as Promise<PlanDraft>,
  cancelPlan: (id: string) => ipcRenderer.invoke('noobi:plans:cancel', id) as Promise<PlanDraft>,
  startPlan: (input: StartPlanInput, files: readonly unknown[] = []) => {
    if (!Array.isArray(files) || files.length > 50) {
      return Promise.reject(new Error('一次最多上传 50 个附件'));
    }
    const paths: string[] = [];
    const inline: InlineAttachmentInput[] = [];
    const pathless: File[] = [];
    try {
      for (const candidate of files) {
        const path = webUtils.getPathForFile(candidate as File);
        if (path) paths.push(path);
        else pathless.push(candidate as File);
      }
    } catch {
      return Promise.reject(new Error('无法读取上传文件的本地路径'));
    }
    const encode = async (): Promise<InlineAttachmentInput[]> => {
      for (const file of pathless) {
        if (!(file instanceof File) || file.size <= 0) {
          throw new Error('粘贴内容不是有效的文件');
        }
        if (file.size > 32 * 1024 * 1024) {
          throw new Error(`粘贴文件过大（上限 32MB）：${file.name || '未命名'}`);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        inline.push({
          name: file.name || `pasted-${inline.length + 1}.png`,
          dataBase64: btoa(binary),
        });
      }
      return inline;
    };
    return encode().then((inlineAttachments) =>
      ipcRenderer.invoke('noobi:plans:start', input, paths, inlineAttachments) as Promise<ProjectRecord>,
    );
  },
  renameProject: (projectId: string, name: string) =>
    ipcRenderer.invoke('noobi:project:rename', projectId, name) as Promise<ProjectRecord>,
  setProjectPinned: (projectId: string, pinned: boolean) =>
    ipcRenderer.invoke('noobi:project:pin', projectId, pinned) as Promise<ProjectRecord>,
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:delete', projectId) as Promise<ProjectRecord>,
  runProject: (input: RunProjectInput) =>
    ipcRenderer.invoke('noobi:project:run', input) as Promise<ProjectRecord>,
  resumeProject: (input: ResumeProjectInput) =>
    ipcRenderer.invoke('noobi:project:resume', input) as Promise<ProjectRecord>,
  getProductionProgress: (projectId: string) => ipcRenderer.invoke('noobi:project:progress', projectId) as Promise<ProductionProgress | null>,
  listGameVersions: projectId => ipcRenderer.invoke('noobi:versions:list', projectId),
  previewGameVersion: (projectId, versionId) => ipcRenderer.invoke('noobi:versions:preview', projectId, versionId),
  exportGameVersionMac: (projectId, versionId) => ipcRenderer.invoke('noobi:versions:export-mac', projectId, versionId),
  exportGameVersionWeb: (projectId, versionId) => ipcRenderer.invoke('noobi:versions:export-web', projectId, versionId),
  copyFailedPlan: (draftId) => ipcRenderer.invoke('noobi:plans:copy-failed', draftId),
  getReferenceComparison: (projectId) => ipcRenderer.invoke('noobi:comparison:get', projectId),
  saveReferenceComparison: (input) => ipcRenderer.invoke('noobi:comparison:save', input),
  backupGameVersion: projectId => ipcRenderer.invoke('noobi:versions:backup', projectId),
  restoreGameVersion: input => ipcRenderer.invoke('noobi:versions:restore', input),
  extendProductionBudget: input => ipcRenderer.invoke('noobi:project:extend-budget', input) as Promise<ProductionProgress>,
  onProductionProgressChanged: listener => subscribe('noobi:event:production-progress', listener),
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
  getProjectIcon: (projectId: string) =>
    ipcRenderer.invoke('noobi:project:icon', projectId) as Promise<ProjectIconData | null>,
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

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentEvent,
  AppSettings,
  CreateProjectInput,
  DependencyActionInput,
  DependencyOutput,
  GameAgentAPI,
  ImportSkillInput,
  InstallGitHubSkillInput,
  McpServerDefinition,
  ProjectRecord,
  ProviderConnectionInput,
  StartAgentInput,
} from '../shared/types.js';

const api: GameAgentAPI = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  createProject: (input: CreateProjectInput) =>
    ipcRenderer.invoke('project:create', input),
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('settings:save', settings),
  testProviderConnection: (input: ProviderConnectionInput) =>
    ipcRenderer.invoke('settings:test-provider', input),
  loadApiUsage: () => ipcRenderer.invoke('settings:api-usage'),
  inspectDependencies: () =>
    ipcRenderer.invoke('settings:inspect-dependencies'),
  runDependencyAction: (input: DependencyActionInput) =>
    ipcRenderer.invoke('settings:run-dependency-action', input),
  startAgent: (input: StartAgentInput) =>
    ipcRenderer.invoke('agent:start', input),
  stopAgent: (projectId: string) => ipcRenderer.invoke('agent:stop', projectId),
  loadAgentHistory: (projectId: string) =>
    ipcRenderer.invoke('agent:history', projectId),
  listFiles: (projectId: string) =>
    ipcRenderer.invoke('project:list-files', projectId),
  readFile: (projectId: string, filePath: string) =>
    ipcRenderer.invoke('project:read-file', projectId, filePath),
  startPreview: (projectId: string) =>
    ipcRenderer.invoke('project:start-preview', projectId),
  revealProject: (projectId: string) =>
    ipcRenderer.invoke('project:reveal', projectId),
  loadExtensions: (projectId?: string) =>
    ipcRenderer.invoke('extensions:load', projectId),
  saveMcpServers: (servers: McpServerDefinition[]) =>
    ipcRenderer.invoke('extensions:save-mcp', servers),
  importSkill: (input: ImportSkillInput) =>
    ipcRenderer.invoke('extensions:import-skill', input),
  installGitHubSkill: (input: InstallGitHubSkillInput) =>
    ipcRenderer.invoke('extensions:install-github-skill', input),
  removeSkill: (projectId: string | undefined, skillId: string) =>
    ipcRenderer.invoke('extensions:remove-skill', projectId, skillId),
  revealSkill: (projectId: string | undefined, skillId: string) =>
    ipcRenderer.invoke('extensions:reveal-skill', projectId, skillId),
  revealSkillDirectory: (level, projectId?: string) =>
    ipcRenderer.invoke('extensions:reveal-skill-directory', level, projectId),
  openGitHubUrl: (url: string) =>
    ipcRenderer.invoke('extensions:open-github-url', url),
  onAgentEvent: (callback: (event: AgentEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEvent) =>
      callback(payload);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
  onProjectUpdated: (callback: (project: ProjectRecord) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: ProjectRecord,
    ) => callback(payload);
    ipcRenderer.on('project:updated', listener);
    return () => ipcRenderer.removeListener('project:updated', listener);
  },
  onDependencyOutput: (callback: (output: DependencyOutput) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: DependencyOutput,
    ) => callback(payload);
    ipcRenderer.on('settings:dependency-output', listener);
    return () =>
      ipcRenderer.removeListener('settings:dependency-output', listener);
  },
};

contextBridge.exposeInMainWorld('gameAgent', api);

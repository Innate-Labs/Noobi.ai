import type { RuntimeStatus } from '../shared/contracts';

export type HomeReadinessSection = 'account' | 'environment' | 'media';
export type HomeReadinessId = 'runtime' | 'account' | 'images';

export interface HomeReadinessItem {
  id: HomeReadinessId;
  title: string;
  detail: string;
  ready: boolean;
  actionLabel: string;
  settingsSection: HomeReadinessSection;
}

export function homeReadinessChecklist(
  runtime: RuntimeStatus,
  imageGenerationAvailable: boolean,
): HomeReadinessItem[] {
  const runtimeReady = runtime.state === 'ready';
  const accountReady = Boolean(runtime.account);

  return [
    {
      id: 'runtime',
      title: 'Codex 运行时',
      detail: runtimeDetail(runtime),
      ready: runtimeReady,
      actionLabel: '检查环境',
      settingsSection: 'environment',
    },
    {
      id: 'account',
      title: 'ChatGPT 账户',
      detail: accountReady
        ? runtime.account?.email ?? '已完成账户登录'
        : runtimeReady ? '运行时已连接，等待登录' : '运行时就绪后即可登录',
      ready: accountReady,
      actionLabel: '去登录',
      settingsSection: 'account',
    },
    {
      id: 'images',
      title: '图片生成能力',
      detail: imageGenerationAvailable
        ? 'Codex ImageGen 或外部 Provider 可用'
        : '需要启用 ImageGen 或配置 Provider',
      ready: imageGenerationAvailable,
      actionLabel: '配置图片',
      settingsSection: 'media',
    },
  ];
}

export function completedReadinessCount(items: readonly HomeReadinessItem[]): number {
  return items.filter((item) => item.ready).length;
}

function runtimeDetail(runtime: RuntimeStatus): string {
  if (runtime.state === 'ready') {
    return runtime.version ? `Codex ${runtime.version} 已连接` : 'Codex App Server 已连接';
  }
  if (runtime.state === 'starting') return '正在启动 Codex App Server';
  if (runtime.state === 'error') return runtime.error ?? 'Codex App Server 启动失败';
  return '尚未启动 Codex App Server';
}

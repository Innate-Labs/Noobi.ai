import { Blocks, FolderOpen, Plus, Settings } from 'lucide-react';
import type { ProjectRecord } from '../../shared/types';
import { gameAgentMascot as brandIcon } from '../assets';

interface ProjectRailProps {
  projects: ProjectRecord[];
  selectedId?: string;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onCreate: () => void;
  onSettings: () => void;
  onExtensions: () => void;
}

const STATUS_LABEL: Record<ProjectRecord['status'], string> = {
  draft: '待启动',
  running: '生成中',
  waiting: '待继续',
  completed: '已完成',
  failed: '需处理',
  stopped: '已停止',
};

export function ProjectRail({
  projects,
  selectedId,
  onHome,
  onSelect,
  onCreate,
  onSettings,
  onExtensions,
}: ProjectRailProps) {
  return (
    <aside className="project-rail">
      <button
        type="button"
        className="brand-block"
        onClick={onHome}
        aria-label="返回首页"
        title="返回首页"
      >
        <div className="brand-mark" aria-hidden="true">
          <img src={brandIcon} alt="" />
        </div>
        <div>
          <strong>Noobi.ai</strong>
          <span>AI GAME AGENT</span>
        </div>
      </button>

      <button className="new-project-button" onClick={onCreate}>
        <Plus size={16} />
        新建游戏
      </button>

      <div className="rail-section-label">
        <span>项目</span>
        <span>{String(projects.length).padStart(2, '0')}</span>
      </div>

      <nav className="project-list" aria-label="游戏项目">
        {projects.length === 0 ? (
          <div className="project-empty">
            <FolderOpen size={20} />
            <p>还没有项目</p>
            <span>从一句游戏创意开始</span>
          </div>
        ) : (
          projects.map((project) => (
            <button
              className={`project-item ${project.id === selectedId ? 'is-active' : ''}`}
              key={project.id}
              onClick={() => onSelect(project)}
            >
              <span className={`status-dot status-${project.status}`} />
              <span className="project-item-copy">
                <strong>{project.name}</strong>
                <small>{STATUS_LABEL[project.status]}</small>
              </span>
              <time>{formatRelative(project.updatedAt)}</time>
            </button>
          ))
        )}
      </nav>

      <div className="rail-actions">
        <button className="rail-settings" onClick={onExtensions}>
          <Blocks size={16} />
          插件
        </button>
        <button className="rail-settings" onClick={onSettings}>
          <Settings size={16} />
          设置
        </button>
      </div>
    </aside>
  );
}

function formatRelative(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

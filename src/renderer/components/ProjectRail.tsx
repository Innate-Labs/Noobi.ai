import {
  FolderKanban,
  Gauge,
  Home,
  Plus,
  Settings,
  X,
} from 'lucide-react';

import type { ProjectRecord, RuntimeStatus } from '../../shared/contracts';
import type { SettingsSection } from './SettingsModal';
import {
  formatRelative,
  PROJECT_STATUS_LABELS,
  runtimeLabel,
} from '../ui';

interface ProjectRailProps {
  projects: readonly ProjectRecord[];
  selectedId?: string;
  runtime: RuntimeStatus;
  open: boolean;
  variant: 'dashboard' | 'workbench';
  onClose: () => void;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onCreate: () => void;
  onSettings: (section?: SettingsSection) => void;
}

export function ProjectRail({
  projects,
  selectedId,
  runtime,
  open,
  variant,
  onClose,
  onHome,
  onSelect,
  onCreate,
  onSettings,
}: ProjectRailProps) {
  return (
    <>
      <button
        className={`rail-scrim ${open ? 'is-visible' : ''}`}
        type="button"
        aria-label="关闭项目导航"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`project-rail mode-${variant} ${open ? 'is-open' : ''}`}>
        <div className="rail-brand-row">
          <button className="brand" type="button" aria-label="返回首页" title="返回首页" onClick={onHome}>
            {variant === 'workbench' ? <span className="brand-monogram" aria-hidden="true">N</span> : null}
            <span className="brand-copy">
              <strong>Noobi.ai</strong>
              <small>AI GAME STUDIO</small>
            </span>
          </button>
          <button
            className="icon-button rail-close"
            type="button"
            aria-label="关闭项目导航"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>

        <nav className="rail-primary-navigation" aria-label="Noobi 导航">
          <button className={variant === 'dashboard' ? 'is-active' : ''} type="button" onClick={onHome}>
            <Home size={17} />
            <span>首页</span>
          </button>
        </nav>

        <div className="rail-section-heading">
          <span>MY GAMES</span>
          <strong>{String(projects.length).padStart(2, '0')}</strong>
        </div>

        <nav className="project-list" aria-label="游戏项目">
          {projects.length ? (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`project-item ${project.id === selectedId ? 'is-active' : ''}`}
                onClick={() => onSelect(project)}
              >
                <span className="project-item-copy">
                  <strong>{project.name}</strong>
                  <small>{project.engine === 'godot' ? 'GODOT 4' : 'WEB'} · {PROJECT_STATUS_LABELS[project.status]}</small>
                </span>
                <time dateTime={project.updatedAt}>{formatRelative(project.updatedAt)}</time>
              </button>
            ))
          ) : (
            <div className="project-empty">
              <FolderKanban size={22} />
              <strong>还没有游戏项目</strong>
              <span>从一句清晰的创意开始。</span>
            </div>
          )}
        </nav>

        <nav className="compact-project-list" aria-label="快速切换项目">
          <button className="compact-create" type="button" title="新建游戏" onClick={onCreate}>
            <Plus size={18} />
          </button>
          {projects.slice(0, 8).map((project, index) => (
            <button
              key={project.id}
              type="button"
              className={`${project.id === selectedId ? 'is-active' : ''} tone-${index % 4}`}
              title={`${project.name} · ${PROJECT_STATUS_LABELS[project.status]}`}
              aria-label={`打开 ${project.name}`}
              onClick={() => onSelect(project)}
            >
              <span>{project.name.trim().slice(0, 1).toUpperCase() || 'N'}</span>
              <i className={`status-dot status-${project.status}`} />
            </button>
          ))}
        </nav>

        <div className="rail-footer">
          <button
            type="button"
            className="runtime-mini"
            title={runtimeLabel(runtime)}
            onClick={() => onSettings(runtime.account ? 'environment' : 'account')}
          >
            <Gauge size={15} />
            <span>
              <strong>{runtimeLabel(runtime)}</strong>
              <small>{runtime.version ?? 'RUNTIME STATUS'}</small>
            </span>
            <i className={`runtime-dot state-${runtime.state}`} />
          </button>
          <button className="rail-settings" type="button" title="设置" onClick={() => onSettings()}>
            <Settings size={15} />
            <span>设置</span>
          </button>
        </div>
      </aside>
    </>
  );
}

import {
  FolderKanban,
  Gauge,
  Plus,
  Settings,
  X,
} from 'lucide-react';

import type { ProjectRecord, RuntimeStatus } from '../../shared/contracts';
import { BrandMark } from './BrandMark';
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
  onClose: () => void;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onCreate: () => void;
  onSettings: () => void;
}

export function ProjectRail({
  projects,
  selectedId,
  runtime,
  open,
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
      <aside className={`project-rail ${open ? 'is-open' : ''}`}>
        <div className="rail-brand-row">
          <button className="brand" type="button" onClick={onHome}>
            <BrandMark />
            <span className="brand-copy">
              <strong>Noobi.ai</strong>
              <small>GAME PRODUCTION SYSTEM</small>
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

        <button className="new-project-button" type="button" onClick={onCreate}>
          <Plus size={16} />
          新建游戏
        </button>

        <div className="rail-section-heading">
          <span>PROJECTS</span>
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
                <span
                  className={`status-dot status-${project.status}`}
                  aria-hidden="true"
                />
                <span className="project-item-copy">
                  <strong>{project.name}</strong>
                  <small>{PROJECT_STATUS_LABELS[project.status]}</small>
                </span>
                <time dateTime={project.updatedAt}>
                  {formatRelative(project.updatedAt)}
                </time>
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

        <div className="rail-footer">
          <button
            type="button"
            className="runtime-mini"
            onClick={onSettings}
          >
            <Gauge size={15} />
            <span>
              <strong>{runtimeLabel(runtime)}</strong>
              <small>{runtime.version ?? 'RUNTIME STATUS'}</small>
            </span>
            <i className={`runtime-dot state-${runtime.state}`} />
          </button>
          <button className="rail-settings" type="button" onClick={onSettings}>
            <Settings size={15} />
            设置
          </button>
        </div>
      </aside>
    </>
  );
}

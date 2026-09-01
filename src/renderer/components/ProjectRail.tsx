import {
  FolderKanban,
  Gauge,
  Home,
  PanelLeftClose,
  Pencil,
  Plus,
  Settings,
  X,
} from 'lucide-react';
import React, { useEffect, useState, type FormEvent, type MouseEvent } from 'react';

import type { ProjectRecord, RuntimeStatus } from '../../shared/contracts';
import type { SettingsSection } from './SettingsModal';
import {
  formatRelative,
  PROJECT_STATUS_LABELS,
  runtimeLabel,
} from '../ui';

export interface ProjectRenameMenuRequest {
  token: number;
  x: number;
  y: number;
}

interface ProjectRailProps {
  projects: readonly ProjectRecord[];
  selectedId?: string;
  runtime: RuntimeStatus;
  open: boolean;
  collapsed: boolean;
  renameMenuRequest: ProjectRenameMenuRequest | null;
  variant: 'dashboard' | 'workbench';
  onClose: () => void;
  onToggleCollapse: () => void;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onCreate: () => void;
  onRename: (project: ProjectRecord, name: string) => Promise<void>;
  onSettings: (section?: SettingsSection) => void;
}

interface ProjectContextMenuState {
  project: ProjectRecord;
  x: number;
  y: number;
}

export function projectContextMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(x, viewportWidth - 176)),
    y: Math.max(8, Math.min(y, viewportHeight - 64)),
  };
}

export function ProjectRail({
  projects,
  selectedId,
  runtime,
  open,
  collapsed,
  renameMenuRequest,
  variant,
  onClose,
  onToggleCollapse,
  onHome,
  onSelect,
  onCreate,
  onRename,
  onSettings,
}: ProjectRailProps) {
  const [contextMenu, setContextMenu] = useState<ProjectContextMenuState | null>(null);
  const [renaming, setRenaming] = useState<ProjectRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  useEffect(() => {
    if (!contextMenu && !renaming) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setContextMenu(null);
      if (!renameBusy) setRenaming(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [contextMenu, renameBusy, renaming]);

  useEffect(() => {
    if (!renameMenuRequest || !selectedId) return;
    const project = projects.find((item) => item.id === selectedId);
    if (!project) return;
    const position = projectContextMenuPosition(
      renameMenuRequest.x,
      renameMenuRequest.y,
      window.innerWidth,
      window.innerHeight,
    );
    setContextMenu({ project, ...position });
  }, [renameMenuRequest?.token]);

  function openContextMenu(event: MouseEvent, project: ProjectRecord) {
    event.preventDefault();
    const position = projectContextMenuPosition(
      event.clientX,
      event.clientY,
      window.innerWidth,
      window.innerHeight,
    );
    setContextMenu({ project, ...position });
  }

  function beginRename(project: ProjectRecord) {
    setContextMenu(null);
    setRenaming(project);
    setRenameValue(project.name);
    setRenameError('');
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!renaming || renameBusy) return;
    const name = renameValue.trim();
    if (!name) {
      setRenameError('请输入游戏名称');
      return;
    }
    setRenameBusy(true);
    setRenameError('');
    try {
      await onRename(renaming, name);
      setRenaming(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : '重命名失败');
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <>
      <button
        className={`rail-scrim ${open ? 'is-visible' : ''}`}
        type="button"
        aria-label="关闭项目导航"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`project-rail mode-${variant}${collapsed ? ' is-collapsed' : ''} ${open ? 'is-open' : ''}`}>
        <div className="rail-brand-row">
          {variant === 'workbench' ? (
            <div className="brand is-static" aria-label="Noobi.ai">
              <span className="brand-monogram" aria-hidden="true">N</span>
              <span className="brand-copy">
                <strong>Noobi.ai</strong>
                <small>AI GAME STUDIO</small>
              </span>
            </div>
          ) : (
            <button
              className="brand"
              type="button"
              aria-label={collapsed ? '展开首页侧栏' : '返回首页'}
              title={collapsed ? '展开首页侧栏' : '返回首页'}
              onClick={collapsed ? onToggleCollapse : onHome}
            >
              {collapsed ? <span className="brand-monogram" aria-hidden="true">N</span> : null}
              <span className="brand-copy">
                <strong>Noobi.ai</strong>
                <small>AI GAME STUDIO</small>
              </span>
            </button>
          )}
          {variant === 'dashboard' && !collapsed ? (
            <button
              className="rail-collapse"
              type="button"
              aria-label="收起首页侧栏"
              title="收起首页侧栏"
              onClick={onToggleCollapse}
            >
              <PanelLeftClose size={17} strokeWidth={1.7} />
            </button>
          ) : null}
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
                onContextMenu={(event) => openContextMenu(event, project)}
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
          <button
            className="compact-create"
            type="button"
            title={variant === 'dashboard' ? '首页' : '新建游戏'}
            aria-label={variant === 'dashboard' ? '首页' : '新建游戏'}
            onClick={variant === 'dashboard' ? onHome : onCreate}
          >
            {variant === 'dashboard' ? <Home size={18} /> : <Plus size={18} />}
          </button>
          {projects.slice(0, 8).map((project, index) => (
            <button
              key={project.id}
              type="button"
              className={`${project.id === selectedId ? 'is-active' : ''} tone-${index % 4}`}
              title={`${project.name} · ${PROJECT_STATUS_LABELS[project.status]}`}
              aria-label={`打开 ${project.name}`}
              onClick={() => onSelect(project)}
              onContextMenu={(event) => openContextMenu(event, project)}
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

      {contextMenu ? (
        <>
          <button
            className="project-context-scrim"
            type="button"
            aria-label="关闭项目菜单"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="project-context-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button type="button" role="menuitem" onClick={() => beginRename(contextMenu.project)}>
              <Pencil size={14} />
              重命名
            </button>
          </div>
        </>
      ) : null}

      {renaming ? (
        <div
          className="project-rename-scrim"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !renameBusy) setRenaming(null);
          }}
        >
          <form className="project-rename-dialog" role="dialog" aria-modal="true" onSubmit={submitRename}>
            <header>
              <Pencil size={16} />
              <strong>修改游戏名称</strong>
            </header>
            <label>
              <span>游戏名称</span>
              <input
                autoFocus
                value={renameValue}
                maxLength={100}
                disabled={renameBusy}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </label>
            {renameError ? <p role="alert">{renameError}</p> : null}
            <footer>
              <button type="button" disabled={renameBusy} onClick={() => setRenaming(null)}>取消</button>
              <button type="submit" disabled={renameBusy || !renameValue.trim()}>
                {renameBusy ? '保存中…' : '保存'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

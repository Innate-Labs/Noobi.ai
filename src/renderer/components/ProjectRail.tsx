import {
  FolderKanban,
  Gauge,
  Home,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  onOpen: () => void;
  onClose: () => void;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onTogglePinned: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  onCreate: () => void;
  onSettings: (section?: SettingsSection) => void;
}

export function ProjectRail({
  projects,
  selectedId,
  runtime,
  open,
  variant,
  onOpen,
  onClose,
  onHome,
  onSelect,
  onRename,
  onTogglePinned,
  onDelete,
  onCreate,
  onSettings,
}: ProjectRailProps) {
  const [menu, setMenu] = useState<{ project: ProjectRecord; top: number; left: number } | null>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const collapsedWorkbench = variant === 'workbench' && !open;

  useEffect(() => {
    if (!menu) return;
    const frame = requestAnimationFrame(() => firstMenuItemRef.current?.focus());
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu]);

  function openProjectMenu(project: ProjectRecord, trigger: HTMLButtonElement) {
    const rect = trigger.getBoundingClientRect();
    const width = 214;
    const estimatedHeight = 146;
    setMenu({
      project,
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - estimatedHeight - 8)),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    });
  }

  function choose(action: (project: ProjectRecord) => void) {
    if (!menu) return;
    const project = menu.project;
    setMenu(null);
    action(project);
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
      <aside className={`project-rail mode-${variant} ${open ? 'is-open' : ''}`}>
        <div className="rail-brand-row">
          <button
            className={`brand${collapsedWorkbench ? ' compact-brand-toggle' : ''}`}
            type="button"
            aria-label={collapsedWorkbench ? '打开项目列表' : '返回首页'}
            title={collapsedWorkbench ? '打开项目列表' : '返回首页'}
            aria-expanded={variant === 'workbench' ? open : undefined}
            onClick={collapsedWorkbench ? onOpen : onHome}
          >
            {collapsedWorkbench ? (
              <PanelLeftOpen className="brand-toggle-icon" size={19} aria-hidden="true" />
            ) : (
              <span className="brand-copy">
                <strong>Noobi.ai</strong>
                <small>AI GAME STUDIO</small>
              </span>
            )}
          </button>
          <button
            className="icon-button rail-close"
            type="button"
            aria-label="关闭项目导航"
            title="收起项目列表"
            onClick={onClose}
          >
            <PanelLeftClose size={17} />
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
              <div
                key={project.id}
                className={`project-item-row ${project.id === selectedId ? 'is-active' : ''} ${menu?.project.id === project.id ? 'has-open-menu' : ''}`}
              >
                <button
                  type="button"
                  className={`project-item ${project.id === selectedId ? 'is-active' : ''}`}
                  onClick={() => onSelect(project)}
                >
                  <span className="project-item-copy">
                    <strong>{project.name}</strong>
                    <small>{project.engine === 'godot' ? 'GODOT 4' : 'WEB'} · {PROJECT_STATUS_LABELS[project.status]}</small>
                  </span>
                  <span className="project-item-meta">
                    {project.pinned ? <Pin className="project-pin" size={11} aria-label="已置顶" /> : null}
                    <time dateTime={project.updatedAt}>{formatRelative(project.updatedAt)}</time>
                  </span>
                </button>
                <button
                  className="project-item-more"
                  type="button"
                  aria-label={`打开“${project.name}”的项目菜单`}
                  aria-haspopup="menu"
                  aria-expanded={menu?.project.id === project.id}
                  title="项目操作"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (menu?.project.id === project.id) setMenu(null);
                    else openProjectMenu(project, event.currentTarget);
                  }}
                >
                  <MoreHorizontal size={17} />
                </button>
              </div>
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
      {menu ? createPortal(
        <div className="project-menu-layer">
          <button
            className="project-menu-dismiss"
            type="button"
            aria-label="关闭项目菜单"
            onClick={() => setMenu(null)}
          />
          <div
            className="project-actions-menu"
            role="menu"
            aria-label={`“${menu.project.name}”项目操作`}
            style={{ top: menu.top, left: menu.left }}
          >
            <button ref={firstMenuItemRef} type="button" role="menuitem" onClick={() => choose(onRename)}>
              <Pencil size={16} />
              <span>重命名</span>
            </button>
            <button type="button" role="menuitem" onClick={() => choose(onTogglePinned)}>
              {menu.project.pinned ? <PinOff size={16} /> : <Pin size={16} />}
              <span>{menu.project.pinned ? '取消置顶' : '置顶'}</span>
            </button>
            <div className="project-menu-separator" role="separator" />
            <button className="is-danger" type="button" role="menuitem" onClick={() => choose(onDelete)}>
              <Trash2 size={16} />
              <span>删除</span>
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

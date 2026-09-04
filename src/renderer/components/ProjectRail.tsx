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
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import type { ProjectRecord, RuntimeStatus } from '../../shared/contracts';
import { ProjectIconImage } from './ProjectIcon';
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
  collapsed: boolean;
  variant: 'dashboard' | 'workbench';
  onOpen: () => void;
  onClose: () => void;
  onToggleCollapse: () => void;
  onHome: () => void;
  onSelect: (project: ProjectRecord) => void;
  onRename: (project: ProjectRecord) => void;
  onTogglePinned: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
  onCreate: () => void;
  onSettings: (section?: SettingsSection) => void;
}

interface ProjectMenuState {
  project: ProjectRecord;
  top: number;
  left: number;
}

const PROJECT_MENU_WIDTH = 214;
const PROJECT_MENU_HEIGHT = 146;

export function projectContextMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(x, viewportWidth - PROJECT_MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(y, viewportHeight - PROJECT_MENU_HEIGHT - 8)),
  };
}

export function ProjectRail({
  projects,
  selectedId,
  runtime,
  open,
  collapsed,
  variant,
  onOpen,
  onClose,
  onToggleCollapse,
  onHome,
  onSelect,
  onRename,
  onTogglePinned,
  onDelete,
  onCreate,
  onSettings,
}: ProjectRailProps) {
  const [menu, setMenu] = useState<ProjectMenuState | null>(null);
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

  function openProjectMenuAt(project: ProjectRecord, x: number, y: number) {
    const position = projectContextMenuPosition(x, y, window.innerWidth, window.innerHeight);
    setMenu({ project, top: position.y, left: position.x });
  }

  function openProjectMenu(project: ProjectRecord, trigger: HTMLButtonElement) {
    const rect = trigger.getBoundingClientRect();
    openProjectMenuAt(project, rect.right - PROJECT_MENU_WIDTH, rect.bottom + 6);
  }

  function openContextMenu(event: ReactMouseEvent, project: ProjectRecord) {
    event.preventDefault();
    openProjectMenuAt(project, event.clientX, event.clientY);
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
      <aside className={`project-rail mode-${variant}${collapsed ? ' is-collapsed' : ''} ${open ? 'is-open' : ''}`}>
        <div className="rail-brand-row">
          {variant === 'workbench' ? (
            collapsedWorkbench ? (
              <button
                className="brand compact-brand-toggle"
                type="button"
                aria-label="打开项目列表"
                title="打开项目列表"
                aria-expanded={open}
                onClick={onOpen}
              >
                <PanelLeftOpen className="brand-toggle-icon" size={19} aria-hidden="true" />
              </button>
            ) : (
              <div className="brand is-static" aria-label="Noobi.ai">
                <span className="brand-monogram" aria-hidden="true">N</span>
                <span className="brand-copy">
                  <strong>Noobi.ai</strong>
                  <small>AI GAME STUDIO</small>
                </span>
              </div>
            )
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
                onContextMenu={(event) => openContextMenu(event, project)}
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
              {project.icon ? (
                <ProjectIconImage project={project} className="project-icon-img" />
              ) : (
                <span>{project.name.trim().slice(0, 1).toUpperCase() || 'N'}</span>
              )}
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

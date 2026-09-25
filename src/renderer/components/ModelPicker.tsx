import {
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Zap,
} from 'lucide-react';
import {
  default as React,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { ModelOption } from '../../shared/contracts';

interface ModelPickerProps {
  models: readonly ModelOption[];
  value: string;
  effort: string;
  defaultModel?: string | null;
  defaultEffort?: string | null;
  disabled?: boolean;
  onChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
}

type PickerSection = 'model' | 'effort';

const EFFORT_LABELS: Readonly<Record<string, string>> = {
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高',
};

export function effortDisplayLabel(effort: string): string {
  return EFFORT_LABELS[effort] ?? effort.toUpperCase();
}

export function ModelPicker({
  models,
  value,
  effort,
  defaultModel = null,
  defaultEffort = null,
  disabled = false,
  onChange,
  onEffortChange,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<PickerSection | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeModel =
    models.find((item) => item.model === value) ?? models[0] ?? null;
  const fallbackModel =
    models.find((item) => item.model === defaultModel)
    ?? models.find((item) => item.isDefault)
    ?? models[0]
    ?? null;
  const efforts = activeModel?.efforts ?? [];
  const activeEffort = efforts.includes(effort)
    ? effort
    : activeModel?.defaultEffort ?? effort;
  const isDefaultSelection = Boolean(
    fallbackModel
      && activeModel?.model === fallbackModel.model
      && (!defaultEffort || activeEffort === defaultEffort),
  );

  useEffect(() => {
    if (disabled || models.length === 0) {
      setOpen(false);
      setSection(null);
    }
  }, [disabled, models.length]);

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeFromOutside);
    return () => document.removeEventListener('pointerdown', closeFromOutside);
  }, [open]);

  function closeMenu(restoreFocus = true) {
    setOpen(false);
    setSection(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function toggleMenu() {
    if (disabled || models.length === 0) return;
    setOpen((current) => {
      if (current) setSection(null);
      return !current;
    });
  }

  function toggleSection(next: PickerSection) {
    setSection((current) => {
      const opening = current !== next;
      if (opening) {
        requestAnimationFrame(() => {
          menuRef.current
            ?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
            ?.focus();
        });
      }
      return opening ? next : null;
    });
  }

  function chooseModel(model: string) {
    onChange(model);
    setSection(null);
  }

  function chooseEffort(next: string) {
    onEffortChange(next);
    setSection(null);
  }

  function resetToDefaults() {
    if (fallbackModel) onChange(fallbackModel.model);
    if (defaultEffort) onEffortChange(defaultEffort);
    closeMenu(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') setOpen(false);
    if (
      open
      && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>(
          'button[role="menuitem"]:not(:disabled), button[role="option"]:not(:disabled)',
        ) ?? [],
      );
      if (items.length === 0) return;
      event.preventDefault();
      const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (activeIndex + 1 + items.length) % items.length
            : (activeIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!open) setOpen(true);
    requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      );
      if (!items?.length) return;
      items[event.key === 'ArrowUp' ? items.length - 1 : 0]?.focus();
    });
  }

  return (
    <div className="home-model-picker" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        className="home-model-trigger"
        type="button"
        disabled={disabled || models.length === 0}
        aria-label="切换模型与推理强度"
        aria-haspopup="menu"
        aria-expanded={open}
        title={activeModel?.description ?? '登录后读取模型'}
        onClick={toggleMenu}
        onKeyDown={handleTriggerKeyDown}
      >
        <Zap size={14} />
        <strong>{activeModel?.displayName ?? '登录后读取模型'}</strong>
        {activeModel && activeEffort ? <em>{effortDisplayLabel(activeEffort)}</em> : null}
        <ChevronDown className={open ? 'is-open' : ''} size={13} />
      </button>

      {open && models.length > 0 ? (
        <div ref={menuRef} className="home-model-menu" role="menu" aria-label="模型与推理设置">
          <div className="home-model-section">
            <button
              className={`home-model-row ${section === 'model' ? 'is-open' : ''}`}
              type="button"
              role="menuitem"
              aria-expanded={section === 'model'}
              onClick={() => toggleSection('model')}
            >
              <span>模型</span>
              <small>{activeModel?.displayName}</small>
              <ChevronRight size={14} />
            </button>
            {section === 'model' ? (
              <div className="home-model-options" role="listbox" aria-label="选择 Codex 模型">
                {models.map((item) => {
                  const selected = item.model === activeModel?.model;
                  return (
                    <button
                      key={item.id}
                      className={selected ? 'is-selected' : ''}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      title={item.description || 'Codex Agent 模型'}
                      onClick={() => chooseModel(item.model)}
                    >
                      <span>
                        <strong>{item.displayName}</strong>
                        {item.isDefault ? <em>默认</em> : null}
                      </span>
                      <i aria-hidden="true">{selected ? <Check size={15} strokeWidth={2.6} /> : null}</i>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="home-model-section">
            <button
              className={`home-model-row ${section === 'effort' ? 'is-open' : ''}`}
              type="button"
              role="menuitem"
              aria-expanded={section === 'effort'}
              disabled={!activeModel}
              onClick={() => toggleSection('effort')}
            >
              <span>推理强度</span>
              <small>{activeEffort ? effortDisplayLabel(activeEffort) : '—'}</small>
              <ChevronRight size={14} />
            </button>
            {section === 'effort' ? (
              <div className="home-model-options" role="listbox" aria-label="选择推理强度">
                {efforts.map((item) => {
                  const selected = item === activeEffort;
                  return (
                    <button
                      key={item}
                      className={selected ? 'is-selected' : ''}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => chooseEffort(item)}
                    >
                      <span>
                        <strong>{effortDisplayLabel(item)}</strong>
                        <small>{item.toUpperCase()}</small>
                      </span>
                      <i aria-hidden="true">{selected ? <Check size={15} strokeWidth={2.6} /> : null}</i>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="home-model-divider" role="separator" />

          <button
            className="home-model-row home-model-reset"
            type="button"
            role="menuitem"
            disabled={isDefaultSelection}
            title={isDefaultSelection ? '已是默认模型与推理强度' : '恢复默认模型与推理强度'}
            onClick={resetToDefaults}
          >
            <span>重置为默认设置</span>
            <RotateCcw size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

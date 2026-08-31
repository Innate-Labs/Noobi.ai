import {
  Check,
  ChevronDown,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { ModelOption } from '../../shared/contracts';

interface ModelPickerProps {
  models: readonly ModelOption[];
  value: string;
  disabled?: boolean;
  onChange: (model: string) => void;
}

export function ModelPicker({
  models,
  value,
  disabled = false,
  onChange,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, models.findIndex((item) => item.model === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const activeModel = models[selectedIndex] ?? null;

  useEffect(() => {
    if (disabled || models.length === 0) {
      setOpen(false);
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => (open ? Math.min(current, models.length - 1) : selectedIndex));
  }, [disabled, models.length, open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => listRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

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
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(index: number) {
    const item = models[index];
    if (!item) return;
    onChange(item.model);
    closeMenu();
  }

  function openMenu(index = selectedIndex) {
    if (disabled || models.length === 0) return;
    setActiveIndex(index);
    setOpen(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(event.key === 'ArrowUp' ? models.length - 1 : selectedIndex);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeMenu(false);
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : models.length - 1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + direction + models.length) % models.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(activeIndex);
    }
  }

  return (
    <div className="home-model-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        className="home-model-trigger"
        type="button"
        disabled={disabled || models.length === 0}
        aria-label="切换模型"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <WandSparkles size={16} />
        <strong>{activeModel?.displayName ?? '登录后读取模型'}</strong>
        <ChevronDown className={open ? 'is-open' : ''} size={15} />
      </button>

      {open && models.length > 0 ? (
        <div
          ref={listRef}
          id={listId}
          className="home-model-menu"
          role="listbox"
          tabIndex={-1}
          aria-label="选择 Codex 模型"
          aria-activedescendant={`${listId}-option-${activeIndex}`}
          onKeyDown={handleListKeyDown}
        >
          {models.map((item, index) => {
            const selected = item.model === activeModel?.model;
            const active = index === activeIndex;
            const badge = modelBadge(item);
            return (
              <button
                id={`${listId}-option-${index}`}
                className={`${selected ? 'is-selected' : ''}${active ? ' is-active' : ''}`}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                key={item.id}
                onClick={() => choose(index)}
                onPointerMove={() => setActiveIndex(index)}
              >
                <span className="home-model-option-icon">
                  <Sparkles size={18} />
                </span>
                <span className="home-model-option-copy">
                  <span>
                    <strong>{item.displayName}</strong>
                    {badge ? <em>{badge}</em> : null}
                  </span>
                  <small>{item.description || 'Codex Agent 模型'}</small>
                </span>
                <span className="home-model-check" aria-hidden="true">
                  {selected ? <Check size={18} strokeWidth={2.4} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function modelBadge(model: ModelOption): string | null {
  if (model.isDefault) return '默认';
  if (model.efforts.includes('xhigh')) return 'XHIGH';
  return null;
}

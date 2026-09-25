import { Pencil } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { ProjectRecord } from '../../shared/contracts';
import { Modal } from './Modal';

interface RenameProjectModalProps {
  project: ProjectRecord;
  busy: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
}

export function RenameProjectModal({ project, busy, onClose, onRename }: RenameProjectModalProps) {
  const [name, setName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = name.trim();

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(frame);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized || normalized === project.name || busy) return;
    onRename(normalized);
  }

  return (
    <Modal
      eyebrow="PROJECT NAME"
      title="重命名项目"
      description="项目目录不会改名，现有代码和素材路径不会受到影响。"
      className="project-action-modal rename-project-modal"
      onClose={busy ? undefined : onClose}
      footer={(
        <>
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button
            className="primary-button"
            type="submit"
            form="rename-project-form"
            disabled={busy || !normalized || normalized === project.name}
          >
            <Pencil size={15} />
            {busy ? '正在保存…' : '保存名称'}
          </button>
        </>
      )}
    >
      <form id="rename-project-form" className="form-stack project-action-form" onSubmit={submit}>
        <label>
          <span>项目名称</span>
          <input
            ref={inputRef}
            value={name}
            maxLength={100}
            disabled={busy}
            aria-label="项目名称"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <small>{Array.from(name).length}/100</small>
      </form>
    </Modal>
  );
}

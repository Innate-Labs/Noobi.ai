import { AlertTriangle, FolderX, Trash2 } from 'lucide-react';

import type { ProjectRecord } from '../../shared/contracts';
import { Modal } from './Modal';

interface DeleteProjectModalProps {
  project: ProjectRecord;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}

export function DeleteProjectModal({ project, busy, onClose, onDelete }: DeleteProjectModalProps) {
  return (
    <Modal
      eyebrow="DANGER ZONE"
      title={`删除“${project.name}”？`}
      description="这个操作无法撤销。Noobi.ai 会删除项目记录以及对应的整个项目目录。"
      className="project-action-modal delete-project-modal"
      onClose={busy ? undefined : onClose}
      footer={(
        <>
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="danger-button delete-project-button" type="button" disabled={busy} onClick={onDelete}>
            <Trash2 size={15} />
            {busy ? '正在删除…' : '删除项目及目录'}
          </button>
        </>
      )}
    >
      <div className="delete-project-content">
        <div className="delete-project-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>请确认没有需要保留的代码或素材</strong>
            <span>删除后无法从 Noobi.ai 中恢复。</span>
          </div>
        </div>
        <div className="delete-project-path">
          <FolderX size={17} />
          <div>
            <span>将被删除的目录</span>
            <code title={project.root}>{project.root}</code>
          </div>
        </div>
      </div>
    </Modal>
  );
}

import { FolderOpen, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import type {
  CreateProjectInput,
  ModelOption,
  TargetFrameRate,
} from '../../shared/contracts';
import { DEFAULT_TARGET_FRAME_RATE } from '../../shared/contracts';
import { toMessage } from '../ui';
import { AssetRequirement } from './AssetRequirement';
import { FrameRateControl } from './FrameRateControl';
import { Modal } from './Modal';

interface NewProjectModalProps {
  defaultDirectory: string;
  defaultModel: string | null;
  imageGenerationAvailable: boolean;
  models: readonly ModelOption[];
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}

const EXAMPLES = [
  '制作一个俯视角末日生存游戏，三种枪械，敌人会随波次进化。',
  '制作一个横版像素动作游戏，包含二段跳、冲刺和三阶段 Boss。',
  '制作一个轻量塔防游戏，三类防御塔、元素克制和十波敌人。',
];

export function NewProjectModal({
  defaultDirectory,
  defaultModel,
  imageGenerationAvailable,
  models,
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
  const [parentDirectory, setParentDirectory] = useState(defaultDirectory);
  const [model, setModel] = useState(
    defaultModel ?? models.find((item) => item.isDefault)?.model ?? models[0]?.model ?? '',
  );
  const [targetFrameRate, setTargetFrameRate] = useState<TargetFrameRate>(DEFAULT_TARGET_FRAME_RATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function chooseDirectory() {
    const directory = await window.noobi.chooseDirectory();
    if (directory) setParentDirectory(directory);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !idea.trim() || !parentDirectory.trim()) {
      setError('请填写项目名称、游戏创意和保存位置。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        idea: idea.trim(),
        parentDirectory: parentDirectory.trim(),
        model: model || null,
        targetFrameRate,
      });
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      eyebrow="NEW / GAME"
      title="把一句想法变成游戏"
      description="Noobi 会创建独立工作区，并让 Codex 在其中完成策划、实现与验证。"
      className="new-project-modal"
      onClose={busy ? undefined : onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          <span>项目名称</span>
          <input
            value={name}
            autoFocus
            maxLength={80}
            placeholder="例如：Dead City"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label>
          <span>保存位置</span>
          <div className="path-control">
            <input
              value={parentDirectory}
              placeholder="选择父目录"
              onChange={(event) => setParentDirectory(event.target.value)}
            />
            <button type="button" onClick={() => void chooseDirectory()}>
              <FolderOpen size={15} /> 选择
            </button>
          </div>
        </label>

        <label>
          <span>Agent 模型</span>
          <select
            value={model}
            disabled={models.length === 0}
            onChange={(event) => setModel(event.target.value)}
          >
            {models.length === 0 ? <option value="">登录后读取模型</option> : null}
            {models.map((item) => (
              <option value={item.model} key={item.id}>
                {item.displayName} · {item.defaultEffort.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <AssetRequirement
          imageGenerationAvailable={imageGenerationAvailable}
        />

        <FrameRateControl value={targetFrameRate} onChange={setTargetFrameRate} />

        <label>
          <span>游戏创意</span>
          <textarea
            value={idea}
            rows={7}
            maxLength={12_000}
            placeholder="描述玩法、视角、主题、美术风格，以及你最在意的体验…"
            onChange={(event) => setIdea(event.target.value)}
          />
        </label>

        <div className="example-row">
          <span>IDEA STARTERS</span>
          {EXAMPLES.map((example, index) => (
            <button
              type="button"
              key={example}
              title={example}
              onClick={() => setIdea(example)}
            >
              0{index + 1}
            </button>
          ))}
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <footer className="form-actions">
          <p>项目会在独立目录中生成；Noobi 不会修改其他工作区。</p>
          <button className="primary-button" type="submit" disabled={busy}>
            <Sparkles size={15} />
            {busy ? '正在创建…' : '创建制作任务'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

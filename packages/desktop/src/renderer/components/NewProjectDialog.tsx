import { FolderOpen, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import type { CreateProjectInput } from '../../shared/types';

interface NewProjectDialogProps {
  defaultDirectory: string;
  onClose: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}

const EXAMPLES = [
  '制作一个俯视角末日生存游戏，玩家可以切换三种枪械并抵御逐渐增强的僵尸浪潮。',
  '制作一个横版像素动作游戏，主角能二段跳、冲刺并挑战三阶段 Boss。',
  '制作一个轻松的塔防游戏，包含三类防御塔、元素克制和十波敌人。',
];

export function NewProjectDialog({
  defaultDirectory,
  onClose,
  onCreate,
}: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [directory, setDirectory] = useState(defaultDirectory);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function chooseDirectory() {
    const selected = await window.gameAgent.chooseDirectory();
    if (selected) setDirectory(selected);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onCreate({ name, directory, prompt });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog new-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-title"
      >
        <header>
          <div>
            <span className="dialog-index">NEW / GAME</span>
            <h2 id="new-title">把一句想法变成游戏</h2>
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>项目名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：Dead City"
              autoFocus
            />
          </label>
          <label>
            <span>保存位置</span>
            <div className="path-input">
              <input
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
              />
              <button type="button" onClick={chooseDirectory}>
                <FolderOpen size={15} />
                选择
              </button>
            </div>
          </label>
          <label>
            <span>游戏创意</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="描述玩法、视角、主题、美术风格和你最在意的体验……"
              rows={7}
            />
          </label>
          <div className="prompt-examples">
            <span>试试这些方向</span>
            {EXAMPLES.map((example, index) => (
              <button
                type="button"
                key={example}
                onClick={() => setPrompt(example)}
              >
                0{index + 1}
              </button>
            ))}
          </div>
          {error ? <div className="form-error">{error}</div> : null}
          <footer>
            <p>项目会在独立目录中生成，原始模板不会被修改。</p>
            <button className="primary-button" disabled={busy} type="submit">
              <Sparkles size={15} />
              {busy ? '正在创建…' : '创建制作任务'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

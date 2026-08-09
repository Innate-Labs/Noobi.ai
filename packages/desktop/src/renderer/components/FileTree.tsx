import { ChevronRight, File, Folder } from 'lucide-react';
import { useState } from 'react';
import type { FileNode } from '../../shared/types';

interface FileTreeProps {
  nodes: FileNode[];
  selected?: string;
  onSelect: (path: string) => void;
  depth?: number;
}

export function FileTree({
  nodes,
  selected,
  onSelect,
  depth = 0,
}: FileTreeProps) {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={depth}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function FileTreeNode({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: FileNode;
  depth: number;
  selected?: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isDirectory = node.type === 'directory';
  return (
    <div>
      <button
        className={`file-node ${selected === node.path ? 'is-selected' : ''}`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() =>
          isDirectory ? setOpen((value) => !value) : onSelect(node.path)
        }
      >
        {isDirectory ? (
          <>
            <ChevronRight size={12} className={open ? 'is-open' : ''} />
            <Folder size={13} />
          </>
        ) : (
          <>
            <span className="file-spacer" />
            <File size={13} />
          </>
        )}
        <span>{node.name}</span>
      </button>
      {isDirectory && open && node.children ? (
        <FileTree
          nodes={node.children}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      ) : null}
    </div>
  );
}

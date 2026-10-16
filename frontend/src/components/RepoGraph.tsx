import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  fetchFileContent,
  type FileTreeEntry,
  type RepoFileContentResponse,
} from '../api/client';

// ── Colors & Categories ───────────────────────────────────────────────────

export interface FileCategory {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export const CATEGORIES: Record<string, FileCategory> = {
  folder: {
    label: 'Folder',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd',
  },
  code: {
    label: 'Code',
    color: '#15803d',
    bg: '#f0fdf4',
    border: '#bbf7d0',
  },
  config: {
    label: 'Config / Build',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
  },
  doc: {
    label: 'Documentation',
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#99f6e4',
  },
  legal: {
    label: 'License / Policy',
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#86efac',
  },
  style: {
    label: 'Style / Asset',
    color: '#db2777',
    bg: '#fdf2f8',
    border: '#fbcfe8',
  },
  other: {
    label: 'Other',
    color: '#64748b',
    bg: '#f8fafc',
    border: '#cbd5e1',
  },
};

export function getFileCategory(path: string, isFolder: boolean): FileCategory {
  if (isFolder) return CATEGORIES.folder;
  const lower = path.toLowerCase();
  const name = lower.split('/').pop() || '';

  if (name.includes('license') || name.includes('contributing') || name.includes('security') || name.includes('code_of_conduct')) {
    return CATEGORIES.legal;
  }
  if (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.rst') || name.endsWith('.doc')) {
    return CATEGORIES.doc;
  }
  if (
    name.endsWith('.json') ||
    name.endsWith('.yaml') ||
    name.endsWith('.yml') ||
    name.endsWith('.toml') ||
    name.endsWith('.xml') ||
    name.startsWith('dockerfile') ||
    name.includes('config') ||
    name.startsWith('.')
  ) {
    return CATEGORIES.config;
  }
  if (
    name.endsWith('.ts') ||
    name.endsWith('.tsx') ||
    name.endsWith('.js') ||
    name.endsWith('.jsx') ||
    name.endsWith('.py') ||
    name.endsWith('.rs') ||
    name.endsWith('.go') ||
    name.endsWith('.java') ||
    name.endsWith('.c') ||
    name.endsWith('.cpp') ||
    name.endsWith('.rb') ||
    name.endsWith('.php') ||
    name.endsWith('.sh')
  ) {
    return CATEGORIES.code;
  }
  if (
    name.endsWith('.css') ||
    name.endsWith('.scss') ||
    name.endsWith('.sass') ||
    name.endsWith('.svg') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.ico')
  ) {
    return CATEGORIES.style;
  }

  return CATEGORIES.other;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Tree Construction ──────────────────────────────────────────────────────

interface RawTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'root' | 'folder' | 'file';
  size: number | null;
  children: Map<string, RawTreeNode>;
}

function buildHierarchy(files: FileTreeEntry[], repoName: string): RawTreeNode {
  const root: RawTreeNode = {
    id: 'root',
    name: repoName,
    path: '',
    type: 'root',
    size: null,
    children: new Map(),
  };

  for (const f of files) {
    const parts = f.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      const subPath = parts.slice(0, i + 1).join('/');

      if (isLeaf && f.type === 'blob') {
        current.children.set(part, {
          id: `file:${subPath}`,
          name: part,
          path: subPath,
          type: 'file',
          size: f.size,
          children: new Map(),
        });
      } else {
        if (!current.children.has(part)) {
          current.children.set(part, {
            id: `folder:${subPath}`,
            name: part,
            path: subPath,
            type: 'folder',
            size: null,
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
      }
    }
  }

  return root;
}

// ── Custom Node Components ─────────────────────────────────────────────────

interface CustomNodeData {
  id: string;
  name: string;
  path: string;
  nodeType: 'root' | 'folder' | 'file';
  size: number | null;
  childCount?: number;
  isExpanded?: boolean;
  isMatched?: boolean;
  isSelected?: boolean;
  onToggleExpand?: (path: string) => void;
  onSelectFile?: (nodeData: CustomNodeData) => void;
}

function RepoCustomNode({ data }: { data: CustomNodeData }) {
  const isRoot = data.nodeType === 'root';
  const isFolder = data.nodeType === 'folder';
  const cat = getFileCategory(data.path, isFolder || isRoot);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder && data.onToggleExpand) {
      data.onToggleExpand(data.path);
    } else if (!isFolder && !isRoot && data.onSelectFile) {
      data.onSelectFile(data);
    }
  };

  return (
    <div
      onClick={handleClick}
      title={data.path || data.name}
      style={{
        background: isRoot
          ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)'
          : data.isSelected
          ? '#e0f2fe'
          : cat.bg,
        border: `1.5px solid ${
          data.isMatched
            ? '#0d9488'
            : data.isSelected
            ? '#0284c7'
            : cat.border
        }`,
        boxShadow: data.isMatched
          ? '0 0 10px rgba(13, 148, 136, 0.35)'
          : data.isSelected
          ? '0 0 10px rgba(2, 132, 199, 0.35)'
          : 'var(--shadow-sm)',
        borderRadius: isRoot ? 'var(--radius-lg)' : 'var(--radius-md)',
        padding: isRoot ? '8px 14px' : '6px 10px',
        color: 'var(--text-primary)',
        fontSize: isRoot ? '13px' : '11px',
        fontFamily: isRoot ? 'var(--font-sans)' : 'var(--font-mono)',
        fontWeight: isRoot || isFolder ? 600 : 400,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: isRoot ? '140px' : '100px',
        maxWidth: '240px',
        transition: 'all 150ms ease',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: cat.color, width: 6, height: 6 }} />

      {/* Icon */}
      {isRoot ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ) : isFolder ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#0284c7" stroke="none">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}

      {/* Label */}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {data.name}
      </span>

      {/* Folder Expand/Collapse badge */}
      {isFolder && typeof data.childCount === 'number' && (
        <span
          style={{
            fontSize: '9px',
            background: '#e2e8f0',
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
            color: '#334155',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          {data.isExpanded ? '−' : '+'} {data.childCount}
        </span>
      )}

      {/* File Size */}
      {!isFolder && !isRoot && data.size !== null && (
        <span
          style={{
            fontSize: '9px',
            color: 'var(--text-muted)',
            marginLeft: 'auto',
          }}
        >
          {formatSize(data.size)}
        </span>
      )}

      <Handle type="source" position={Position.Right} style={{ background: cat.color, width: 6, height: 6 }} />
    </div>
  );
}

const nodeTypes = {
  custom: RepoCustomNode,
};

// ── Graph Layout Calculator ────────────────────────────────────────────────

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
  totalNodesInRepo: number;
  renderedNodeCount: number;
}

function computeGraphLayout(
  root: RawTreeNode,
  expandedPaths: Set<string>,
  searchQuery: string,
  selectedFilePath: string | null,
  onToggleExpand: (path: string) => void,
  onSelectFile: (data: CustomNodeData) => void
): LayoutResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let yCounter = 40;
  const X_SPACING = 250;
  const Y_SPACING = 55;

  let totalNodesInRepo = 0;
  function countAll(n: RawTreeNode) {
    totalNodesInRepo++;
    n.children.forEach(countAll);
  }
  countAll(root);

  const queryLower = searchQuery.trim().toLowerCase();

  function traverse(n: RawTreeNode, depth: number): number {
    const isRoot = n.type === 'root';
    const isExpanded = isRoot || expandedPaths.has(n.path);
    const isMatched = queryLower
      ? n.name.toLowerCase().includes(queryLower) || n.path.toLowerCase().includes(queryLower)
      : false;
    const isSelected = selectedFilePath === n.path && n.type === 'file';

    const childEntries = Array.from(n.children.values());

    let nodeY: number;

    if (!isExpanded || childEntries.length === 0) {
      // Leaf position
      nodeY = yCounter;
      yCounter += Y_SPACING;
    } else {
      // Layout children first, then center parent among children
      const childYs: number[] = [];
      for (const child of childEntries) {
        const cY = traverse(child, depth + 1);
        childYs.push(cY);

        edges.push({
          id: `edge:${n.id}->${child.id}`,
          source: n.id,
          target: child.id,
          type: 'smoothstep',
          style: { stroke: 'rgba(22, 163, 74, 0.35)', strokeWidth: 1.5 },
          animated: isMatched,
        });
      }
      nodeY = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }

    const nodeX = depth * X_SPACING + 40;

    nodes.push({
      id: n.id,
      type: 'custom',
      position: { x: nodeX, y: nodeY },
      data: {
        id: n.id,
        name: n.name,
        path: n.path,
        nodeType: n.type,
        size: n.size,
        childCount: childEntries.length,
        isExpanded,
        isMatched,
        isSelected,
        onToggleExpand,
        onSelectFile,
      },
    });

    return nodeY;
  }

  traverse(root, 0);

  return {
    nodes,
    edges,
    totalNodesInRepo,
    renderedNodeCount: nodes.length,
  };
}

// ── Graph Inner Canvas (Uses React Flow Hooks) ──────────────────────────────

interface InnerGraphProps {
  files: FileTreeEntry[];
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  onAskAi?: (file: { path: string; name: string; content: string | null }) => void;
  onFileSelected?: (file: { path: string; name: string; content: string | null } | null) => void;
}

function InnerGraph({
  files,
  repoName,
  repoUrl,
  defaultBranch,
  onAskAi,
  onFileSelected,
}: InnerGraphProps) {
  const { fitView } = useReactFlow();

  // Expanded folders state
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Default expansion: depth 1 folders up to 40 nodes
    const initial = new Set<string>();
    for (const f of files) {
      const parts = f.path.split('/');
      if (parts.length > 1) {
        initial.add(parts[0]);
      }
      if (initial.size >= 8) break;
    }
    return initial;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<CustomNodeData | null>(null);

  // File content panel states
  const [contentLoading, setContentLoading] = useState(false);
  const [fileContentData, setFileContentData] = useState<RepoFileContentResponse | null>(null);
  const [contentCopied, setContentCopied] = useState(false);

  // Build raw hierarchical tree
  const rootTree = useMemo(() => buildHierarchy(files, repoName), [files, repoName]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(
    (fileNode: CustomNodeData) => {
      setSelectedFile(fileNode);
      onFileSelected?.({
        path: fileNode.path,
        name: fileNode.name,
        content: null,
      });
    },
    [onFileSelected]
  );

  // Compute Layout
  const layout = useMemo(() => {
    return computeGraphLayout(
      rootTree,
      expandedPaths,
      searchQuery,
      selectedFile?.path || null,
      toggleExpand,
      handleSelectFile
    );
  }, [rootTree, expandedPaths, searchQuery, selectedFile, toggleExpand, handleSelectFile]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layout.edges);

  useEffect(() => {
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [layout, setNodes, setEdges]);

  // Fit view on mount or repo change
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView, repoName]);

  // Expand all folders
  const handleExpandAll = () => {
    const all = new Set<string>();
    function collect(n: RawTreeNode) {
      if (n.type === 'folder' && n.path) all.add(n.path);
      n.children.forEach(collect);
    }
    collect(rootTree);
    setExpandedPaths(all);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
  };

  // Collapse all folders
  const handleCollapseAll = () => {
    setExpandedPaths(new Set());
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 150);
  };

  // Fetch file content on-demand when selectedFile changes
  useEffect(() => {
    if (!selectedFile || selectedFile.nodeType !== 'file') {
      setFileContentData(null);
      return;
    }

    let isMounted = true;
    setContentLoading(true);
    setFileContentData(null);

    fetchFileContent({
      repository_url: repoUrl,
      path: selectedFile.path,
      branch: defaultBranch,
    })
      .then((data) => {
        if (isMounted) {
          setFileContentData(data);
          setContentLoading(false);
          onFileSelected?.({
            path: selectedFile.path,
            name: selectedFile.name,
            content: data.content || null,
          });
        }
      })
      .catch((err) => {
        if (isMounted) {
          setFileContentData({
            path: selectedFile.path,
            content: null,
            size: selectedFile.size,
            is_binary: false,
            truncated: false,
            error: err instanceof Error ? err.message : 'Failed to fetch content',
            html_url: `${repoUrl}/blob/${defaultBranch}/${selectedFile.path}`,
          });
          setContentLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFile, repoUrl, defaultBranch]);

  const handleCopyCode = async () => {
    if (!fileContentData?.content) return;
    try {
      await navigator.clipboard.writeText(fileContentData.content);
      setContentCopied(true);
      setTimeout(() => setContentCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Matched search count
  const matchedCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(q)).length;
  }, [files, searchQuery]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '620px', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-input)' }}>
      {/* Top Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: selectedFile ? 390 : 12,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexWrap: 'wrap',
          pointerEvents: 'none',
        }}
      >
        {/* Search Input */}
        <div style={{ pointerEvents: 'auto', position: 'relative', width: '260px' }}>
          <input
            type="text"
            placeholder="Search graph (e.g. index.ts, src)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: '#ffffff',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px 6px 30px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-primary)',
              outline: 'none',
              boxShadow: 'var(--shadow-sm)',
            }}
          />
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {searchQuery && (
          <span
            style={{
              pointerEvents: 'auto',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            {matchedCount} matching
          </span>
        )}

        {/* View Action Buttons */}
        <div style={{ pointerEvents: 'auto', display: 'flex', gap: '4px' }}>
          <button
            type="button"
            onClick={handleExpandAll}
            className="retry-btn"
            style={{ padding: '4px 8px', fontSize: '11px' }}
            title="Expand all directories"
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="retry-btn"
            style={{ padding: '4px 8px', fontSize: '11px' }}
            title="Collapse to root"
          >
            Collapse All
          </button>
          <button
            type="button"
            onClick={() => fitView({ padding: 0.2, duration: 400 })}
            className="retry-btn"
            style={{ padding: '4px 8px', fontSize: '11px' }}
            title="Fit graph to view"
          >
            Fit View
          </button>
        </div>

        {/* Node Count Indicator */}
        <span
          style={{
            marginLeft: 'auto',
            background: '#ffffff',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            pointerEvents: 'auto',
          }}
        >
          {layout.renderedNodeCount} of {layout.totalNodesInRepo} nodes shown
          {layout.renderedNodeCount < layout.totalNodesInRepo && ' (truncated)'}
        </span>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#f8faf8' }}
      >
        <Background color="#dcf2e3" gap={24} size={1.5} />
        <Controls
          style={{
            bottom: 35,
            left: 12,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.data?.nodeType === 'root') return '#16a34a';
            if (n.data?.nodeType === 'folder') return '#0284c7';
            return '#15803d';
          }}
          maskColor="rgba(240, 253, 244, 0.7)"
          style={{
            bottom: 35,
            right: selectedFile ? 390 : 12,
            background: '#ffffff',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            width: 140,
            height: 90,
          }}
        />
      </ReactFlow>

      {/* Bottom Legend Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          right: selectedFile ? 390 : 12,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '4px 10px',
          fontSize: '10px',
          zIndex: 5,
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Legend:</span>
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <div key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
            <span style={{ color: 'var(--text-secondary)' }}>{cat.label}</span>
          </div>
        ))}
      </div>

      {/* Side Details Drawer */}
      {selectedFile && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '380px',
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Drawer Header */}
          <div
            style={{
              padding: 'var(--space-4)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-2)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <span className="tag tag-purple" style={{ fontSize: '10px' }}>
                  {getFileCategory(selectedFile.path, false).label}
                </span>
                {selectedFile.size !== null && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {formatSize(selectedFile.size)}
                  </span>
                )}
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedFile.name}
              </h3>
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedFile.path}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                onFileSelected?.(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
              title="Close panel"
            >
              &times;
            </button>
          </div>

          {/* Action Links */}
          <div style={{ padding: '8px var(--space-4)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-input)', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <a
                href={`${repoUrl}/blob/${defaultBranch}/${selectedFile.path}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '11px',
                  color: 'var(--accent-blue)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                }}
              >
                <span>View on GitHub</span>
                <span>↗</span>
              </a>

              {onAskAi && (
                <button
                  type="button"
                  onClick={() =>
                    onAskAi({
                      path: selectedFile.path,
                      name: selectedFile.name,
                      content: fileContentData?.content || null,
                    })
                  }
                  className="retry-btn"
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    color: 'var(--accent-purple)',
                    borderColor: 'rgba(139, 92, 246, 0.4)',
                    background: 'rgba(139, 92, 246, 0.1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontWeight: 600,
                  }}
                  title="Ask AI Assistant to explain this file"
                >
                  <span>✨ Explain this file</span>
                </button>
              )}
            </div>

            {fileContentData?.content && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="retry-btn"
                style={{ padding: '2px 8px', fontSize: '10px' }}
              >
                {contentCopied ? 'Copied!' : 'Copy Code'}
              </button>
            )}
          </div>

          {/* File Content Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)' }}>
            {contentLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: 'var(--space-2)' }}>
                <div className="spinner" style={{ width: '16px', height: '16px' }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Loading file content from GitHub...
                </span>
              </div>
            ) : fileContentData?.is_binary ? (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                <p>Binary or media file preview is not supported.</p>
                <a
                  href={`${repoUrl}/blob/${defaultBranch}/${selectedFile.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="retry-btn"
                  style={{ display: 'inline-block', marginTop: 'var(--space-3)' }}
                >
                  Inspect on GitHub
                </a>
              </div>
            ) : fileContentData?.error ? (
              <div style={{ padding: 'var(--space-3)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--accent-red)', fontSize: 'var(--text-xs)' }}>
                <strong>Could not load content:</strong> {fileContentData.error}
              </div>
            ) : fileContentData?.content !== null && fileContentData?.content !== undefined ? (
              <div>
                {fileContentData.truncated && (
                  <div style={{ marginBottom: 'var(--space-2)', padding: '4px 8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-sm)', fontSize: '10px', color: 'var(--accent-amber)' }}>
                    File is large. Displaying preview.
                  </div>
                )}
                <pre
                  style={{
                    margin: 0,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                    lineHeight: 1.5,
                  }}
                >
                  <code>{fileContentData.content}</code>
                </pre>
              </div>
            ) : (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                No content available for this file.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Wrapper Component ─────────────────────────────────────────────────

interface RepoGraphProps {
  files?: FileTreeEntry[];
  repoName: string;
  repoUrl: string;
  defaultBranch?: string;
  isEmpty?: boolean;
  onAskAi?: (file: { path: string; name: string; content: string | null }) => void;
  onFileSelected?: (file: { path: string; name: string; content: string | null } | null) => void;
}

export default function RepoGraph({
  files = [],
  repoName,
  repoUrl,
  defaultBranch = 'main',
  isEmpty = false,
  onAskAi,
  onFileSelected,
}: RepoGraphProps) {
  if (isEmpty || files.length === 0) {
    return (
      <div className="card fade-in" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <div style={{ color: 'var(--accent-amber)', marginBottom: 'var(--space-3)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          Empty Repository
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto' }}>
          This repository has no committed files or branches to graph. Once files are committed, their directory hierarchy will be mapped here visually.
        </p>
      </div>
    );
  }

  return (
    <div className="card fade-in" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>
            <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Interactive Repository Graph
          </h2>
          <p style={{ margin: '2px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Explore <strong>{repoName}</strong> codebase architecture. Pan, zoom, click folders to expand/collapse, or click files to inspect real source code.
          </p>
        </div>
      </div>

      <ReactFlowProvider>
        <InnerGraph
          files={files}
          repoName={repoName}
          repoUrl={repoUrl}
          defaultBranch={defaultBranch}
          onAskAi={onAskAi}
          onFileSelected={onFileSelected}
        />
      </ReactFlowProvider>
    </div>
  );
}

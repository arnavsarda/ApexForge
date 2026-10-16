import { useState, useMemo } from 'react';
import type { FileTreeEntry } from '../api/client';

interface Props {
  files: FileTreeEntry[];
  repoUrl: string;
  defaultBranch: string;
  onOpenGraph?: () => void;
}

function fileIcon(type: string, path: string) {
  if (type === 'tree') {
    return (
      <svg className="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="var(--accent-blue)" stroke="none">
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      </svg>
    );
  }

  // Identify special file types
  const lower = path.toLowerCase();
  let color = 'var(--text-muted)';
  if (lower.endsWith('.md')) color = 'var(--accent-blue)';
  else if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml')) color = 'var(--accent-amber)';
  else if (lower === 'license' || lower.startsWith('license')) color = 'var(--accent-green)';
  else if (lower.startsWith('dockerfile') || lower.startsWith('docker-compose')) color = 'var(--accent-cyan)';
  else if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.py')) color = 'var(--accent-purple)';

  return (
    <svg className="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileTree({ files, repoUrl, defaultBranch, onOpenGraph }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'folders' | 'docs' | 'code'>('all');

  const filtered = useMemo(() => {
    return files
      .filter((f) => {
        // Text match
        if (searchQuery.trim() && !f.path.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }

        // Type filter
        if (filterType === 'folders') return f.type === 'tree';
        if (filterType === 'docs') {
          const lower = f.path.toLowerCase();
          return lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.includes('license');
        }
        if (filterType === 'code') {
          const lower = f.path.toLowerCase();
          return lower.endsWith('.py') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.rs') || lower.endsWith('.go');
        }
        return true;
      })
      .sort((a, b) => {
        if (a.type === 'tree' && b.type !== 'tree') return -1;
        if (a.type !== 'tree' && b.type === 'tree') return 1;
        return a.path.localeCompare(b.path);
      });
  }, [files, searchQuery, filterType]);

  return (
    <div className="card fade-in fade-in-delay-4">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
          Repository Structure
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {onOpenGraph && (
            <button
              type="button"
              onClick={onOpenGraph}
              className="retry-btn"
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                color: 'var(--accent-cyan)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Open full interactive visual graph view"
            >
              <span>Visual Graph</span>
              <span>↗</span>
            </button>
          )}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {filtered.length} of {files.length} items
          </span>
        </div>
      </div>

      {/* Search and quick filter pills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search files or directories (e.g. src, config)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px 6px 32px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
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
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px',
              }}
            >
              &times;
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {(['all', 'folders', 'docs', 'code'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              style={{
                background: filterType === t ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-input)',
                color: filterType === t ? 'var(--accent-blue)' : 'var(--text-muted)',
                border: `1px solid ${filterType === t ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-subtle)'}`,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'docs' ? 'Docs / Config' : t}
            </button>
          ))}
        </div>
      </div>

      {/* File Tree List */}
      <div className="file-tree" style={{ maxHeight: '380px', overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            No files match your search criteria.
          </div>
        ) : (
          filtered.map((f) => {
            const href = f.type === 'tree'
              ? `${repoUrl}/tree/${defaultBranch}/${f.path}`
              : `${repoUrl}/blob/${defaultBranch}/${f.path}`;
            return (
              <a
                key={f.path}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="file-entry"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                {fileIcon(f.type, f.path)}
                <span style={{ flex: 1 }}>{f.path}</span>
                {f.size !== null && f.type === 'blob' && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    {formatSize(f.size)}
                  </span>
                )}
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}

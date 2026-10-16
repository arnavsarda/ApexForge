import type { FileTreeEntry } from '../api/client';

interface Props {
  files: FileTreeEntry[];
  repoUrl: string;
  defaultBranch: string;
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

export default function FileTree({ files, repoUrl, defaultBranch }: Props) {
  // Sort: directories first, then files, alphabetical
  const sorted = [...files].sort((a, b) => {
    if (a.type === 'tree' && b.type !== 'tree') return -1;
    if (a.type !== 'tree' && b.type === 'tree') return 1;
    return a.path.localeCompare(b.path);
  });

  return (
    <div className="card fade-in fade-in-delay-4">
      <h2 className="card-title">
        <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
        </svg>
        Repository Structure
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {sorted.length} items
        </span>
      </h2>

      <div className="file-tree" style={{ maxHeight: '380px', overflowY: 'auto' }}>
        {sorted.map((f) => {
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
        })}
      </div>
    </div>
  );
}

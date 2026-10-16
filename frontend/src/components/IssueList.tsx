import { useState, useMemo } from 'react';
import type { Issue } from '../api/client';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const LABEL_COLORS: Record<string, string> = {
  'good first issue': 'tag-green',
  'good-first-issue': 'tag-green',
  'help wanted': 'tag-amber',
  'help-wanted': 'tag-amber',
  'beginner': 'tag-green',
  'easy': 'tag-green',
  'bug': 'tag-amber',
  'enhancement': 'tag-purple',
  'documentation': 'tag',
  'docs': 'tag',
};

function labelClass(label: string): string {
  const lower = label.toLowerCase();
  return LABEL_COLORS[lower] || 'tag';
}

interface Props {
  issues: Issue[];
}

export default function IssueList({ issues }: Props) {
  const [selectedLabel, setSelectedLabel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract distinct labels for quick filter tabs
  const availableLabels = useMemo(() => {
    const set = new Set<string>();
    issues.forEach((issue) => {
      issue.labels.forEach((l) => set.add(l.toLowerCase()));
    });
    // Common labels first if present
    const common = ['good first issue', 'help wanted', 'documentation', 'bug', 'enhancement'];
    const sorted: string[] = [];
    common.forEach((c) => {
      if (set.has(c)) {
        sorted.push(c);
        set.delete(c);
      }
    });
    // Add any remaining
    Array.from(set).slice(0, 5).forEach((rem) => sorted.push(rem));
    return sorted;
  }, [issues]);

  const filtered = useMemo(() => {
    return issues.filter((issue) => {
      // Label filter
      if (selectedLabel !== 'all') {
        const hasLabel = issue.labels.some((l) => l.toLowerCase() === selectedLabel);
        if (!hasLabel) return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = issue.title.toLowerCase().includes(q);
        const matchNum = issue.number.toString().includes(q);
        const matchLabel = issue.labels.some((l) => l.toLowerCase().includes(q));
        if (!matchTitle && !matchNum && !matchLabel) return false;
      }
      return true;
    });
  }, [issues, selectedLabel, searchQuery]);

  if (issues.length === 0) {
    return (
      <div className="card fade-in fade-in-delay-2">
        <h2 className="card-title">
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Beginner-Friendly Issues
        </h2>
        <div className="empty-state">
          <p>No beginner-friendly issues found.</p>
          <p style={{ marginTop: 'var(--space-2)' }}>
            Check the repository's issue tracker for other ways to contribute.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card fade-in fade-in-delay-2">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Beginner-Friendly Issues
        </h2>
        <span className="tag tag-green" style={{ fontSize: 'var(--text-xs)' }}>
          {filtered.length} of {issues.length}
        </span>
      </div>

      {/* Filter and Search controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search issues by title, #number, or keyword..."
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

        {/* Label Filter Chips */}
        {availableLabels.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSelectedLabel('all')}
              style={{
                background: selectedLabel === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-input)',
                color: selectedLabel === 'all' ? 'var(--accent-blue)' : 'var(--text-muted)',
                border: `1px solid ${selectedLabel === 'all' ? 'rgba(59, 130, 246, 0.4)' : 'var(--border-subtle)'}`,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              All ({issues.length})
            </button>
            {availableLabels.map((lbl) => (
              <button
                key={lbl}
                type="button"
                onClick={() => setSelectedLabel(lbl)}
                style={{
                  background: selectedLabel === lbl ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-input)',
                  color: selectedLabel === lbl ? 'var(--accent-green)' : 'var(--text-muted)',
                  border: `1px solid ${selectedLabel === lbl ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-subtle)'}`,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Issues list */}
      <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: 'var(--space-2)' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            No issues match your current filters.
          </div>
        ) : (
          filtered.map((issue) => (
            <a
              key={issue.number}
              href={issue.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="issue-item"
            >
              <div className="issue-title">
                <span style={{ color: 'var(--accent-green)', marginRight: 'var(--space-2)' }}>#</span>
                {issue.title}
              </div>
              <div className="issue-meta">
                <span>#{issue.number}</span>
                <span>{timeAgo(issue.created_at)}</span>
                {issue.comments > 0 && (
                  <span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: '-2px', marginRight: '3px' }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    {issue.comments}
                  </span>
                )}
              </div>
              {issue.labels.length > 0 && (
                <div className="issue-labels">
                  {issue.labels.map((l) => (
                    <span key={l} className={`tag ${labelClass(l)}`} style={{ fontSize: '0.65rem' }}>{l}</span>
                  ))}
                </div>
              )}
            </a>
          ))
        )}
      </div>
    </div>
  );
}

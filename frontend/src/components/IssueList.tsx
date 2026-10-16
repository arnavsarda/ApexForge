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
  'help wanted': 'tag-amber',
  'beginner': 'tag-green',
  'easy': 'tag-green',
  'bug': 'tag-amber',
  'enhancement': 'tag-purple',
  'documentation': 'tag',
};

function labelClass(label: string): string {
  const lower = label.toLowerCase();
  return LABEL_COLORS[lower] || 'tag';
}

interface Props {
  issues: Issue[];
}

export default function IssueList({ issues }: Props) {
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
      <h2 className="card-title">
        <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Beginner-Friendly Issues
        <span className="tag tag-green" style={{ marginLeft: 'auto' }}>{issues.length}</span>
      </h2>

      <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: 'var(--space-2)' }}>
        {issues.map((issue) => (
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
        ))}
      </div>
    </div>
  );
}

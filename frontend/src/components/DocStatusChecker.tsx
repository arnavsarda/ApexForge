import type { DocumentationStatus } from '../api/client';

interface Props {
  status?: DocumentationStatus;
  repoUrl: string;
  defaultBranch?: string;
}

export default function DocStatusChecker({ status, repoUrl, defaultBranch = 'main' }: Props) {
  if (!status || !status.items || status.items.length === 0) {
    return null;
  }

  const gradeColor =
    status.health_grade.startsWith('A') ? 'var(--accent-green)' :
    status.health_grade.startsWith('B') ? 'var(--accent-cyan)' :
    status.health_grade.startsWith('C') ? 'var(--accent-amber)' : 'var(--accent-red)';

  return (
    <div className="card fade-in fade-in-delay-3">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Documentation Health
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            className="tag"
            style={{
              background: `rgba(16, 185, 129, 0.15)`,
              color: gradeColor,
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              border: `1px solid ${gradeColor}40`,
            }}
          >
            Grade {status.health_grade} ({status.score_percentage}%)
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            {status.present_count}/{status.total_count} files
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          background: 'var(--bg-input)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div
          style={{
            width: `${status.score_percentage}%`,
            height: '100%',
            background: `linear-gradient(90deg, var(--accent-blue), ${gradeColor})`,
            transition: 'width 600ms ease',
          }}
        />
      </div>

      {/* Item Checklist Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        {status.items.map((item) => {
          const fileLink = item.path
            ? `${repoUrl}/blob/${defaultBranch}/${item.path}`
            : undefined;

          return (
            <div
              key={item.name}
              style={{
                background: 'var(--bg-input)',
                border: `1px solid ${item.present ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                transition: 'all 150ms ease',
              }}
            >
              {/* Status Icon */}
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '1px',
                  background: item.present ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  color: item.present ? 'var(--accent-green)' : 'var(--text-muted)',
                }}
              >
                {item.present ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>

              {/* Text Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                    {item.name}
                  </span>
                  {item.present && fileLink ? (
                    <a
                      href={fileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: 'var(--accent-blue)', textDecoration: 'none' }}
                      title={`View ${item.path || item.name} on GitHub`}
                    >
                      View &rarr;
                    </a>
                  ) : (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {item.present ? 'Found' : 'Missing'}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                  {item.description}
                </p>
                {item.path && (
                  <code style={{ fontSize: '10px', color: 'var(--accent-cyan)', display: 'inline-block', marginTop: '2px' }}>
                    {item.path}
                  </code>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

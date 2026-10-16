import type { RepoMeta, LanguageBreakdown, Contributor } from '../api/client';

// GitHub language colors (top ~30)
const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Go: '#00ADD8',
  Rust: '#dea584',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Scala: '#c22d40',
  Lua: '#000080',
  Vim_Script: '#199f4b',
  R: '#198CE7',
  Perl: '#0298c3',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Clojure: '#db5855',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Zig: '#ec915c',
};

function getColor(lang: string): string {
  return LANG_COLORS[lang] || '#6b7280';
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

interface Props {
  repo: RepoMeta;
  languages: LanguageBreakdown;
  contributors: Contributor[];
}

export default function RepoOverview({ repo, languages, contributors }: Props) {
  const sortedLangs = Object.entries(languages.percentages)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="card fade-in">
      <h2 className="card-title">
        <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
        <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
          {repo.full_name}
        </a>
      </h2>

      {repo.description && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
          {repo.description}
        </p>
      )}

      <div className="stats-row">
        <div className="stat-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="stat-value">{formatNumber(repo.stars)}</span> stars
        </div>
        <div className="stat-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" />
            <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" /><path d="M12 12v3" />
          </svg>
          <span className="stat-value">{formatNumber(repo.forks)}</span> forks
        </div>
        <div className="stat-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="stat-value">{formatNumber(repo.open_issues)}</span> issues
        </div>
        {repo.license && (
          <div className="stat-item">
            <span className="tag tag-green">{repo.license}</span>
          </div>
        )}
      </div>

      {/* Language bar */}
      {sortedLangs.length > 0 ? (
        <>
          <div className="lang-bar-container">
            {sortedLangs.map(([lang, pct]) => (
              <div
                key={lang}
                className="lang-bar-segment"
                style={{ width: `${pct}%`, backgroundColor: getColor(lang) }}
                title={`${lang}: ${pct}%`}
              />
            ))}
          </div>
          <div className="lang-legend">
            {sortedLangs.slice(0, 6).map(([lang, pct]) => (
              <span key={lang} className="lang-legend-item">
                <span className="lang-dot" style={{ backgroundColor: getColor(lang) }} />
                {lang} <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
              </span>
            ))}
          </div>
        </>
      ) : repo.language ? (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <span className="tag" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
            Primary Language: {repo.language}
          </span>
        </div>
      ) : null}

      {/* Topics */}
      {repo.topics.length > 0 && (
        <div className="tags-row" style={{ marginTop: 'var(--space-4)' }}>
          {repo.topics.slice(0, 8).map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}

      {/* Contributors */}
      {contributors.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--text-secondary)' }}>
            Top Contributors
          </h3>
          <div className="contributor-row">
            {contributors.slice(0, 8).map((c) => (
              <a key={c.login} href={c.html_url} target="_blank" rel="noopener noreferrer" className="contributor-chip">
                <img src={c.avatar_url} alt={c.login} className="contributor-avatar" />
                {c.login}
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        Created {timeAgo(repo.created_at)} &middot; Updated {timeAgo(repo.updated_at)} &middot; Default branch: <code>{repo.default_branch}</code>
      </div>
    </div>
  );
}

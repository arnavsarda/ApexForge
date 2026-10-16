import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (owner: string, repo: string) => void;
  loading: boolean;
}

export function parseGitHubRepoInput(input: string): { owner: string; repo: string } | null {
  let raw = input.trim();
  if (!raw) return null;

  // Strip trailing slashes
  raw = raw.replace(/\/+$/, '');

  // 1. Try URL parsing if starts with http:// or https://
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const host = url.hostname.toLowerCase();
      if (host !== 'github.com' && host !== 'www.github.com') {
        return null; // Not github.com
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        let repo = parts[1];
        if (repo.endsWith('.git')) repo = repo.slice(0, -4);
        return { owner: parts[0], repo };
      }
      return null;
    } catch {
      return null;
    }
  }

  // 2. Try github.com/owner/repo format
  raw = raw.replace(/^(?:www\.)?github\.com\//i, '');

  // 3. Match owner/repo format
  const parts = raw.split('/').filter(Boolean);
  if (parts.length >= 2) {
    let repo = parts[1];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    // Ensure owner and repo have valid alphanumeric characters
    if (/^[a-zA-Z0-9_.-]+$/.test(parts[0]) && /^[a-zA-Z0-9_.-]+$/.test(repo)) {
      return { owner: parts[0], repo };
    }
  }

  return null;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (validationError) {
      setValidationError(null);
    }
  };

  const executeSearch = (targetQuery: string) => {
    if (loading) return;
    const parsed = parseGitHubRepoInput(targetQuery);
    if (!parsed) {
      setValidationError(
        'Please enter a valid public GitHub repository URL or owner/repo (e.g., https://github.com/fastapi/fastapi or fastapi/fastapi).'
      );
      return;
    }
    setValidationError(null);
    onSearch(parsed.owner, parsed.repo);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleQuickClick = (repoStr: string) => {
    setQuery(repoStr);
    executeSearch(repoStr);
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSubmit}>
        <div
          className="search-wrapper"
          style={{
            borderColor: validationError ? 'var(--accent-red)' : undefined,
          }}
        >
          <div className="search-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            id="search-input"
            className="search-input"
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="e.g. fastapi/fastapi or https://github.com/facebook/react"
            disabled={loading}
            autoFocus
            aria-label="GitHub Repository URL or owner/repo"
          />
          <button
            id="search-btn"
            className="search-btn"
            type="submit"
            disabled={loading || !query.trim()}
            aria-label="Analyze repository"
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Analyzing...
              </span>
            ) : (
              'Analyze'
            )}
          </button>
        </div>
      </form>

      {validationError && (
        <div
          style={{
            color: 'var(--accent-red)',
            fontSize: 'var(--text-xs)',
            marginTop: 'var(--space-2)',
            paddingLeft: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {validationError}
        </div>
      )}

      <p className="search-hint">
        Try popular repositories:{' '}
        <button
          type="button"
          className="retry-btn"
          style={{ border: 'none', padding: '2px 6px', fontSize: 'inherit', color: 'var(--text-link)', cursor: 'pointer' }}
          onClick={() => handleQuickClick('fastapi/fastapi')}
          disabled={loading}
        >
          fastapi/fastapi
        </button>
        {' '}&middot;{' '}
        <button
          type="button"
          className="retry-btn"
          style={{ border: 'none', padding: '2px 6px', fontSize: 'inherit', color: 'var(--text-link)', cursor: 'pointer' }}
          onClick={() => handleQuickClick('facebook/react')}
          disabled={loading}
        >
          facebook/react
        </button>
        {' '}&middot;{' '}
        <button
          type="button"
          className="retry-btn"
          style={{ border: 'none', padding: '2px 6px', fontSize: 'inherit', color: 'var(--text-link)', cursor: 'pointer' }}
          onClick={() => handleQuickClick('pallets/flask')}
          disabled={loading}
        >
          pallets/flask
        </button>
      </p>
    </div>
  );
}

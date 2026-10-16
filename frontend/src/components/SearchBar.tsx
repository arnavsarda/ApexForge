import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (owner: string, repo: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim().replace(/^https?:\/\/github\.com\//, '');
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length >= 2) {
      onSearch(parts[0], parts[1]);
    }
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSubmit}>
        <div className="search-wrapper">
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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="owner/repo or paste a GitHub URL..."
            disabled={loading}
            autoFocus
          />
          <button
            id="search-btn"
            className="search-btn"
            type="submit"
            disabled={loading || query.trim().split('/').filter(Boolean).length < 2}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </form>
      <p className="search-hint">
        Try: <button type="button" className="retry-btn" style={{ border: 'none', padding: '2px 6px', fontSize: 'inherit' }} onClick={() => { setQuery('facebook/react'); }}>facebook/react</button>
        {' '}&middot;{' '}
        <button type="button" className="retry-btn" style={{ border: 'none', padding: '2px 6px', fontSize: 'inherit' }} onClick={() => { setQuery('torvalds/linux'); }}>torvalds/linux</button>
        {' '}&middot;{' '}
        <button type="button" className="retry-btn" style={{ border: 'none', padding: '2px 6px', fontSize: 'inherit' }} onClick={() => { setQuery('denoland/deno'); }}>denoland/deno</button>
      </p>
    </div>
  );
}

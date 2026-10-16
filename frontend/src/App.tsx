import { useState, useEffect, useCallback } from 'react';
import './index.css';
import {
  analyzeRepository,
  fetchHealth,
  type AnalysisResponse,
  type HealthResponse,
  type OnboardingGuide as GuideType,
} from './api/client';
import SearchBar from './components/SearchBar';
import RepoOverview from './components/RepoOverview';
import OnboardingGuide from './components/OnboardingGuide';
import IssueList from './components/IssueList';
import SetupChecklist from './components/SetupChecklist';
import FileTree from './components/FileTree';
import DocStatusChecker from './components/DocStatusChecker';
import ContributorRoadmap from './components/ContributorRoadmap';
import RepoChat from './components/RepoChat';
import RepoGraph from './components/RepoGraph';
import FloatingAiChat, { type SelectedFileContext } from './components/FloatingAiChat';

type AppState =
  | { kind: 'idle' }
  | { kind: 'loading'; owner: string; repo: string }
  | { kind: 'success'; data: AnalysisResponse }
  | { kind: 'error'; message: string; owner: string; repo: string };

export default function App() {
  const [state, setState] = useState<AppState>({ kind: 'idle' });
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showReadme, setShowReadme] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'graph'>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedFileContext, setSelectedFileContext] = useState<SelectedFileContext | null>(null);
  const [pendingChatQuestion, setPendingChatQuestion] = useState<string | null>(null);

  // Check backend health on mount
  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
  }, []);

  // Track mouse for gradient glow effect
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  const handleSearch = useCallback(async (owner: string, repo: string) => {
    setState({ kind: 'loading', owner, repo });
    setShowReadme(false);
    setActiveTab('dashboard');
    setSelectedFileContext(null);
    setPendingChatQuestion(null);
    try {
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const data = await analyzeRepository(repoUrl);
      setState({ kind: 'success', data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setState({ kind: 'error', message, owner, repo });
    }
  }, []);

  return (
    <div className="app-container">
      {/* Hero */}
      <header className="hero">
        <h1 className="hero-title" style={{ cursor: 'pointer' }} onClick={() => setState({ kind: 'idle' })}>
          RepoReady
        </h1>
        <p className="hero-subtitle">
          Instantly generate an evidence-based onboarding guide for any public GitHub repository.
          Discover key architecture files, setup commands, beginner issues, and contribution workflows.
        </p>
      </header>

      {/* Search */}
      <SearchBar onSearch={handleSearch} loading={state.kind === 'loading'} />

      {/* Informative Empty State before analysis */}
      {state.kind === 'idle' && (
        <div className="empty-state-showcase fade-in">
          {/* Quick Start Open-Source Suggestions */}
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', textAlign: 'center' }}>
              Explore Curated Open-Source Repositories
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {[
                { owner: 'fastapi', repo: 'fastapi', lang: 'Python', desc: 'Modern, fast web framework for building APIs with Python 3.8+.' },
                { owner: 'facebook', repo: 'react', lang: 'JavaScript', desc: 'The library for web and native user interfaces.' },
                { owner: 'pallets', repo: 'flask', lang: 'Python', desc: 'The Python micro framework for building web applications.' },
                { owner: 'expressjs', repo: 'express', lang: 'JavaScript', desc: 'Fast, unopinionated, minimalist web framework for Node.js.' },
              ].map((item) => (
                <div
                  key={`${item.owner}/${item.repo}`}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-5)',
                    border: '1px solid var(--border-subtle)',
                    transition: 'all 200ms ease',
                  }}
                  onClick={() => handleSearch(item.owner, item.repo)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: 'var(--text-sm)' }}>
                      {item.owner}/{item.repo}
                    </span>
                    <span className="tag" style={{ fontSize: '10px' }}>{item.lang}</span>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    {item.desc}
                  </p>
                  <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Generate Guide</span>
                    <span>&rarr;</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-6)',
            }}
          >
            <div className="card">
              <div style={{ color: 'var(--accent-purple)', marginBottom: 'var(--space-2)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
                  <rect x="4" y="8" width="16" height="12" rx="2"/>
                  <circle cx="9" cy="14" r="1"/>
                  <circle cx="15" cy="14" r="1"/>
                </svg>
              </div>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                Local Qwen3 AI Guidance
              </h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Powered strictly by local Ollama (<code>qwen3:4b</code>). Zero code is sent to external clouds, with bounded prompts and honest fallbacks.
              </p>
            </div>

            <div className="card">
              <div style={{ color: 'var(--accent-green)', marginBottom: 'var(--space-2)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                12-Section Structured Onboarding
              </h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Synthesizes verified tech stack, prerequisites, installation commands, test suites, architecture files, beginner issues, and gotchas.
              </p>
            </div>

            <div className="card">
              <div style={{ color: 'var(--accent-blue)', marginBottom: 'var(--space-2)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: 'var(--space-1)' }}>
                GitHub REST API Verification
              </h3>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Directly fetches real repository trees, language breakdown statistics, and open issues while strictly filtering out pull requests.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {state.kind === 'loading' && (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">
            Analyzing {state.owner}/{state.repo}...
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
            Retrieving repository metadata, tree files, and synthesizing onboarding steps.
          </p>
        </div>
      )}

      {/* Error */}
      {state.kind === 'error' && (
        <div className="error-container fade-in">
          <div className="error-icon" style={{ color: 'var(--accent-red)' }}>!</div>
          <h2 className="error-title">Analysis Failed</h2>
          <p className="error-detail">{state.message}</p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="retry-btn"
              onClick={() => handleSearch(state.owner, state.repo)}
            >
              Try Again
            </button>
            <button
              className="retry-btn"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => setState({ kind: 'idle' })}
            >
              Back to Overview
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {state.kind === 'success' && (
        <div className="results-section">
          {/* Warnings Banner if any */}
          {state.data.warnings && state.data.warnings.length > 0 && (
            <div
              className="card fade-in"
              style={{
                marginBottom: 'var(--space-6)',
                borderLeft: '4px solid var(--accent-amber)',
                background: 'rgba(245, 158, 11, 0.05)',
              }}
            >
              <h3 style={{ color: 'var(--accent-amber)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
                Analysis Notices
              </h3>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                {state.data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* View Mode Tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-6)',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: 'var(--space-3)',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              style={{
                background: activeTab === 'dashboard' ? 'var(--bg-card)' : 'transparent',
                color: activeTab === 'dashboard' ? 'var(--accent-green)' : 'var(--text-muted)',
                border: `1.5px solid ${activeTab === 'dashboard' ? 'var(--border-focus)' : 'transparent'}`,
                boxShadow: activeTab === 'dashboard' ? 'var(--shadow-sm)' : 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 150ms ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              Onboarding Dashboard
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('graph')}
              style={{
                background: activeTab === 'graph' ? 'var(--bg-card)' : 'transparent',
                color: activeTab === 'graph' ? 'var(--accent-green)' : 'var(--text-muted)',
                border: `1.5px solid ${activeTab === 'graph' ? 'var(--border-focus)' : 'transparent'}`,
                boxShadow: activeTab === 'graph' ? 'var(--shadow-sm)' : 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 150ms ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Repository Graph
              {state.data.file_tree && state.data.file_tree.length > 0 && (
                <span
                  style={{
                    background: 'rgba(22, 163, 74, 0.15)',
                    color: 'var(--accent-green)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {state.data.file_tree.length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'graph' ? (
            <div className="fade-in">
              <RepoGraph
                files={state.data.file_tree || []}
                repoName={state.data.repository.full_name}
                repoUrl={state.data.repository.html_url}
                defaultBranch={state.data.repository.default_branch}
                isEmpty={state.data.repository.is_empty}
                onAskAi={(file) => {
                  setSelectedFileContext(file);
                  setIsChatOpen(true);
                  setPendingChatQuestion(`Explain the file ${file.name}`);
                }}
                onFileSelected={(file) => setSelectedFileContext(file)}
              />
            </div>
          ) : (
            <div className="section-grid">
              {/* Left column: Overview + Doc Health + File Tree + Sources */}
              <div>
                <RepoOverview
                  repo={state.data.repository}
                  languages={state.data.languages || { languages: {}, percentages: {} }}
                  contributors={state.data.contributors || []}
                />

                {state.data.documentation_status && (
                  <div style={{ marginTop: 'var(--space-6)' }}>
                    <DocStatusChecker
                      status={state.data.documentation_status}
                      repoUrl={state.data.repository.html_url}
                      defaultBranch={state.data.repository.default_branch}
                    />
                  </div>
                )}

                {state.data.file_tree && state.data.file_tree.length > 0 && (
                  <div style={{ marginTop: 'var(--space-6)' }}>
                    <FileTree
                      files={state.data.file_tree}
                      repoUrl={state.data.repository.html_url}
                      defaultBranch={state.data.repository.default_branch}
                      onOpenGraph={() => setActiveTab('graph')}
                    />
                  </div>
                )}

                {/* Evidence Sources */}
                {state.data.sources && state.data.sources.length > 0 && (
                  <div className="card fade-in fade-in-delay-3" style={{ marginTop: 'var(--space-6)' }}>
                    <h3 className="card-title" style={{ fontSize: 'var(--text-sm)' }}>
                      Evidence Sources
                    </h3>
                    <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                      {state.data.sources.map((s, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          <code>{s}</code>
                        </li>
                      ))}
                    </ul>
                    <p style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Generated at: {state.data.generated_at}
                    </p>
                  </div>
                )}

                {/* README (collapsible) */}
                {state.data.readme_html && (
                  <div className="card fade-in fade-in-delay-5" style={{ marginTop: 'var(--space-6)' }}>
                    <h2 className="card-title" style={{ cursor: 'pointer' }} onClick={() => setShowReadme(!showReadme)}>
                      <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      README.md
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{ marginLeft: 'auto', transition: 'transform 200ms', transform: showReadme ? 'rotate(180deg)' : 'rotate(0)' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </h2>
                    {showReadme && (
                      <div
                        className="readme-container"
                        dangerouslySetInnerHTML={{ __html: state.data.readme_html }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Right column: Guide + Contributor Roadmap + AI Chat + Issues + Checklist */}
              <div>
                <OnboardingGuide
                  guide={state.data.guide || ({
                    summary: state.data.overview,
                    tech_stack: state.data.tech_stack,
                    setup_steps: state.data.setup_steps,
                    contribution_tips: state.data.contribution_tips,
                    key_files: state.data.key_files,
                    ai_enhanced: false,
                    ai_model: null,
                    prerequisites: [],
                    run_commands: [],
                    test_commands: [],
                    suggested_first_contribution: null,
                    common_problems: [],
                    unavailable_info: [],
                    sections: state.data.sections,
                    full_guide_markdown: state.data.full_guide_markdown,
                    ai_status: state.data.ai_status,
                  } as GuideType)}
                />

                {state.data.contributor_roadmap && state.data.contributor_roadmap.length > 0 && (
                  <div style={{ marginTop: 'var(--space-6)' }}>
                    <ContributorRoadmap phases={state.data.contributor_roadmap} />
                  </div>
                )}

                <div style={{ marginTop: 'var(--space-6)' }}>
                  <RepoChat
                    repoName={state.data.repository.full_name}
                    repoUrl={state.data.repository.html_url}
                    overview={state.data.overview}
                    techStack={state.data.tech_stack}
                    files={state.data.key_files}
                    setupSteps={state.data.setup_steps}
                    aiAvailable={health?.ollama_available ?? false}
                    targetModel={health?.target_ai_model || 'qwen3:4b'}
                  />
                </div>

                <div style={{ marginTop: 'var(--space-6)' }}>
                  <IssueList issues={state.data.recommended_issues || []} />
                </div>

                <div style={{ marginTop: 'var(--space-6)' }}>
                  <SetupChecklist repoName={state.data.repository.full_name} />
                </div>
              </div>
            </div>
          )}

          {/* Floating AI Chat Assistant */}
          <FloatingAiChat
            repoName={state.data.repository.full_name}
            repoUrl={state.data.repository.html_url}
            currentView={activeTab}
            overview={state.data.overview}
            techStack={state.data.tech_stack}
            files={state.data.key_files}
            setupSteps={state.data.setup_steps}
            targetModel={health?.target_ai_model || 'qwen3:4b'}
            ollamaAvailable={Boolean(health?.ollama_available && health?.ollama_model_installed)}
            selectedFile={selectedFileContext}
            onClearSelectedFile={() => setSelectedFileContext(null)}
            isOpen={isChatOpen}
            onToggleOpen={() => setIsChatOpen(!isChatOpen)}
            pendingQuestion={pendingChatQuestion}
            onClearPendingQuestion={() => setPendingChatQuestion(null)}
          />
        </div>
      )}

      {/* Global Status Bar */}
      <footer className="status-bar" style={{ marginTop: 'var(--space-12)' }}>
        {state.kind === 'success' && typeof state.data.rate_limit_remaining === 'number' && (
          <div className="status-item">
            <span className={`status-dot ${
              state.data.rate_limit_remaining > 100 ? 'green' :
              state.data.rate_limit_remaining > 10 ? 'amber' : 'red'
            }`} />
            API calls remaining: {state.data.rate_limit_remaining}
          </div>
        )}
        {health && (
          <>
            <div className="status-item">
              <span className={`status-dot ${health.github_token_set ? 'green' : 'amber'}`} />
              Token: {health.github_token_set ? 'Configured (5,000 req/hr)' : 'Not set (60 req/hr)'}
            </div>
            <div className="status-item">
              <span className={`status-dot ${
                health.ollama_available && health.ollama_model_installed
                  ? 'green'
                  : health.ollama_available
                  ? 'amber'
                  : 'red'
              }`} />
              AI: {
                health.ollama_available && health.ollama_model_installed
                  ? `Ollama (${health.target_ai_model || 'qwen3:4b'})`
                  : health.ollama_available
                  ? `Ollama online (${health.target_ai_model || 'qwen3:4b'} not installed)`
                  : 'Ollama offline (Evidence fallback)'
              }
            </div>
          </>
        )}
      </footer>
    </div>
  );
}

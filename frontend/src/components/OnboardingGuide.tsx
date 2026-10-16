import { useState } from 'react';
import type { OnboardingGuide as GuideType } from '../api/client';

interface Props {
  guide: GuideType;
}

export default function OnboardingGuide({ guide }: Props) {
  const [viewMode, setViewMode] = useState<'structured' | 'markdown'>('structured');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textToCopy = guide.full_guide_markdown || guide.summary;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API not permitted
    }
  };

  const handleExportMd = () => {
    const content = guide.full_guide_markdown || guide.summary;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'onboarding-guide.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTxt = () => {
    let content = guide.full_guide_markdown || guide.summary;
    // Strip markdown formatting for plain text
    content = content
      .replace(/^#+\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[a-z]*\n([\s\S]*?)```/gm, '$1');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'onboarding-guide.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Determine honest AI badge display
  const renderBadge = () => {
    if (guide.ai_enhanced) {
      return (
        <span
          className="ai-badge"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.25))',
            color: 'var(--accent-purple)',
            border: '1px solid rgba(139, 92, 246, 0.4)',
          }}
          title="Generated using local Ollama Qwen3"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
            <rect x="4" y="8" width="16" height="12" rx="2"/>
            <circle cx="9" cy="14" r="1"/>
            <circle cx="15" cy="14" r="1"/>
          </svg>
          AI Generated ({guide.ai_model || 'qwen3:4b'})
        </span>
      );
    }

    if (guide.ai_status?.model_installed === false) {
      return (
        <span
          className="ai-badge"
          style={{
            background: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--accent-blue)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
          }}
          title={`Ollama is running, but ${guide.ai_status.target_model || 'qwen3:4b'} is not pulled yet`}
        >
          Evidence-Based ({guide.ai_status.target_model || 'qwen3:4b'} not pulled)
        </span>
      );
    }

    if (guide.ai_status?.fallback_used) {
      return (
        <span
          className="ai-badge"
          style={{
            background: 'rgba(59, 130, 246, 0.12)',
            color: 'var(--accent-blue)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
          }}
          title="Generated via deterministic repository analysis engine"
        >
          Evidence-Based (Rule Engine)
        </span>
      );
    }

    return (
      <span
        className="ai-badge"
        style={{
          background: 'rgba(59, 130, 246, 0.12)',
          color: 'var(--accent-blue)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
        }}
      >
        Evidence-Based
      </span>
    );
  };

  return (
    <div className="card fade-in fade-in-delay-1">
      {/* Header with Title, Badge, and Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          Onboarding Guide
          {renderBadge()}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {guide.full_guide_markdown && (
            <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '2px', border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setViewMode('structured')}
                style={{
                  background: viewMode === 'structured' ? 'var(--bg-card)' : 'transparent',
                  color: viewMode === 'structured' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Structured
              </button>
              <button
                type="button"
                onClick={() => setViewMode('markdown')}
                style={{
                  background: viewMode === 'markdown' ? 'var(--bg-card)' : 'transparent',
                  color: viewMode === 'markdown' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Markdown
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="retry-btn"
            style={{
              padding: '4px 10px',
              fontSize: 'var(--text-xs)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Copy guide markdown to clipboard"
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportMd}
            className="retry-btn"
            style={{
              padding: '4px 10px',
              fontSize: 'var(--text-xs)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--accent-blue)',
            }}
            title="Download Onboarding Guide as Markdown (.md)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export .md
          </button>

          <button
            type="button"
            onClick={handleExportTxt}
            className="retry-btn"
            style={{
              padding: '4px 10px',
              fontSize: 'var(--text-xs)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--accent-cyan)',
            }}
            title="Download Onboarding Guide as Plain Text (.txt)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export .txt
          </button>
        </div>
      </div>

      {/* Raw Markdown view if selected */}
      {viewMode === 'markdown' && guide.full_guide_markdown ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <pre
            style={{
              background: 'var(--bg-input)',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              maxHeight: '600px',
              overflowY: 'auto',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {guide.full_guide_markdown}
          </pre>
        </div>
      ) : (
        /* Structured 12-Section Guide */
        <div>
          {/* 1. Project Overview */}
          <div className="guide-section">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>1. Project Overview</span>
            </h3>
            <div
              className="guide-summary"
              dangerouslySetInnerHTML={{
                __html: guide.summary
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\n/g, '<br/>')
              }}
            />
          </div>

          {/* 2. Verified Language and Technology Stack */}
          {guide.tech_stack && guide.tech_stack.length > 0 && (
            <div className="guide-section">
              <h3>2. Verified Language &amp; Technology Stack</h3>
              <div className="tags-row">
                {guide.tech_stack.map((tech) => (
                  <span key={tech} className="tag tag-purple">{tech}</span>
                ))}
              </div>
            </div>
          )}

          {/* 3. Prerequisites */}
          {guide.prerequisites && guide.prerequisites.length > 0 && (
            <div className="guide-section">
              <h3>3. Prerequisites</h3>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                {guide.prerequisites.map((req, i) => (
                  <li key={i} style={{ marginBottom: 'var(--space-1)' }}>
                    <span dangerouslySetInnerHTML={{
                      __html: req.replace(/`([^`]+)`/g, '<code>$1</code>')
                    }} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 4. Installation and Dependency Setup */}
          {guide.setup_steps && guide.setup_steps.length > 0 && (
            <div className="guide-section">
              <h3>4. Installation &amp; Setup</h3>
              {guide.setup_steps.map((step, i) => (
                <div key={i} className="guide-step">
                  <span className="guide-step-num">{i + 1}</span>
                  <span
                    className="guide-text"
                    dangerouslySetInnerHTML={{
                      __html: step.replace(/`([^`]+)`/g, '<code>$1</code>')
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 5. Commands to Run Locally */}
          {guide.run_commands && guide.run_commands.length > 0 && (
            <div className="guide-section">
              <h3>5. Run Locally</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {guide.run_commands.map((cmd, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg-input)',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--accent-cyan)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', userSelect: 'none' }}>$</span>
                    <code>{cmd}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Important Directories and Files */}
          {guide.key_files && guide.key_files.length > 0 && (
            <div className="guide-section">
              <h3>6. Important Directories &amp; Files</h3>
              <div className="tags-row">
                {guide.key_files.map((f) => (
                  <span
                    key={f}
                    className="tag"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 7. How to Run Tests */}
          {guide.test_commands && guide.test_commands.length > 0 && (
            <div className="guide-section">
              <h3>7. How to Run Tests</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {guide.test_commands.map((cmd, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--bg-input)',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--accent-green)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', userSelect: 'none' }}>$</span>
                    <code>{cmd}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. Contribution Workflow */}
          {guide.contribution_tips && guide.contribution_tips.length > 0 && (
            <div className="guide-section">
              <h3>8. Contribution Workflow</h3>
              {guide.contribution_tips.map((tip, i) => (
                <div key={i} className="guide-step">
                  <span
                    className="guide-step-num"
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: 'var(--accent-green)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span
                    className="guide-text"
                    dangerouslySetInnerHTML={{
                      __html: tip.replace(/`([^`]+)`/g, '<code>$1</code>')
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* 10. Suggested First Contribution */}
          {guide.suggested_first_contribution && (
            <div className="guide-section">
              <h3>10. Suggested First Contribution</h3>
              <div
                style={{
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', color: 'var(--accent-purple)', fontWeight: 600 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Recommended Starter Area
                </div>
                <span dangerouslySetInnerHTML={{
                  __html: guide.suggested_first_contribution.replace(/`([^`]+)`/g, '<code>$1</code>')
                }} />
              </div>
            </div>
          )}

          {/* 11. Common Problems */}
          {guide.common_problems && guide.common_problems.length > 0 && (
            <div className="guide-section">
              <h3>11. Common Problems &amp; Gotchas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {guide.common_problems.map((prob, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(245, 158, 11, 0.06)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      display: 'flex',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ color: 'var(--accent-amber)', fontWeight: 'bold' }}>!</span>
                    <span dangerouslySetInnerHTML={{
                      __html: prob.replace(/`([^`]+)`/g, '<code>$1</code>')
                    }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 12. Unavailable Information */}
          {guide.unavailable_info && guide.unavailable_info.length > 0 && (
            <div className="guide-section" style={{ marginBottom: 0 }}>
              <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                12. Unavailable Information Notice
              </h3>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                {guide.unavailable_info.map((info, i) => (
                  <li key={i} style={{ marginBottom: '2px' }}>
                    {info}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import type { OnboardingGuide as GuideType } from '../api/client';

interface Props {
  guide: GuideType;
}

export default function OnboardingGuide({ guide }: Props) {
  return (
    <div className="card fade-in fade-in-delay-1">
      <h2 className="card-title">
        <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        Onboarding Guide
        {guide.ai_enhanced && <span className="ai-badge">AI Enhanced</span>}
      </h2>

      {/* Summary */}
      <div className="guide-section">
        <div className="guide-summary" dangerouslySetInnerHTML={{
          __html: guide.summary
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>')
        }} />
      </div>

      {/* Tech Stack */}
      {guide.tech_stack.length > 0 && (
        <div className="guide-section">
          <h3>Tech Stack</h3>
          <div className="tags-row">
            {guide.tech_stack.map((tech) => (
              <span key={tech} className="tag tag-purple">{tech}</span>
            ))}
          </div>
        </div>
      )}

      {/* Setup Steps */}
      {guide.setup_steps.length > 0 && (
        <div className="guide-section">
          <h3>Getting Started</h3>
          {guide.setup_steps.map((step, i) => (
            <div key={i} className="guide-step">
              <span className="guide-step-num">{i + 1}</span>
              <span className="guide-text" dangerouslySetInnerHTML={{
                __html: step.replace(/`([^`]+)`/g, '<code>$1</code>')
              }} />
            </div>
          ))}
        </div>
      )}

      {/* Key Files */}
      {guide.key_files.length > 0 && (
        <div className="guide-section">
          <h3>Key Files to Explore</h3>
          <div className="tags-row">
            {guide.key_files.map((f) => (
              <span key={f} className="tag" style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
              }}>
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contribution Tips */}
      {guide.contribution_tips.length > 0 && (
        <div className="guide-section">
          <h3>Contribution Tips</h3>
          {guide.contribution_tips.map((tip, i) => (
            <div key={i} className="guide-step">
              <span className="guide-step-num" style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--accent-green)',
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span className="guide-text">{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

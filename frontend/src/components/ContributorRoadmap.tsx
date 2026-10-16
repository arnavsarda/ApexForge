import { useState } from 'react';
import type { RoadmapPhase } from '../api/client';

interface Props {
  phases?: RoadmapPhase[];
}

export default function ContributorRoadmap({ phases }: Props) {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!phases || phases.length === 0) {
    return null;
  }

  const handleCopyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const phaseColors = [
    'var(--accent-blue)',
    'var(--accent-purple)',
    'var(--accent-amber)',
    'var(--accent-cyan)',
    'var(--accent-green)',
  ];

  return (
    <div className="card fade-in fade-in-delay-3">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
            <line x1="8" y1="2" x2="8" y2="18"/>
            <line x1="16" y1="6" x2="16" y2="22"/>
          </svg>
          Contributor Roadmap
        </h2>
        <span className="tag tag-purple" style={{ fontSize: 'var(--text-xs)' }}>
          {phases.length} Phases
        </span>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
        A progressive milestone path tailored to this repository, from environment setup to your first merged pull request.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {phases.map((p, idx) => {
          const accentColor = phaseColors[idx % phaseColors.length];

          return (
            <div
              key={p.phase}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${accentColor}`,
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                transition: 'all 200ms ease',
              }}
            >
              {/* Phase header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: 'var(--radius-full)',
                    background: `${accentColor}20`,
                    color: accentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '11px',
                  }}
                >
                  {p.phase}
                </span>
                <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {p.title}
                </h3>
              </div>

              {/* Description */}
              <p style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {p.description}
              </p>

              {/* Milestones list */}
              {p.milestones && p.milestones.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginBottom: p.suggested_commands && p.suggested_commands.length > 0 ? 'var(--space-3)' : 0 }}>
                  {p.milestones.map((m, mIdx) => (
                    <div key={mIdx} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <span style={{ color: accentColor, lineHeight: 1.5 }}>&bull;</span>
                      <span dangerouslySetInnerHTML={{
                        __html: m.replace(/`([^`]+)`/g, '<code style="color: var(--accent-cyan);">$1</code>')
                      }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Suggested Commands Chips */}
              {p.suggested_commands && p.suggested_commands.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  {p.suggested_commands.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => handleCopyCmd(cmd)}
                      title="Click to copy command"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '3px 8px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: copiedCmd === cmd ? 'var(--accent-green)' : 'var(--accent-cyan)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 150ms ease',
                      }}
                    >
                      <span>$</span>
                      <code>{cmd}</code>
                      {copiedCmd === cmd ? (
                        <span style={{ color: 'var(--accent-green)', marginLeft: '2px' }}>&check;</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

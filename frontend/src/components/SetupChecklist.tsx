import { useState } from 'react';

interface Props {
  repoName: string;
}

const DEFAULT_STEPS = [
  'Read the README and contribution guidelines',
  'Fork the repository on GitHub',
  'Clone your fork locally',
  'Install dependencies and run the project',
  'Explore the codebase — look at key files',
  'Pick a beginner-friendly issue to work on',
  'Create a feature branch for your changes',
  'Make your changes and write tests',
  'Push your branch and open a Pull Request',
  'Respond to review feedback',
];

export default function SetupChecklist({ repoName }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const progress = (checked.size / DEFAULT_STEPS.length) * 100;

  return (
    <div className="card fade-in fade-in-delay-3">
      <h2 className="card-title">
        <svg className="card-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        Contribution Checklist
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {checked.size}/{DEFAULT_STEPS.length}
        </span>
      </h2>

      <div className="checklist-progress">
        <div className="checklist-progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {DEFAULT_STEPS.map((step, i) => (
        <div
          key={i}
          className={`checklist-item ${checked.has(i) ? 'checked' : ''}`}
          onClick={() => toggle(i)}
        >
          <div className="checklist-checkbox">
            {checked.has(i) && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <span className="checklist-text">{step}</span>
        </div>
      ))}
    </div>
  );
}

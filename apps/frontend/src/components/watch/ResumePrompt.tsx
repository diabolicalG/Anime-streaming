import { useEffect } from 'react';

interface ResumePromptProps {
  open: boolean;
  currentTime: number;
  onResume: () => void;
  onRestart: () => void;
  onDismiss: () => void;
}

export function ResumePrompt({ open, currentTime, onResume, onRestart, onDismiss }: ResumePromptProps) {
  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="resume-overlay" role="dialog" aria-modal="true" onClick={onDismiss}>
      <div className="resume-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="resume-dismiss"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
        <h2 className="resume-title">Continue watching?</h2>
        <p className="resume-subtitle">You left off at {mmss(currentTime)}.</p>
        <div className="resume-actions">
          <button
            type="button"
            className="resume-btn resume-btn-primary"
            onClick={onResume}
          >
            Resume from {mmss(currentTime)}
          </button>
          <button
            type="button"
            className="resume-btn resume-btn-secondary"
            onClick={onRestart}
          >
            Start over
          </button>
        </div>
      </div>
    </div>
  );
}
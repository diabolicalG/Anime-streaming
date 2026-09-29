interface AutoNextOverlayProps {
  visible: boolean;
  secondsRemaining: number;
  nextEpisodeTitle: string | null;
  nextEpisodeNumber: number | null;
  onPlayNow: () => void;
  onCancel: () => void;
}

export function AutoNextOverlay({
  visible,
  secondsRemaining,
  nextEpisodeTitle,
  nextEpisodeNumber,
  onPlayNow,
  onCancel,
}: AutoNextOverlayProps) {
  if (!visible) return null;

  return (
    <div className="autonext-overlay" role="status" aria-live="polite">
      <div className="autonext-card">
        <div className="autonext-info">
          <span className="autonext-label">Up next</span>
          <span className="autonext-title">
            {nextEpisodeNumber != null
              ? nextEpisodeTitle
                ? `Episode ${nextEpisodeNumber} · ${nextEpisodeTitle}`
                : `Episode ${nextEpisodeNumber}`
              : 'Next episode'}
          </span>
          <span className="autonext-countdown">
            Playing in {secondsRemaining}s
          </span>
        </div>
        <div className="autonext-actions">
          <button
            type="button"
            className="autonext-btn autonext-btn-primary"
            onClick={onPlayNow}
          >
            Play now
          </button>
          <button
            type="button"
            className="autonext-btn autonext-btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
import { usePlayerStore } from '../../store/usePlayerStore';
import type { StreamSource } from '../../types/streaming';

interface SourceSelectorProps {
  onRetry?: () => void;
}

function parseHeight(quality: string): number {
  const match = quality.match(/(\d{3,4})p?/);
  return match ? parseInt(match[1], 10) : 0;
}

function sourceLabel(source: StreamSource, index: number): string {
  if (source.sourceLabel) return source.sourceLabel;
  try {
    const hostname = new URL(source.url).hostname;
    const cleaned = hostname.replace(/^www\./, '');
    const firstSegment = cleaned.split('.')[0];
    return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
  } catch {
    return `Source ${index + 1}`;
  }
}

function qualityTier(height: number): 'UHD' | 'Full HD' | 'HD' | 'SD' {
  if (height >= 2160) return 'UHD';
  if (height >= 1080) return 'Full HD';
  if (height >= 720) return 'HD';
  return 'SD';
}

function compat(source: StreamSource): { label: string; devices: string } {
  const height = parseHeight(source.quality);
  const isHLS = source.isM3U8;

  if (isHLS && height >= 720) return { label: 'Excellent', devices: 'All devices' };
  if (isHLS && height < 720) return { label: 'Good', devices: 'Most devices' };
  if (!isHLS && height >= 720) return { label: 'Good', devices: 'Most devices' };
  return { label: 'Fair', devices: 'Limited devices' };
}

function role(index: number, total: number): 'Primary' | 'Backup' | 'Fallback' {
  if (index === 0) return 'Primary';
  if (index === total - 1 && index > 0) return 'Fallback';
  return 'Backup';
}

interface SourceSelectorProps {
  onRetry?: () => void;
}

export function SourceSelector({ onRetry }: SourceSelectorProps) {
  const { sources, currentSource, selectSource } = usePlayerStore();

  return (
    <div className="source-selector">
      <div className="source-selector-head">
        <span>Source</span>
        <span>Quality</span>
        <span>Compatibility</span>
      </div>
      {sources.length > 0 ? (
        sources.map((s, i) => (
          <button
            key={s.url}
            type="button"
            className={currentSource?.url === s.url ? 'source-row is-active' : 'source-row'}
            onClick={() => selectSource(s)}
          >
            <div className="source-cell">
              <span className="source-name">{sourceLabel(s, i)}</span>
              <span className="source-role">{role(i, sources.length)}</span>
            </div>
            <div className="source-cell">
              <span className="source-quality-value">{s.quality}</span>
              <span className="source-quality-tier">{qualityTier(parseHeight(s.quality))}</span>
            </div>
            <div className="source-cell">
              <span className="source-compat-label">{compat(s).label}</span>
              <span className="source-compat-devices">{compat(s).devices}</span>
            </div>
          </button>
        ))
      ) : (
        <div className="source-selector-empty">No sources available</div>
      )}
      <div className="source-selector-footer">
        <p>Experiencing issues? Switch sources or retry the current one.</p>
        <button type="button" className="source-retry-btn" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}
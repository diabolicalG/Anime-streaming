import { usePlayerStore } from '../../store/usePlayerStore';

interface QualitySelectorProps {
  availableLevels: { height: number; bitrate: number }[];
}

export function QualitySelector({ availableLevels }: QualitySelectorProps) {
  const { quality, setQuality } = usePlayerStore();

  const heights = Array.from(
    new Set(availableLevels.map((l) => l.height))
  ).sort((a, b) => b - a);

  return (
    <div className="quality-selector" role="radiogroup" aria-label="Quality">
      <button
        type="button"
        role="radio"
        aria-checked={quality === 'auto'}
        className={quality === 'auto' ? 'quality-pill is-active' : 'quality-pill'}
        onClick={() => setQuality('auto')}
      >
        Auto
      </button>
      {heights.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={quality === `${h}p`}
          className={quality === `${h}p` ? 'quality-pill is-active' : 'quality-pill'}
          onClick={() => setQuality(`${h}p`)}
        >
          {h}p
        </button>
      ))}
    </div>
  );
}
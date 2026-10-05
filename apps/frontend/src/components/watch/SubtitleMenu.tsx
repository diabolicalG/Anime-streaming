import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';

export function SubtitleMenu() {
  const {
    subtitles,
    currentSubtitle,
    selectSubtitle,
    subtitleOffset,
    setSubtitleOffset,
    subtitleStyle,
    setSubtitleStyle,
    audioTracks,
    audioTrack,
    setAudioTrack,
  } = usePlayerStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedOffset = Number(sessionStorage.getItem('watch:subtitle-offset') ?? '0');
    if (Number.isFinite(savedOffset)) setSubtitleOffset(savedOffset);
    const savedStyle = sessionStorage.getItem('watch:subtitle-style') as 'default' | 'large' | 'high-contrast' | null;
    if (savedStyle) setSubtitleStyle(savedStyle);
  }, [setSubtitleOffset, setSubtitleStyle]);

  useEffect(() => {
    sessionStorage.setItem('watch:subtitle-offset', String(subtitleOffset));
    sessionStorage.setItem('watch:subtitle-style', subtitleStyle);
  }, [subtitleOffset, subtitleStyle]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="subtitle-menu" ref={ref}>
      <button
        type="button"
        className="subtitle-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={subtitles.length === 0 && audioTracks.length === 0}
        aria-expanded={open}
      >
        <span>Tracks</span>
        <span className="subtitle-menu-current">
          {currentSubtitle ? currentSubtitle.label : 'Off'}
        </span>
      </button>
      {open && (
        <div className="subtitle-menu-panel">
          <section>
            <div className="subtitle-section-title">Subtitles</div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!currentSubtitle}
              className={!currentSubtitle ? 'subtitle-row is-active' : 'subtitle-row'}
              onClick={() => selectSubtitle(null)}
            >
              Off
            </button>
            {subtitles.map((t) => (
              <button
                key={t.url}
                type="button"
                role="menuitemradio"
                aria-checked={currentSubtitle?.url === t.url}
                className={currentSubtitle?.url === t.url ? 'subtitle-row is-active' : 'subtitle-row'}
                onClick={() => selectSubtitle(t)}
              >
                {t.label}
              </button>
            ))}
          </section>

          {audioTracks.length > 0 && (
            <section>
              <div className="subtitle-section-title">Audio</div>
              {audioTracks.map((track, index) => (
                <button
                  key={`audio-${index}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={audioTrack === index}
                  className={audioTrack === index ? 'subtitle-row is-active' : 'subtitle-row'}
                  onClick={() => setAudioTrack(index)}
                >
                  {track.label ?? track.name ?? track.lang ?? `Audio ${index + 1}`}
                </button>
              ))}
            </section>
          )}

          {currentSubtitle && (
            <section>
              <div className="subtitle-section-title">Offset</div>
              <input
                aria-label="Subtitle offset"
                type="range"
                min="-5"
                max="5"
                step="0.25"
                value={subtitleOffset}
                onChange={(e) => setSubtitleOffset(Number(e.target.value))}
              />
              <span className="subtitle-offset-value">{subtitleOffset.toFixed(2)}s</span>
            </section>
          )}

          <section>
            <div className="subtitle-section-title">Style</div>
            {(['default', 'large', 'high-contrast'] as const).map((style) => (
              <button
                key={style}
                type="button"
                className={subtitleStyle === style ? 'subtitle-row is-active' : 'subtitle-row'}
                onClick={() => setSubtitleStyle(style)}
              >
                {style.replace('-', ' ')}
              </button>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

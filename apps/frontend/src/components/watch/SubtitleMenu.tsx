import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../../store/usePlayerStore';

export function SubtitleMenu() {
  const { subtitles, currentSubtitle, selectSubtitle } = usePlayerStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        disabled={subtitles.length === 0}
        title={subtitles.length === 0 ? 'No subtitles available for this source' : undefined}
      >
        <span>Subtitles</span>
        <span className="subtitle-menu-current">
          {currentSubtitle ? currentSubtitle.label : 'Off'}
        </span>
      </button>
      {open && (
        <ul className="subtitle-menu-list" role="menu">
          <li>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!currentSubtitle}
              className={!currentSubtitle ? 'subtitle-row is-active' : 'subtitle-row'}
              onClick={() => {
                selectSubtitle(null);
                setOpen(false);
              }}
            >
              Off
            </button>
          </li>
          {subtitles.map((t) => (
            <li key={t.url}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={currentSubtitle?.url === t.url}
                className={currentSubtitle?.url === t.url ? 'subtitle-row is-active' : 'subtitle-row'}
                onClick={() => {
                  selectSubtitle(t);
                  setOpen(false);
                }}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
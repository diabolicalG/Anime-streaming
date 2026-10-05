import { Play, Plus } from 'lucide-react';
import type { AniListMedia } from '../../types/streaming';

export function AnimeCard({ anime, compact = false }: { anime: AniListMedia; compact?: boolean }) {
  return (
    <article className={compact ? 'kuro-card kuro-card-compact' : 'kuro-card'}>
      <a href={'/anime/' + anime.id} className="block">
        <div className="kuro-card-art">
          <img src={anime.coverImage?.large || anime.coverImage?.medium} alt={anime.title.userPreferred} loading="lazy" />
          <div className="kuro-card-scrim" />
          <span className="kuro-card-badge">{anime.format}</span>
          {anime.averageScore ? <span className="kuro-card-score">★ {(anime.averageScore / 10).toFixed(1)}</span> : null}
        </div>
        <div className="kuro-card-body">
          <h3>{anime.title.userPreferred}</h3>
          <p>{anime.episodes ?? '—'} episodes · {anime.status.replaceAll('_', ' ')}</p>
        </div>
      </a>
      {!compact && (
        <div className="kuro-card-actions">
          <a href={'/watch/' + anime.id + '/1'} className="kuro-small-button kuro-small-button-primary"><Play size={13} fill="currentColor" /> Play</a>
          <button type="button" className="kuro-small-button" aria-label={'Add ' + anime.title.userPreferred + ' to My List'}><Plus size={14} /> My List</button>
        </div>
      )}
    </article>
  );
}

export function AnimeRail({ title, items, eyebrow }: { title: string; items: AniListMedia[]; eyebrow?: string }) {
  return (
    <section className="kuro-section">
      <div className="kuro-section-head">
        <div>
          {eyebrow ? <div className="kuro-eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
        </div>
        <a className="kuro-text-link" href="/browse">View all</a>
      </div>
      <div className="kuro-card-grid">
        {items.map((anime) => <AnimeCard key={anime.id} anime={anime} compact />)}
      </div>
    </section>
  );
}

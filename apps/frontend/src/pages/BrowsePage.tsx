import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { anilistApi } from '../services/anilist';
import type { AniListMedia, MediaStatus, MediaFormat } from '../types/anilist';
import { AnimeCard } from '../components/ui/AnimeCard';

const GENRES = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Mecha','Music','Ecchi','Harem','Isekai','Psychological','Historical','Military','Police','School'];
const STATUS_OPTIONS: MediaStatus[] = ['FINISHED','RELEASING','NOT_YET_RELEASED','CANCELLED','HIATUS'];
const FORMAT_OPTIONS: MediaFormat[] = ['TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC'];

export default function BrowsePage() {
  const navigate = useNavigate();
  const [filters, setFilters] = React.useState({ genre: '', status: '', format: '', season: '', year: '' });

  const query = useInfiniteQuery({
    queryKey: ['kuro-browse', filters],
    queryFn: ({ pageParam = 1 }) => anilistApi.browse({
      genre: filters.genre || undefined,
      status: filters.status || undefined,
      format: filters.format || undefined,
      season: filters.season || undefined,
      seasonYear: filters.year ? Number(filters.year) : undefined,
      page: pageParam,
      perPage: 24,
    }),
    getNextPageParam: (last) => last.Page.pageInfo.hasNextPage ? last.Page.pageInfo.currentPage + 1 : undefined,
    initialPageParam: 1,
    staleTime: 30 * 60 * 1000,
  });

  const items = query.data?.pages.flatMap((page) => page.Page.media) ?? [];
  const reset = () => setFilters({ genre: '', status: '', format: '', season: '', year: '' });

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">OBSIDIAN / 03</div>
      <h1 className="kuro-page-title">Browse & Discovery</h1>
      <p className="kuro-page-copy">Editorial lanes meet powerful filters. Active filters, loading grids, no-match recovery, and end-of-results share one visual grammar.</p>

      <section className="kuro-section kuro-data-panel">
        <div className="kuro-toolbar">
          <div className="kuro-filter-row">
            {['All','Trending','New releases','Genres','Simulcast'].map((label, i) => <button type="button" key={label} className={i === 0 ? 'kuro-filter is-active' : 'kuro-filter'} onClick={() => i === 0 && reset()}>{label}</button>)}
          </div>
          <button className="kuro-small-button" type="button"><SlidersHorizontal size={13} /> Filters</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 8 }}>
          <select className="kuro-field-input" aria-label="Genre" value={filters.genre} onChange={(e) => setFilters({ ...filters, genre: e.target.value })}><option value="">All genres</option>{GENRES.map((genre) => <option key={genre}>{genre}</option>)}</select>
          <select className="kuro-field-input" aria-label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Status</option>{STATUS_OPTIONS.map((status) => <option key={status}>{status.replaceAll('_',' ')}</option>)}</select>
          <select className="kuro-field-input" aria-label="Format" value={filters.format} onChange={(e) => setFilters({ ...filters, format: e.target.value })}><option value="">Format</option>{FORMAT_OPTIONS.map((format) => <option key={format}>{format}</option>)}</select>
          <select className="kuro-field-input" aria-label="Season" value={filters.season} onChange={(e) => setFilters({ ...filters, season: e.target.value })}><option value="">Season</option>{['WINTER','SPRING','SUMMER','FALL'].map((season) => <option key={season}>{season}</option>)}</select>
          <input className="kuro-field-input" aria-label="Year" inputMode="numeric" placeholder="Year" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} />
        </div>
      </section>

      <section className="kuro-section">
        {query.isLoading && <div className="kuro-page-note">Loading discovery grid…</div>}
        {query.isError && <div className="kuro-page-note">Unable to load results. Retry without losing your filters.</div>}
        {!query.isLoading && items.length === 0 && <div className="kuro-page-note">No matches. Clear a filter or try a broader genre.</div>}
        <div className="kuro-card-grid">
          {items.map((anime: AniListMedia) => <AnimeCard key={anime.id} anime={anime} />)}
        </div>
        {query.hasNextPage && <button type="button" className="kuro-button" style={{ margin: '24px auto', display: 'flex' }} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>}
        {!query.hasNextPage && items.length > 0 ? <p className="kuro-history-meta" style={{ textAlign: 'center', marginTop: 24 }}>End of results</p> : null}
      </section>
    </div>
  );
}

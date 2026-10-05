import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { anilistApi } from '../services/anilist';
import type { AniListMedia } from '../types/anilist';
import { AnimeCard } from '../components/ui/AnimeCard';

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const queryText = params.get('q') ?? '';
  const query = useInfiniteQuery({
    queryKey: ['kuro-search', queryText],
    queryFn: ({ pageParam = 1 }) => anilistApi.search({ search: queryText, page: pageParam, perPage: 24 }),
    getNextPageParam: (last) => last.Page.pageInfo.hasNextPage ? last.Page.pageInfo.currentPage + 1 : undefined,
    initialPageParam: 1,
    enabled: queryText.trim().length >= 2,
    staleTime: 10 * 60 * 1000,
  });

  const items = query.data?.pages.flatMap((page) => page.Page.media) ?? [];

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const q = String(data.get('q') ?? '').trim();
    setParams(q ? { q } : {});
  };

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">OBSIDIAN / 04</div>
      <h1 className="kuro-page-title">Search, without dead ends</h1>
      <p className="kuro-page-copy">Query, live results, no-results recovery, retry states, and keyboard-friendly focus share one visual grammar.</p>

      <form className="kuro-search" style={{ maxWidth: 640, marginTop: 24, minHeight: 48 }} onSubmit={submit}>
        <Search size={18} />
        <input name="q" defaultValue={queryText} autoFocus placeholder="Try blue horizon" aria-label="Search anime" />
        {queryText ? <button type="button" className="kuro-icon-button" onClick={() => setParams({})} aria-label="Clear search"><X size={16} /></button> : null}
      </form>

      {queryText.length === 0 && <div className="kuro-section kuro-page-note"><div className="kuro-eyebrow">LIVE SUGGESTIONS</div>Search for a title, character, season, or genre.</div>}
      {queryText.length > 0 && queryText.length < 2 && <div className="kuro-section kuro-page-note">Type at least 2 characters.</div>}
      {query.isLoading && <div className="kuro-section kuro-page-note">Searching “{queryText}”…</div>}
      {query.isError && <div className="kuro-section kuro-page-note">Search failed. Retry the same query without losing focus.</div>}
      {queryText.length >= 2 && !query.isLoading && !query.isError && items.length === 0 && <div className="kuro-section kuro-page-note">No results for “{queryText}”. Try a shorter title or a broader phrase.</div>}

      {items.length > 0 && (
        <section className="kuro-section">
          <div className="kuro-section-head"><div><div className="kuro-eyebrow">RESULTS</div><h2>{items.length} titles loaded</h2></div></div>
          <div className="kuro-card-grid">{items.map((anime: AniListMedia) => <AnimeCard key={anime.id} anime={anime} />)}</div>
          {query.hasNextPage ? <button type="button" className="kuro-button" style={{ margin: '24px auto', display: 'flex' }} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more results'}</button> : <p className="kuro-history-meta" style={{ textAlign: 'center', marginTop: 24 }}>End of results</p>}
        </section>
      )}
    </div>
  );
}

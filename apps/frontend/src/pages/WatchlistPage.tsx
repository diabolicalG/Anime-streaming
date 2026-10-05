import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { anilistApi } from '../services/anilist';
import { AnimeCard } from '../components/ui/AnimeCard';

type WatchlistItem = { animeId: number; status: string; progress: number; updatedAt: string };

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: WatchlistItem[] }>('/api/user/watchlist');
      return data.data;
    },
  });

  const details = useQueries({
    queries: (list.data ?? []).slice(0, 30).map((item) => ({
      queryKey: ['anime', item.animeId],
      queryFn: () => anilistApi.detail(item.animeId),
      staleTime: 60 * 60 * 1000,
    })),
  });

  const entries = (list.data ?? []).slice(0, 30).map((item, index) => ({
    item,
    anime: details[index]?.data?.Media,
  }));

  const remove = async (animeId: number) => {
    await api.delete('/api/user/watchlist/' + animeId);
    await queryClient.invalidateQueries({ queryKey: ['watchlist'] });
  };

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">OBSIDIAN / 08</div>
      <div className="kuro-section-head">
        <div>
          <h1 className="kuro-page-title">Watchlist & Favorites</h1>
          <p className="kuro-page-copy">Saved titles become a calm, sortable library. Selection tools stay quiet until you need them.</p>
        </div>
        <a className="kuro-small-button" href="/browse">Add titles</a>
      </div>

      <section className="kuro-section">
        <div className="kuro-toolbar">
          <div className="kuro-filter-row">
            {['Recently added', 'A–Z', 'Series'].map((filter, index) => <button className={index === 0 ? 'kuro-filter is-active' : 'kuro-filter'} key={filter} type="button">{index === 2 ? 'Filter: ' + filter : filter}</button>)}
          </div>
          <span className="kuro-history-meta">{entries.length} saved</span>
        </div>
        {entries.length === 0 ? (
          <div className="kuro-page-note">Your list is empty. Browse a title and save it here.</div>
        ) : (
          <div className="kuro-card-grid">
            {entries.map(({ item, anime }) => anime ? (
              <div key={item.animeId} className="relative">
                <AnimeCard anime={anime} compact />
                <button type="button" onClick={() => void remove(item.animeId)} className="absolute right-2 top-2 z-10 kuro-icon-button bg-black/70" title="Remove from My List" aria-label="Remove from My List"><Trash2 size={15} /></button>
              </div>
            ) : null)}
          </div>
        )}
      </section>
    </div>
  );
}

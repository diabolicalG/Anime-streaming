import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { Play, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { anilistApi } from '../services/anilist';
import type { AniListMedia } from '../types/streaming';

type HistoryItem = { id: string; animeId: number; episode: number; position: number; completed: boolean; watchedAt: string };

export default function HistoryPage() {
  const queryClient = useQueryClient();
  const historyQuery = useQuery({
    queryKey: ['history', 'all'],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: HistoryItem[] }>('/api/user/history');
      return data.data;
    },
  });

  const detailQueries = useQueries({
    queries: (historyQuery.data ?? []).slice(0, 30).map((item) => ({
      queryKey: ['anime', item.animeId],
      queryFn: () => anilistApi.detail(item.animeId),
      staleTime: 60 * 60 * 1000,
    })),
  });

  const remove = async (id: string) => { await api.delete('/api/user/history/' + id); await queryClient.invalidateQueries({ queryKey: ['history'] }); };

  const rows = (historyQuery.data ?? []).slice(0, 30).map((item, index) => ({
    item,
    anime: detailQueries[index]?.data?.Media as AniListMedia | undefined,
  }));

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">OBSIDIAN / 07</div>
      <h1 className="kuro-page-title">History & Continue Watching</h1>
      <p className="kuro-page-copy">Resume is immediate; progress, episode context, and removal controls stay visible without visual noise.</p>
      <section className="kuro-section">
        <div className="kuro-data-panel">
          {historyQuery.isLoading && <div className="kuro-page-note">Loading your viewing history…</div>}
          {!historyQuery.isLoading && rows.length === 0 && (
            <div className="kuro-page-note">Nothing here yet. Start a title and your progress will appear automatically.</div>
          )}
          <div className="kuro-history-list">
            {rows.map(({ item, anime }) => {
              const durationEstimate = 24 * 60;
              const pct = Math.max(0, Math.min(100, (item.position / durationEstimate) * 100));
              return (
                <article className="kuro-history-item" key={item.id}>
                  <img className="kuro-thumb" src={anime?.coverImage?.large} alt="" />
                  <div>
                    <h2 className="kuro-history-title">{anime?.title.userPreferred ?? 'Anime ' + item.animeId}</h2>
                    <p className="kuro-history-meta">Episode {item.episode} · {item.completed ? 'Completed' : Math.max(0, Math.round((durationEstimate - item.position) / 60)) + ' min left'}</p>
                    {!item.completed && <div className="kuro-progress" aria-label="Episode progress"><span style={{ width: pct + '%' }} /></div>}
                  </div>
                  <div className="kuro-hero-actions">
                    {!item.completed && <a className="kuro-small-button kuro-small-button-primary" href={'/watch/' + item.animeId + '/' + item.episode}><Play size={13} fill="currentColor" /> Resume</a>}
                    <button type="button" className="kuro-small-button" title="Remove this history entry" onClick={() => void remove(item.id)}><Trash2 size={13} /> Remove</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

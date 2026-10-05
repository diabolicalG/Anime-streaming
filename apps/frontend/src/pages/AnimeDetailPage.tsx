import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Play, Plus, X } from 'lucide-react';
import { anilistApi } from '../services/anilist';
import { api } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { AnimeCard } from '../components/ui/AnimeCard';
import type { AniListMedia } from '../types/anilist';
import type { StreamSource } from '../types/streaming';

export default function AnimeDetailPage() {
  const { anilistId } = useParams<{ anilistId: string }>();
  const id = Number(anilistId);
  const navigate = useNavigate();
  const { setSources, currentSource, subtitles, currentSubtitle, selectSubtitle, setCurrentTime } = usePlayerStore();
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  const animeQuery = useQuery({
    queryKey: ['anime', 'detail', id],
    queryFn: async () => (await anilistApi.detail(id)).Media,
    enabled: id > 0,
    staleTime: 60 * 60 * 1000,
  });

  const recommendationQuery = useQuery({
    queryKey: ['anime', 'recommendations', id],
    queryFn: async () => (await anilistApi.recommendations(id)).Media.recommendations.nodes.map((node) => node.mediaRecommendation),
    enabled: id > 0,
    staleTime: 60 * 60 * 1000,
  });

  const sourceQuery = useQuery({
    queryKey: ['episodeSources', 'anilist', id, selectedEpisode],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: StreamSource[] }>('/api/anime/anilist/' + id + '/episodes/' + selectedEpisode + '/sources');
      return response.data.data;
    },
    enabled: id > 0 && selectedEpisode !== null,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (sourceQuery.data) setSources(sourceQuery.data);
  }, [sourceQuery.data, setSources]);

  const anime = animeQuery.data;
  const recommendations = recommendationQuery.data ?? [];
  const totalEpisodes = anime?.episodes ?? 0;

  const openEpisode = (episode: number) => {
    setSelectedEpisode(episode);
    setShowPlayer(true);
  };

  const saveToList = async () => {
    if (!id) return;
    await api.post('/api/user/watchlist', { animeId: id, status: 'PLANNING' });
  };

  if (animeQuery.isLoading) {
    return <div className="kuro-container kuro-page"><div className="kuro-page-note">Loading title…</div></div>;
  }

  if (animeQuery.isError || !anime) {
    return <div className="kuro-container kuro-page"><div className="kuro-page-note">This title could not be loaded. <button className="kuro-button" onClick={() => navigate('/')}>Back to home</button></div></div>;
  }

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">KURO ORIGINAL</div>
      <section className="kuro-detail">
        <aside>
          <img className="kuro-cover" src={anime.coverImage.extraLarge || anime.coverImage.large} alt={anime.title.userPreferred} />
          <button className="kuro-button kuro-button-primary" style={{ width: '100%', marginTop: 10 }} onClick={() => openEpisode(1)} disabled={!totalEpisodes}><Play size={15} fill="currentColor" /> Play from Beginning</button>
          <button className="kuro-button" style={{ width: '100%', marginTop: 8 }} onClick={() => void saveToList()}><Plus size={15} /> My List</button>
        </aside>

        <div>
          <div className="kuro-eyebrow">THE STORY</div>
          <h1>{anime.title.userPreferred}</h1>
          <p className="kuro-history-meta">{anime.title.english || anime.title.romaji} · {anime.season ?? '—'} {anime.seasonYear ?? ''}</p>
          <div className="kuro-chip-row">
            {anime.genres.slice(0, 6).map((genre) => <span className="kuro-chip" key={genre}>{genre}</span>)}
            <span className="kuro-chip">{anime.format}</span>
            {anime.episodes ? <span className="kuro-chip">{anime.episodes} episodes</span> : null}
            {anime.averageScore ? <span className="kuro-chip">★ {(anime.averageScore / 10).toFixed(1)}</span> : null}
          </div>
          <p className="kuro-page-copy" style={{ maxWidth: 780 }}>{anime.description?.replace(/<[^>]*>/g, '') || 'No description available.'}</p>

          <section className="kuro-section" style={{ marginTop: 30 }}>
            <div className="kuro-section-head"><div><div className="kuro-eyebrow">EPISODES</div><h2>Season and episode states</h2></div></div>
            <div className="kuro-episode-grid">
              {Array.from({ length: totalEpisodes }, (_, index) => index + 1).map((episode) => (
                <button key={episode} type="button" className={selectedEpisode === episode ? 'kuro-button kuro-button-primary' : 'kuro-button'} onClick={() => openEpisode(episode)}>
                  {episode}
                </button>
              ))}
            </div>
          </section>

          {recommendations.length > 0 && (
            <section className="kuro-section">
              <div className="kuro-section-head"><div><div className="kuro-eyebrow">MORE LIKE THIS</div><h2>Recommendations</h2></div></div>
              <div className="kuro-card-grid">
                {recommendations.slice(0, 6).map((item: AniListMedia) => <AnimeCard key={item.id} anime={item} compact />)}
              </div>
            </section>
          )}
        </div>
      </section>

      {showPlayer && selectedEpisode !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.86)' }}>
          <div style={{ width: 'min(1200px, 100%)' }}>
            <div className="kuro-watch-header">
              <p className="kuro-watch-title">{anime.title.userPreferred} <span>· Episode {selectedEpisode}</span></p>
              <button type="button" className="kuro-icon-button" onClick={() => setShowPlayer(false)} aria-label="Close player"><X size={18} /></button>
            </div>
            <div className="kuro-player-frame">
              <VideoPlayer source={currentSource} subtitles={subtitles} onEnded={() => setShowPlayer(false)} onTimeUpdate={(time) => setCurrentTime(time)} />
            </div>
            {subtitles.length > 0 && (
              <div className="kuro-toolbar" style={{ marginTop: 10, border: '1px solid var(--kuro-border)', borderRadius: 12, background: 'rgba(17,20,27,.94)' }}>
                {subtitles.map((track) => (
                  <button key={track.url} type="button" className={currentSubtitle?.url === track.url ? 'kuro-filter is-active' : 'kuro-filter'} onClick={() => selectSubtitle(track)}>{track.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

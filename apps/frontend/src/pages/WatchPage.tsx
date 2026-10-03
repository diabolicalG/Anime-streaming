import { useParams } from 'react-router-dom';
import { useEffect, useState, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAnimeDetail } from '../hooks/useAnime';
import { Link } from 'react-router-dom';
import { EpisodeRail } from '../components/watch/EpisodeRail';
import { QualitySelector } from '../components/watch/QualitySelector';
import { SourceSelector } from '../components/watch/SourceSelector';
import { SubtitleMenu } from '../components/watch/SubtitleMenu';
import { ResumePrompt } from '../components/watch/ResumePrompt';
import { AutoNextOverlay } from '../components/watch/AutoNextOverlay';
import type { StreamSource } from '../types/streaming';

const VideoPlayer = lazy(() => import('../components/player/VideoPlayer').then(module => ({ default: module.VideoPlayer })));

function cleanDescription(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

export default function WatchPage() {
  const { anilistId, episode } = useParams<{ anilistId: string; episode: string }>();
  const epNum = Number(episode);
  const animeIdNum = anilistId ? Number(anilistId) : 0;

  const { setSources, currentSource, subtitles } = usePlayerStore();
  const [sources, setSourcesState] = useState<StreamSource[]>([]);
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);

  const anime = useAnimeDetail(animeIdNum);
  const epCount = anime.data?.episodes ?? null;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['episodeSources', 'anilist', animeIdNum, epNum],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: StreamSource[] }>(
        `/api/anime/anilist/${animeIdNum}/episodes/${epNum}`
      );
      return data.data;
    },
    enabled: !!anilistId && !!epNum && animeIdNum > 0,
  });

  useEffect(() => {
    if (data) {
      setSourcesState(data);
      if (!currentSource) {
        setSources(data);
      }
    }
  }, [data, currentSource, setSources]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400">Loading stream...</p>
        </div>
      </div>
    );
  }

  if (error || !sources.length) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-black">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Unable to Load Stream</h2>
          <p className="text-gray-400 mb-6">No playable sources found for this episode.</p>
          <a href="/" className="btn-primary">Back to Home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="watch-shell">
      <div>
        <div className="watch-player-area">
          <VideoPlayer
            source={currentSource}
            subtitles={subtitles}
            onEnded={() => console.log('Episode ended')}
            onLevelsChange={setLevels}
          />
          <AutoNextOverlay
            visible={false}
            secondsRemaining={0}
            nextEpisodeTitle={null}
            nextEpisodeNumber={null}
            onPlayNow={() => {}}
            onCancel={() => {}}
          />
        </div>
        <section className="watch-controls">
          <div className="watch-controls-row">
            <QualitySelector availableLevels={levels} />
            <SubtitleMenu />
          </div>
          <details className="watch-sources-details">
            <summary>Sources</summary>
            <SourceSelector onRetry={() => refetch()} />
          </details>
        </section>
        <section className="watch-info-area">
          <h1 className="text-2xl font-bold text-white">
            {anime.isLoading
              ? 'Loading…'
              : anime.data?.title?.userPreferred
              ?? anime.data?.title?.romaji
              ?? 'Unknown'}
          </h1>
          <p className="text-muted text-sm">Episode {epNum}</p>
          {anime.data?.description && (
            <p className="text-sm leading-relaxed text-gray-300">
              {cleanDescription(anime.data.description)}
            </p>
          )}
          <div className="watch-episode-meta">
            {epNum > 1 && (
              <Link to={`/watch/${anilistId}/${epNum - 1}`} className="watch-episode-prev">
                <span className="label">Previous Episode</span>
                <span className="title">Episode {epNum - 1}</span>
              </Link>
            )}
            {(!epCount || epNum < epCount) && (
              <Link to={`/watch/${anilistId}/${epNum + 1}`} className="watch-episode-next">
                <span className="label">Next Episode</span>
                <span className="title">Episode {epNum + 1}</span>
              </Link>
            )}
          </div>
        </section>
      </div>
      <EpisodeRail
        anilistId={anilistId ?? ''}
        currentEpisode={epNum}
        totalEpisodes={epCount}
      />
      <ResumePrompt
        open={false}
        currentTime={0}
        onResume={() => {}}
        onRestart={() => {}}
        onDismiss={() => {}}
      />
    </div>
  );
}
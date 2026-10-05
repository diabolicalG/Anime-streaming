import { useParams } from 'react-router-dom';
import { useCallback, useEffect, useState, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import { useAnimeDetail } from '../hooks/useAnime';
import { useEpisodeNavigation } from '../hooks/useEpisodeNavigation';
import { useAuth } from '../hooks/useAuth';
import { useWatchHistory } from '../hooks/useWatchHistory';
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

  const { setSources, setPlaying, currentSource, subtitles, currentTime, duration, setCurrentTime } = usePlayerStore();
  const [sources, setSourcesState] = useState<StreamSource[]>([]);
  const [levels, setLevels] = useState<{ height: number; bitrate: number }[]>([]);

  const anime = useAnimeDetail(animeIdNum);
  const epCount = anime.data?.episodes ?? null;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['episodeSources', 'anilist', animeIdNum, epNum],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: StreamSource[] }>(
        `/api/anime/anilist/${animeIdNum}/episodes/${epNum}/sources`
      );
      return data.data;
    },
    enabled: !!anilistId && !!epNum && animeIdNum > 0,
  });

  useEffect(() => {
    setSources([]);
  }, [animeIdNum, epNum, setSources]);

  useEffect(() => {
    if (data) {
      setSourcesState(data);
      if (!currentSource) {
        setSources(data);
      }
    }
  }, [data, currentSource, setSources]);

  const { nextEpisode, nextEpisodeTitle, prevEpisode, goToNext } = useEpisodeNavigation({
    anilistId: anilistId ?? '',
    currentEpisode: epNum,
    totalEpisodes: epCount,
  });

  const [showAutoNext, setShowAutoNext] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const { user } = useAuth();
  const autoPlayNext = user?.preferences?.autoPlayNext ?? true;
  const history = useWatchHistory(animeIdNum, epNum);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeHandled, setResumeHandled] = useState(false);

  useEffect(() => {
    const saved = history.history.data;
    if (!resumeHandled && saved && saved.position > 10 && !saved.completed) {
      setResumeOpen(true);
      setResumeHandled(true);
    }
  }, [history.history.data, resumeHandled]);

  useEffect(() => {
    setResumeOpen(false);
    setResumeHandled(false);
  }, [animeIdNum, epNum]);

  useEffect(() => {
    if (!user) return;
    if (currentTime <= 0 || duration <= 0) return;
    const timer = window.setTimeout(() => {
      history.save.mutate({ position: currentTime, completed: currentTime / duration >= 0.9 });
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [currentTime, duration, user, animeIdNum, epNum]);

  useEffect(() => {
    setShowAutoNext(false);
  }, [animeIdNum, epNum]);

  const handleEnded = useCallback(() => {
    if (user && currentTime > 0) history.save.mutate({ position: currentTime, completed: true });
    if (!autoPlayNext || nextEpisode == null) return;
    setShowAutoNext(true);
    setSecondsRemaining(10);
  }, [autoPlayNext, nextEpisode, user, currentTime, history.save]);

  const handleAutoNextCancel = useCallback(() => {
    setShowAutoNext(false);
  }, []);

  const handleAutoNextPlayNow = useCallback(() => {
    setShowAutoNext(false);
    setPlaying(true);
    goToNext();
  }, [goToNext, setPlaying]);

  useEffect(() => {
    if (!showAutoNext) return;
    if (secondsRemaining <= 0) {
      setShowAutoNext(false);
      setPlaying(true);
      goToNext();
      return;
    }
    const timer = setTimeout(() => {
      setSecondsRemaining((s) => s - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [showAutoNext, secondsRemaining, goToNext, setPlaying]);

  useEffect(() => {
    if (!showAutoNext) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleAutoNextCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showAutoNext, handleAutoNextCancel]);

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
            initialTime={history.history.data?.position ?? 0}
            onEnded={handleEnded}
            onTimeUpdate={(time) => setCurrentTime(time)}
            onLevelsChange={setLevels}
          />
          <AutoNextOverlay
            visible={showAutoNext && nextEpisode != null}
            secondsRemaining={secondsRemaining}
            nextEpisodeTitle={nextEpisodeTitle}
            nextEpisodeNumber={nextEpisode}
            onPlayNow={handleAutoNextPlayNow}
            onCancel={handleAutoNextCancel}
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
            {prevEpisode != null && (
              <Link to={`/watch/${anilistId}/${prevEpisode}`} className="watch-episode-prev">
                <span className="label">Previous Episode</span>
                <span className="title">Episode {prevEpisode}</span>
              </Link>
            )}
            {nextEpisode != null && (
              <Link to={`/watch/${anilistId}/${nextEpisode}`} className="watch-episode-next">
                <span className="label">Next Episode</span>
                <span className="title">Episode {nextEpisode}</span>
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
        open={resumeOpen}
        currentTime={history.history.data?.position ?? 0}
        onResume={() => {
          setResumeOpen(false);
          setPlaying(true);
        }}
        onRestart={() => {
          setCurrentTime(0);
          setResumeOpen(false);
          history.save.mutate({ position: 0, completed: false });
          setPlaying(true);
        }}
        onDismiss={() => setResumeOpen(false)}
      />
    </div>
  );
}
import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderMapping } from './useProviderMapping';
import { useAnimeInfo } from './useStream';

interface EpisodeEntry {
  number: number;
  title?: string;
}

interface UseEpisodeNavigationOptions {
  anilistId: string;
  currentEpisode: number;
  totalEpisodes: number | null;
}

interface UseEpisodeNavigationResult {
  nextEpisode: number | null;
  nextEpisodeTitle: string | null;
  prevEpisode: number | null;
  goToNext: () => void;
  goToPrev: () => void;
}

export function useEpisodeNavigation({
  anilistId,
  currentEpisode,
  totalEpisodes,
}: UseEpisodeNavigationOptions): UseEpisodeNavigationResult {
  const navigate = useNavigate();

  const anilistIdNum = anilistId ? Number(anilistId) : 0;
  const { data: mapping } = useProviderMapping(anilistIdNum);
  const providerId = mapping?.providerId ?? null;
  const { data: animeInfo } = useAnimeInfo(providerId);

  const episodesData = animeInfo?.episodesList ?? null;
  const fallbackTotal = totalEpisodes ?? (episodesData?.length ?? 12);

  const episodes: EpisodeEntry[] = useMemo(() => {
    if (episodesData) {
      return [...episodesData]
        .map((ep) => ({ number: ep.number, title: ep.title }))
        .sort((a, b) => a.number - b.number);
    }
    return Array.from({ length: fallbackTotal }, (_, i) => ({
      number: i + 1,
      title: undefined,
    }));
  }, [episodesData, fallbackTotal]);

  const nextEpisode = useMemo(() => {
    const found = episodes.find((ep) => ep.number > currentEpisode);
    return found ? found.number : null;
  }, [episodes, currentEpisode]);

  const nextEpisodeTitle = useMemo(() => {
    if (nextEpisode == null) return null;
    const match = episodes.find((ep) => ep.number === nextEpisode);
    return match?.title ?? null;
  }, [episodes, nextEpisode]);

  const prevEpisode = useMemo(() => {
    for (let i = episodes.length - 1; i >= 0; i--) {
      if (episodes[i].number < currentEpisode) return episodes[i].number;
    }
    return null;
  }, [episodes, currentEpisode]);

  const goToNext = useCallback(() => {
    if (!anilistId || nextEpisode == null) return;
    navigate(`/watch/${anilistId}/${nextEpisode}`);
  }, [navigate, anilistId, nextEpisode]);

  const goToPrev = useCallback(() => {
    if (!anilistId || prevEpisode == null) return;
    navigate(`/watch/${anilistId}/${prevEpisode}`);
  }, [navigate, anilistId, prevEpisode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      const key = e.key.toLowerCase();
      if (key === 'n' && nextEpisode != null) {
        e.preventDefault();
        goToNext();
      } else if (key === 'p' && prevEpisode != null) {
        e.preventDefault();
        goToPrev();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [nextEpisode, prevEpisode, goToNext, goToPrev]);

  return { nextEpisode, nextEpisodeTitle, prevEpisode, goToNext, goToPrev };
}

import { useCallback, useMemo } from 'react';
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
  goToNext: () => void;
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

  const goToNext = useCallback(() => {
    if (nextEpisode == null) return;
    navigate(`/watch/${anilistId}/${nextEpisode}`);
  }, [navigate, anilistId, nextEpisode]);

  return { nextEpisode, nextEpisodeTitle, goToNext };
}

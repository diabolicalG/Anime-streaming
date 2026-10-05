import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useProviderMapping } from '../../hooks/useProviderMapping';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAnimeInfo } from '../../hooks/useStream';

interface EpisodeRailProps {
  anilistId: string;
  currentEpisode: number;
  totalEpisodes: number | null;
}

interface EpisodeWithMeta {
  number: number;
  title?: string;
  filler?: boolean;
}

export function EpisodeRail({ anilistId, currentEpisode, totalEpisodes }: EpisodeRailProps) {
  const anilistIdNum = anilistId ? Number(anilistId) : 0;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('watch:rail:collapsed') === 'true';
    }
    return false;
  });
  const currentItemRef = useRef<HTMLLIElement>(null);

  const { data: mapping } = useProviderMapping(anilistIdNum);
  const providerId = mapping?.providerId ?? null;
  const { data: animeInfo } = useAnimeInfo(providerId);

  const { data: history } = useQuery({
    queryKey: ['history', anilistIdNum],
    queryFn: async () => {
      const response = await api.get<{ success: boolean; data: Array<{ episode: number; position: number; completed: boolean }> }>('/api/user/history', { params: { animeId: anilistIdNum } });
      return response.data.data;
    },
    enabled: anilistIdNum > 0,
    retry: false,
  });
  const progressByEpisode = new Map((history ?? []).map((item) => [item.episode, item]));

  const episodesData = animeInfo?.episodesList ?? null;
  const fallbackTotal = totalEpisodes ?? (episodesData?.length ?? 12);
  const episodes: EpisodeWithMeta[] = episodesData?.map((ep) => ({
    number: ep.number,
    title: ep.title,
    filler: ep.filler,
  })) ?? Array.from({ length: fallbackTotal }, (_, i) => ({
    number: i + 1,
    title: undefined,
    filler: false,
  }));

  useEffect(() => {
    localStorage.setItem('watch:rail:collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed && currentItemRef.current) {
      currentItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [currentEpisode, collapsed]);

  return (
    <aside className="episode-rail">
      <header className="episode-rail-header">
        <h2>Episodes</h2>
        <button
          type="button"
          className="episode-rail-toggle"
          aria-label={collapsed ? 'Expand episode list' : 'Collapse episode list'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? 'rotate(-90deg)' : '' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </header>
      {!collapsed && (
        <ol className="episode-rail-list">
          {episodes.map((ep) => (
            <li
              key={ep.number}
              ref={ep.number === currentEpisode ? currentItemRef : undefined}
            >
              <Link
                to={`/watch/${anilistId}/${ep.number}`}
                className={
                  ep.number === currentEpisode
                    ? 'episode-rail-item is-current'
                    : 'episode-rail-item'
                }
              >
                <span className="episode-rail-num">
                  {String(ep.number).padStart(2, '0')}
                </span>
                <span className="episode-rail-title">
                  {ep.title ?? `Episode ${ep.number}`}
                </span>
                {ep.filler && <span className="episode-rail-tag">Filler</span>}
                {progressByEpisode.has(ep.number) && (
                  <span className="episode-rail-progress" aria-label={progressByEpisode.get(ep.number)?.completed ? 'Completed' : 'In progress'}>
                    <span
                      className="episode-rail-progress-fill"
                      style={{ width: progressByEpisode.get(ep.number)?.completed ? '100%' : '45%' }}
                    />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
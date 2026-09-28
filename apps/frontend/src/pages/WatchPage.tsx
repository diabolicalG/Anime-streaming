import { useParams } from 'react-router-dom';
import { useEffect, useState, lazy } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import type { StreamSource } from '../types/streaming';

const VideoPlayer = lazy(() => import('../components/player/VideoPlayer').then(module => ({ default: module.VideoPlayer })));

export default function WatchPage() {
  const { anilistId, episode } = useParams<{ anilistId: string; episode: string }>();
  const epNum = parseInt(episode || '1', 10);
  const animeIdNum = parseInt(anilistId || '0', 10);
  const { setSources, currentSource, selectSource, subtitles, currentSubtitle, selectSubtitle } = usePlayerStore();
  const [sources, setSourcesState] = useState<StreamSource[]>([]);

  const { data, isLoading, error } = useQuery({
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
    <div className="min-h-screen bg-black">
      <div className="relative w-full aspect-video max-w-full">
        <VideoPlayer
          source={currentSource}
          subtitles={subtitles}
          onEnded={() => console.log('Episode ended')}
        />
      </div>
      
      <div className="p-4 border-t border-gray-800 bg-gray-950">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <select
              value={currentSource?.quality || 'auto'}
              onChange={(e) => {
                const source = sources.find(s => s.quality === e.target.value);
                if (source) selectSource(source);
              }}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
            >
              {sources.map(s => (
                <option key={s.quality} value={s.quality}>{s.quality}</option>
              ))}
            </select>
            
            {subtitles.length > 0 && (
              <select
                value={currentSubtitle?.lang || 'off'}
                onChange={(e) => {
                  const sub = subtitles.find(s => s.lang === e.target.value);
                  selectSubtitle(sub || null);
                }}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
              >
                <option value="off">Subtitles: Off</option>
                {subtitles.map(s => (
                  <option key={s.lang} value={s.lang}>{s.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

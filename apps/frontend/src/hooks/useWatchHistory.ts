import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export interface WatchHistoryItem {
  id: string;
  animeId: number;
  episode: number;
  position: number;
  completed: boolean;
  watchedAt: string;
}

export function useWatchHistory(animeId: number, episode: number) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (progress: { position: number; completed: boolean }) => {
      const { data } = await api.post<{ success: boolean; data: WatchHistoryItem }>(
        '/api/user/history',
        { animeId, episode, ...progress },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history', animeId] });
    },
  });

  const history = useQuery({
    queryKey: ['history', animeId, episode],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: WatchHistoryItem[] }>(
        '/api/user/history',
        { params: { animeId, episode } },
      );
      return data.data[0] ?? null;
    },
    enabled: animeId > 0 && episode > 0,
    retry: false,
  });

  return { history, save: mutation };
}

export function useWatchHistoryAutoSave(
  animeId: number,
  episode: number,
  currentTime: number,
  duration: number,
  isPlaying: boolean,
  enabled = true,
) {
  const { save } = useWatchHistory(animeId, episode);
  const lastSaved = useRef(0);

  useEffect(() => {
    if (!enabled || !isPlaying || currentTime <= 0) return;
    const timer = window.setTimeout(() => {
      if (currentTime - lastSaved.current >= 5) {
        save.mutate({ position: currentTime, completed: duration > 0 && currentTime / duration >= 0.9 });
        lastSaved.current = currentTime;
      }
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [animeId, episode, currentTime, duration, isPlaying, enabled, save]);

  const persist = (completed = false) => {
    if (!enabled || currentTime <= 0) return;
    save.mutate({ position: currentTime, completed });
    lastSaved.current = currentTime;
  };

  return { persist, isSaving: save.isPending };
}

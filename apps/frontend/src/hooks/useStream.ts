import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { StreamSource, AnimeInfo } from '../types/streaming';

export function useAnimeInfo(providerId: string | null) {
  return useQuery({
    queryKey: ['anime', providerId],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: AnimeInfo }>(`/api/anime/${providerId}`);
      return data.data;
    },
    enabled: !!providerId,
  });
}

export function useEpisodeSources(animeId: string | null, episode: number | null) {
  return useQuery({
    queryKey: ['episodeSources', animeId, episode],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: StreamSource[] }>(
        `/api/anime/${animeId}/episodes/${episode}/sources`
      );
      return data.data;
    },
    enabled: !!animeId && !!episode,
  });
}

export function useWatchHistory(animeId: number) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (progress: { episode: number; position: number; completed: boolean }) => {
      const { data } = await api.post('/api/user/history', { animeId, ...progress });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useProviderMapping(anilistId: number | null) {
  return useQuery({
    queryKey: ['provider', 'mapping', anilistId],
    queryFn: async () => {
      const { data } = await api.get<{ 
        success: boolean; 
        data: { providerId: string; providerName: string } 
      }>(`/api/anime/anilist/${anilistId}/resolve`);
      return data.data;
    },
    enabled: !!anilistId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: 1,
  });
}

export function useEpisodeSourcesWithMapping(anilistId: number | null, episode: number | null) {
  return useQuery({
    queryKey: ['episodeSources', 'anilist', anilistId, episode],
    queryFn: async () => {
      const { data } = await api.get<{ success: boolean; data: import('../types/streaming').StreamSource[] }>(
        `/api/anime/anilist/${anilistId}/episodes/${episode}/sources`
      );
      return data.data;
    },
    enabled: !!anilistId && !!episode,
    staleTime: 5 * 60 * 1000,
  });
}

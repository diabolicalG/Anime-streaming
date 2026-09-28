import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { anilistApi } from '../services/anilist';
import type { AniListMedia } from '../types/anilist';

export function useAnimeSearch(query: string, page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['anime', 'search', query, page],
    queryFn: async () => {
      const result = await anilistApi.search({ search: query, page, perPage });
      return { media: result.Page.media, pageInfo: result.Page.pageInfo };
    },
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInfiniteAnimeSearch(query: string) {
  return useInfiniteQuery({
    queryKey: ['anime', 'search', 'infinite', query],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await anilistApi.search({ search: query, page: pageParam, perPage: 20 });
      return {
        media: result.Page.media,
        pageInfo: result.Page.pageInfo,
      };
    },
    getNextPageParam: (lastPage: { media: AniListMedia[]; pageInfo: { hasNextPage: boolean; currentPage: number } }) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnimeDetail(anilistId: number | null) {
  return useQuery({
    queryKey: ['anime', 'detail', anilistId],
    queryFn: async () => {
      const result = await anilistApi.detail(anilistId!);
      return result.Media;
    },
    enabled: !!anilistId,
    staleTime: 60 * 60 * 1000,
  });
}

export function useSeasonal(season: string, year: number, page = 1) {
  return useQuery({
    queryKey: ['anime', 'seasonal', season, year, page],
    queryFn: async () => {
      const result = await anilistApi.seasonal(season, year, page, 20);
      return { media: result.Page.media, pageInfo: result.Page.pageInfo };
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useInfiniteSeasonal(season: string, year: number) {
  return useInfiniteQuery({
    queryKey: ['anime', 'seasonal', 'infinite', season, year],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await anilistApi.seasonal(season, year, pageParam, 20);
      return { media: result.Page.media, pageInfo: result.Page.pageInfo };
    },
    getNextPageParam: (lastPage: { media: AniListMedia[]; pageInfo: { hasNextPage: boolean; currentPage: number } }) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    staleTime: 60 * 60 * 1000,
  });
}

export function useBrowse(filters: {
  genre?: string;
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
  page?: number;
}) {
  return useQuery({
    queryKey: ['anime', 'browse', filters],
    queryFn: async () => {
      const result = await anilistApi.browse({
        genre: filters.genre,
        status: filters.status,
        format: filters.format,
        season: filters.season,
        seasonYear: filters.seasonYear,
        page: filters.page || 1,
        perPage: 20,
      });
      return { media: result.Page.media, pageInfo: result.Page.pageInfo };
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useInfiniteBrowse(filters: {
  genre?: string;
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
}) {
  return useInfiniteQuery({
    queryKey: ['anime', 'browse', 'infinite', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await anilistApi.browse({
        genre: filters.genre,
        status: filters.status,
        format: filters.format,
        season: filters.season,
        seasonYear: filters.seasonYear,
        page: pageParam,
        perPage: 20,
      });
      return { media: result.Page.media, pageInfo: result.Page.pageInfo };
    },
    getNextPageParam: (lastPage: { media: AniListMedia[]; pageInfo: { hasNextPage: boolean; currentPage: number } }) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    staleTime: 60 * 60 * 1000,
  });
}

export function useRecommendations(anilistId: number | null) {
  return useQuery({
    queryKey: ['anime', 'recommendations', anilistId],
    queryFn: async () => {
      const result = await anilistApi.recommendations(anilistId!);
      return result.Media.recommendations.nodes.map((node: { mediaRecommendation: AniListMedia; rating?: number }) => ({
        ...node.mediaRecommendation,
        recommendationRating: node.rating,
      }));
    },
    enabled: !!anilistId,
    staleTime: 60 * 60 * 1000,
  });
}

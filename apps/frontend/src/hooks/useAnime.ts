import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { anilistApi } from '../services/anilist';
import type { AniListMedia, AniListPageInfo, AniListSearchResult, AniListDetailResult, AniListSeasonalResult, AniListBrowseResult, AniListRecommendationsResult, MediaSeason, MediaStatus, MediaFormat } from '../types/anilist';

export function useAnimeSearch(query: string, page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['anime', 'search', query, page],
    queryFn: async () => {
      const { data } = await anilistApi.search({ search: query, page, perPage });
      return { media: data.Page.media, pageInfo: data.Page.pageInfo };
    },
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInfiniteAnimeSearch(query: string) {
  return useInfiniteQuery({
    queryKey: ['anime', 'search', 'infinite', query],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await anilistApi.search({ search: query, page: pageParam, perPage: 20 });
      return {
        media: data.Page.media,
        pageInfo: data.Page.pageInfo,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnimeDetail(anilistId: number | null) {
  return useQuery({
    queryKey: ['anime', 'detail', anilistId],
    queryFn: async () => {
      const { data } = await anilistApi.detail(anilistId!);
      return data.Media;
    },
    enabled: !!anilistId,
    staleTime: 60 * 60 * 1000,
  });
}

export function useSeasonal(season: string, year: number, page = 1) {
  return useQuery({
    queryKey: ['anime', 'seasonal', season, year, page],
    queryFn: async () => {
      const { data } = await anilistApi.seasonal(season, year, page, 20);
      return { media: data.Page.media, pageInfo: data.Page.pageInfo };
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useInfiniteSeasonal(season: string, year: number) {
  return useInfiniteQuery({
    queryKey: ['anime', 'seasonal', 'infinite', season, year],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await anilistApi.seasonal(season, year, pageParam, 20);
      return { media: data.Page.media, pageInfo: data.Page.pageInfo };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
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
      const { data } = await anilistApi.browse({
        genre: filters.genre,
        status: filters.status,
        format: filters.format,
        season: filters.season,
        seasonYear: filters.seasonYear,
        page: filters.page || 1,
        perPage: 20,
      });
      return { media: data.Page.media, pageInfo: data.Page.pageInfo };
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
      const { data } = await anilistApi.browse({
        genre: filters.genre,
        status: filters.status,
        format: filters.format,
        season: filters.season,
        seasonYear: filters.seasonYear,
        page: pageParam,
        perPage: 20,
      });
      return { media: data.Page.media, pageInfo: data.Page.pageInfo };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useRecommendations(anilistId: number | null) {
  return useQuery({
    queryKey: ['anime', 'recommendations', anilistId],
    queryFn: async () => {
      const { data } = await anilistApi.recommendations(anilistId!);
      return data.Media.recommendations.nodes.map((node: { mediaRecommendation: AniListMedia; rating?: number }) => ({
        ...node.mediaRecommendation,
        recommendationRating: node.rating,
      }));
    },
    enabled: !!anilistId,
    staleTime: 60 * 60 * 1000,
  });
}

// Type for the infinite query results
type AniListMedia = {
  id: number;
  title: { romaji: string; english?: string; native: string; userPreferred: string };
  coverImage: { large: string; medium: string };
  status: string;
  format: string;
  episodes?: number;
  season?: string;
  seasonYear?: number;
  genres: string[];
  averageScore?: number;
  popularity?: number;
  startDate?: { year?: number };
  coverImage?: { large: string; medium: string };
  bannerImage?: string;
  description?: string;
  synonyms?: string[];
  duration?: number;
  genres?: string[];
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  startDate?: { year?: number; month?: number; day?: number };
  endDate?: { year?: number; month?: number; day?: number };
  studios?: { nodes: Array<{ name: string }> };
  trailer?: { id?: string; site?: string; thumbnail?: string };
  recommendations?: { nodes: Array<{ mediaRecommendation: AniListMedia; rating?: number }> };
};

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: {
    romaji: string;
    english?: string;
    native: string;
    userPreferred: string;
  };
  synonyms: string[];
  coverImage: {
    large: string;
    medium: string;
    extraLarge?: string;
    color?: string;
  };
  bannerImage?: string;
  description: string;
  status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  format: 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';
  episodes?: number;
  duration?: number;
  season?: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  seasonYear?: number;
  genres: string[];
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  startDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  endDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  studios?: {
    nodes: Array<{ name: string }>;
  };
  trailer?: {
    id?: string;
    site?: string;
    thumbnail?: string;
  };
  recommendations?: {
    nodes: Array<{
      mediaRecommendation: AniListMedia;
      rating?: number;
    }>;
  };
}

export interface AniListPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
  perPage: number;
}

export interface AniListSearchResponse {
  Page: {
    pageInfo: AniListPageInfo;
    media: AniListMedia[];
  };
}

export interface AniListDetailResponse {
  Media: AniListMedia;
}

export interface AniListSeasonalResponse {
  Page: {
    pageInfo: AniListPageInfo;
    media: AniListMedia[];
  };
}

export interface AniListBrowseResponse {
  Page: {
    pageInfo: AniListPageInfo;
    media: AniListMedia[];
  };
}

export interface AniListRecommendationsResponse {
  Media: {
    recommendations: {
      nodes: Array<{
        mediaRecommendation: AniListMedia;
        rating?: number;
      }>;
    };
  };
}

export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

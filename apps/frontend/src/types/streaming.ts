export interface StreamSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  headers?: Record<string, string>;
  subtitles?: SubtitleTrack[];
  referrer?: string;
  sourceLabel?: string;
}

export interface SubtitleTrack {
  url: string;
  lang: string;
  label: string;
  default?: boolean;
}

export interface Episode {
  number: number;
  title?: string;
  filler?: boolean;
  sources?: StreamSource[];
}

export interface AnimeInfo {
  id: string;
  title: string;
  synonyms: string[];
  image: string;
  cover?: string;
  description: string;
  type: string;
  status: string;
  episodes: number;
  genres: string[];
  season?: string;
  year?: number;
  episodesList: Episode[];
}

export interface ProviderSearchResult {
  id: string;
  title: string;
  image?: string;
  type: 'TV' | 'MOVIE' | 'OVA' | 'SPECIAL';
  episodes?: number;
  status?: 'ongoing' | 'completed';
}

// AniList types (shared with anilist.ts)
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

export interface AniListSearchResult {
  media: AniListMedia[];
  pageInfo: AniListPageInfo;
}

export interface AniListDetailResult {
  media: AniListMedia;
}

export interface AniListSeasonalResult {
  media: AniListMedia[];
  pageInfo: AniListPageInfo;
}

export interface AniListBrowseResult {
  media: AniListMedia[];
  pageInfo: AniListPageInfo;
}

export interface AniListRecommendationsResult {
  recommendations: Array<{
    media: AniListMedia;
    rating?: number;
  }>;
}

export type MediaSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export type MediaStatus = 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
export type MediaFormat = 'TV' | 'TV_SHORT' | 'MOVIE' | 'SPECIAL' | 'OVA' | 'ONA' | 'MUSIC' | 'MANGA' | 'NOVEL' | 'ONE_SHOT';

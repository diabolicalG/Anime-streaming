import { GraphQLClient, gql } from 'graphql-request';

const client = new GraphQLClient(import.meta.env.VITE_ANILIST_API_URL || 'https://graphql.anilist.co');

const MEDIA_FRAGMENT = gql`
  fragment MediaFields on Media {
    id
    idMal
    title {
      romaji
      english
      native
      userPreferred
    }
    synonyms
    coverImage {
      large
      medium
      extraLarge
      color
    }
    bannerImage
    description
    status
    format
    episodes
    duration
    season
    seasonYear
    genres
    averageScore
    meanScore
    popularity
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    studios {
      nodes {
        name
      }
    }
    trailer {
      id
      site
      thumbnail
    }
  }
`;

const SEARCH_QUERY = gql`
  query SearchAnime($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total, currentPage, lastPage, hasNextPage, perPage }
      media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC]) {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

const DETAIL_QUERY = gql`
  query AnimeDetail($id: Int!) {
    Media(id: $id, type: ANIME) {
      ...MediaFields
      recommendations(perPage: 10) {
        nodes {
          mediaRecommendation {
            ...MediaFields
          }
          rating
        }
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

const SEASONAL_QUERY = gql`
  query SeasonalAnime($season: MediaSeason!, $seasonYear: Int!, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total, currentPage, lastPage, hasNextPage, perPage }
      media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC]) {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

const BROWSE_QUERY = gql`
  query BrowseAnime(
    $genre: String
    $status: MediaStatus
    $format: MediaFormat
    $season: MediaSeason
    $seasonYear: Int
    $page: Int
    $perPage: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total, currentPage, lastPage, hasNextPage, perPage }
      media(
        genre: $genre
        status: $status
        format: $format
        season: $season
        seasonYear: $seasonYear
        type: ANIME
        sort: [POPULARITY_DESC, SCORE_DESC]
      ) {
        ...MediaFields
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

const RECOMMENDATIONS_QUERY = gql`
  query AnimeRecommendations($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      recommendations(perPage: 10) {
        nodes {
          mediaRecommendation {
            ...MediaFields
          }
          rating
        }
      }
    }
  }
  ${MEDIA_FRAGMENT}
`;

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

export const anilistApi = {
  search: (variables: { search: string; page?: number; perPage?: number }) => 
    client.request<{ Page: { media: AniListMedia[]; pageInfo: AniListPageInfo } }>(SEARCH_QUERY, variables),

  detail: (id: number) => 
    client.request<{ Media: AniListMedia }>(DETAIL_QUERY, { id }),

  seasonal: (season: string, year: number, page = 1, perPage = 20) => 
    client.request<{ Page: { media: AniListMedia[]; pageInfo: AniListPageInfo } }>(SEASONAL_QUERY, { season, seasonYear: year, page, perPage }),

  browse: (filters: { 
    genre?: string; 
    status?: string; 
    format?: string; 
    season?: string; 
    seasonYear?: number; 
    page?: number; 
    perPage?: number 
  }) => 
    client.request<{ Page: { media: AniListMedia[]; pageInfo: AniListPageInfo } }>(BROWSE_QUERY, filters),

  recommendations: (id: number) => 
    client.request<{ Media: { recommendations: { nodes: Array<{ mediaRecommendation: AniListMedia; rating?: number }> } } }>(RECOMMENDATIONS_QUERY, { id }),
};

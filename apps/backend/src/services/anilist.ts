import { GraphQLClient, gql } from 'graphql-request';
import { env } from '../config/env';
import type {
  AniListMedia,
  AniListSearchResponse,
  AniListDetailResponse,
  AniListSeasonalResponse,
  AniListBrowseResponse,
  AniListRecommendationsResponse,
  MediaSeason,
  MediaStatus,
  MediaFormat,
} from '../types/anilist';

const client = new GraphQLClient(env.ANILIST_API_URL, {
  fetch: globalThis.fetch,
});

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
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
        perPage
      }
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
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
        perPage
      }
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
    $year: Int
    $page: Int
    $perPage: Int
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
        perPage
      }
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

export interface AniListSearchResult {
  media: AniListMedia[];
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
}

export interface AniListDetailResult {
  media: AniListMedia;
}

export interface AniListSeasonalResult {
  media: AniListMedia[];
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
}

export interface AniListBrowseResult {
  media: AniListMedia[];
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
}

export interface AniListRecommendationsResult {
  recommendations: Array<{
    media: AniListMedia;
    rating?: number;
  }>;
}

export const anilistService = {
  async search(query: string, page = 1, perPage = 20): Promise<AniListSearchResult> {
    const data = await client.request<AniListSearchResponse>(SEARCH_QUERY, {
      search: query,
      page,
      perPage,
    });
    return {
      media: data.Page.media,
      pageInfo: data.Page.pageInfo,
    };
  },

  async getDetail(anilistId: number): Promise<AniListDetailResult> {
    const data = await client.request<AniListDetailResponse>(DETAIL_QUERY, {
      id: anilistId,
    });
    return { media: data.Media };
  },

  async getSeasonal(
    season: MediaSeason,
    seasonYear: number,
    page = 1,
    perPage = 20
  ): Promise<AniListSeasonalResult> {
    const data = await client.request<AniListSeasonalResponse>(SEASONAL_QUERY, {
      season,
      seasonYear,
      page,
      perPage,
    });
    return {
      media: data.Page.media,
      pageInfo: data.Page.pageInfo,
    };
  },

  async browse(filters: {
    genre?: string;
    status?: MediaStatus;
    format?: MediaFormat;
    season?: MediaSeason;
    seasonYear?: number;
    year?: number;
    page?: number;
    perPage?: number;
  }): Promise<AniListBrowseResult> {
    const data = await client.request<AniListBrowseResponse>(BROWSE_QUERY, {
      genre: filters.genre,
      status: filters.status,
      format: filters.format,
      season: filters.season,
      seasonYear: filters.seasonYear,
      page: filters.page ?? 1,
      perPage: filters.perPage ?? 20,
    });
    return {
      media: data.Page.media,
      pageInfo: data.Page.pageInfo,
    };
  },

  async getRecommendations(anilistId: number): Promise<AniListRecommendationsResult> {
    const data = await client.request<AniListRecommendationsResponse>(RECOMMENDATIONS_QUERY, {
      id: anilistId,
    });
    return {
      recommendations: data.Media.recommendations.nodes.map((node) => ({
        media: node.mediaRecommendation,
        rating: node.rating,
      })),
    };
  },

  getCurrentSeason(): { season: MediaSeason; year: number } {
    const now = new Date();
    const month = now.getMonth();
    let season: MediaSeason;
    if (month >= 0 && month <= 2) season = 'WINTER';
    else if (month >= 3 && month <= 5) season = 'SPRING';
    else if (month >= 6 && month <= 8) season = 'SUMMER';
    else season = 'FALL';
    return { season, year: now.getFullYear() };
  },
};

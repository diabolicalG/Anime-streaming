export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page: number;
    totalPages: number;
    total: number;
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  role: string;
  createdAt: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: string;
  autoPlayNext: boolean;
  skipIntro: boolean;
  subtitleLang: string;
  videoQuality: string;
}

// AniList API response types
export interface AniListSearchResponse {
  media: import('../types/streaming').AniListMedia[];
  pageInfo: import('../types/streaming').AniListPageInfo;
}

export interface AniListDetailResponse {
  media: import('../types/streaming').AniListMedia;
}

export interface AniListSeasonalResponse {
  media: import('../types/streaming').AniListMedia[];
  pageInfo: import('../types/streaming').AniListPageInfo;
}

export interface AniListBrowseResponse {
  media: import('../types/streaming').AniListMedia[];
  pageInfo: import('../types/streaming').AniListPageInfo;
}

export interface AniListRecommendationsResponse {
  recommendations: Array<{
    media: import('../types/streaming').AniListMedia;
    rating?: number;
  }>;
}

export interface ProviderMappingResponse {
  providerId: string;
  providerName: string;
}

export interface StreamSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  headers?: Record<string, string>;
  subtitles?: SubtitleTrack[];
  referrer?: string;
}

export interface SubtitleTrack {
  url: string;
  lang: string;
  label: string;
  default?: boolean;
}

export interface EpisodeInfo {
  id: string;
  number: number;
  title?: string;
  filler?: boolean;
  sources: StreamSource[];
}

export interface ProviderSearchResult {
  id: string;
  title: string;
  image?: string;
  type: 'TV' | 'MOVIE' | 'OVA' | 'SPECIAL';
  episodes?: number;
  status?: 'ongoing' | 'completed';
}

export interface ProviderDetail {
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
  episodesList: EpisodeInfo[];
}

export interface StreamingProvider {
  readonly name: string;
  readonly baseUrl: string;
  readonly priority: number;
  readonly supportsDub: boolean;
  readonly supportsSub: boolean;

  search(query: string, page?: number): Promise<ProviderSearchResult[]>;
  getAnimeInfo(providerId: string): Promise<ProviderDetail>;
  getEpisodeSources(providerId: string, providerEpisodeId: string): Promise<StreamSource[]>;
  healthCheck(): Promise<boolean>;
}

export type ProviderName = 'consumet' | 'anivexa' | 'anikoto' | 'kuhi';

export const PROVIDER_NAMES: ProviderName[] = ['consumet', 'anivexa', 'kuhi'];

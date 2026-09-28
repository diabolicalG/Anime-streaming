export interface SyncAnimeMeta {
  providerAnimeId: string;
  title: string;
  synonyms: string[];
  image?: string;
  type: string;
  status: string;
  episodeCount?: number;
  season?: string;
  year?: number;
  genres: string[];
}

export interface SyncEpisode {
  providerEpisodeId: string;
  number: number;
  title?: string;
  isFiller?: boolean;
  isRecap?: boolean;
  airDate?: Date;
}

export interface SyncAdapter {
  readonly providerId: string;
  readonly providerName: string;

  fetchFullCatalog(): Promise<SyncAnimeMeta[]>;
  fetchAnimeMeta(providerAnimeId: string): Promise<SyncAnimeMeta | null>;
  fetchEpisodeList(providerAnimeId: string): Promise<SyncEpisode[]>;
  healthCheck(): Promise<boolean>;
}
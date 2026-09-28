import { BaseDiscoveryAdapter } from './DiscoveryAdapter';
import { ProviderDiscoveryConfig, DiscoveredReleaseInput, DiscoveryAdapterCallOptions } from '../../../types/discovery';
import { getProviderConfig } from '../../../config/discovery';

interface ConsumetSearchResult {
  id: string;
  title: string;
  image: string;
  type: string;
  episodes: number;
  status: string;
}

interface ConsumetAnimeInfo {
  id: string;
  title: string;
  synonyms: string[];
  image: string;
  cover: string;
  description: string;
  type: string;
  status: string;
  episodes: number;
  genres: string[];
  season: string;
  releaseDate: string;
  episodesList: ConsumetEpisode[];
}

interface ConsumetEpisode {
  id: string;
  number: number;
  title: string;
  isFiller: boolean;
}

export class ConsumetDiscoveryAdapter extends BaseDiscoveryAdapter {
  readonly providerId = 'consumet';
  readonly providerName = 'Consumet';

  constructor(config?: Partial<ProviderDiscoveryConfig>) {
    const fullConfig = getProviderConfig('consumet');
    const baseUrl = fullConfig.baseUrl ?? 'https://api.consumet.org';
    super({ ...fullConfig, ...config }, baseUrl);
  }

  async discover(options: DiscoveryAdapterCallOptions = {}): Promise<DiscoveredReleaseInput[]> {
    const { page = 1, limit = this.config.maxPagesPerScan, signal } = options;
    const releases: DiscoveredReleaseInput[] = [];
    const maxReleases = this.config.maxReleasesPerScan;

    for (let p = page; p < page + limit && releases.length < maxReleases; p++) {
      if (signal?.aborted) break;

      try {
        const pageReleases = await this.withRetry(async () => {
          return await this.withConcurrency(async () => {
            const { data } = await this.client.get('/anime/gogoanime/recent-episodes', {
              params: { page: p },
              signal,
            });

            return this.parseRecentEpisodes(data);
          });
        }, { signal });

        releases.push(...pageReleases);

        if (pageReleases.length === 0) break;

        if (releases.length >= maxReleases) {
          return releases.slice(0, maxReleases);
        }
      } catch (error) {
        console.warn(`[${this.providerId}] Failed to fetch page ${p}:`, error);
        break;
      }
    }

    return releases.slice(0, maxReleases);
  }

  private parseRecentEpisodes(data: unknown): DiscoveredReleaseInput[] {
    const results = (data as { results?: ConsumetRecentEpisode[] })?.results || [];
    const releases: DiscoveredReleaseInput[] = [];

    for (const item of results) {
      if (!item.animeId || !item.episodeId || !item.episodeNum) continue;

      releases.push({
        provider: this.providerId,
        providerAnimeId: item.animeId,
        providerEpisodeId: item.episodeId,
        episodeNumber: item.episodeNum,
        episodeTitle: item.episodeTitle,
        airDate: item.airDate ? new Date(item.airDate) : undefined,
        isFiller: false,
        isRecap: false,
        rawData: {
          animeTitle: item.animeTitle,
          animeImage: item.animeImage,
        },
      });
    }

    return releases;
  }

  protected async performHealthCheck(): Promise<void> {
    await this.client.get('/anime/gogoanime/search', {
      params: { query: 'test', page: 1 },
      timeout: 5000,
    });
  }
}

interface ConsumetRecentEpisode {
  animeId: string;
  animeTitle: string;
  animeImage: string;
  episodeId: string;
  episodeNum: number;
  episodeTitle: string;
  airDate: string;
  isFiller: boolean;
}

export class ConsumetAnimeDiscoveryAdapter extends BaseDiscoveryAdapter {
  readonly providerId = 'consumet';
  readonly providerName = 'Consumet (Anime Catalog)';

  constructor(config?: Partial<ProviderDiscoveryConfig>) {
    const fullConfig = getProviderConfig('consumet');
    const baseUrl = fullConfig.baseUrl ?? 'https://api.consumet.org';
    super({ ...fullConfig, ...config }, baseUrl);
  }

  async discover(options: DiscoveryAdapterCallOptions = {}): Promise<DiscoveredReleaseInput[]> {
    const { page = 1, limit = this.config.maxPagesPerScan, signal } = options;
    const releases: DiscoveredReleaseInput[] = [];
    const maxReleases = this.config.maxReleasesPerScan;

    for (let p = page; p < page + limit && releases.length < maxReleases; p++) {
      if (signal?.aborted) break;

      try {
        const pageReleases = await this.withRetry(async () => {
          return await this.withConcurrency(async () => {
            const { data } = await this.client.get('/anime/gogoanime/top-airing', {
              params: { page: p },
              signal,
            });

            return await this.parseTopAiring(data);
          });
        }, { signal });

        releases.push(...pageReleases);

        if (pageReleases.length === 0) break;

        if (releases.length >= maxReleases) {
          return releases.slice(0, maxReleases);
        }
      } catch (error) {
        console.warn(`[${this.providerId}] Failed to fetch top airing page ${p}:`, error);
        break;
      }
    }

    return releases.slice(0, maxReleases);
  }

  private async parseTopAiring(data: unknown): Promise<DiscoveredReleaseInput[]> {
    const results = (data as { results?: ConsumetSearchResult[] })?.results || [];
    const releases: DiscoveredReleaseInput[] = [];
    const maxReleases = this.config.maxReleasesPerScan;

    for (const anime of results) {
      if (!anime.id || !anime.episodes) continue;

      try {
        const animeInfo = await this.fetchAnimeInfo(anime.id);
        if (!animeInfo) continue;

        for (const episode of animeInfo.episodesList) {
          if (releases.length >= maxReleases) break;

          releases.push({
            provider: this.providerId,
            providerAnimeId: animeInfo.id,
            providerEpisodeId: episode.id,
            episodeNumber: episode.number,
            episodeTitle: episode.title,
            isFiller: episode.isFiller,
            isRecap: false,
            rawData: {
              animeTitle: animeInfo.title,
              animeImage: animeInfo.image,
            },
          });
        }
      } catch (error) {
        console.warn(`[${this.providerId}] Failed to fetch anime ${anime.id}:`, error);
      }
    }

    return releases;
  }

  private async fetchAnimeInfo(animeId: string): Promise<ConsumetAnimeInfo | null> {
    try {
      const { data } = await this.withRetry(async () => {
        return await this.withConcurrency(async () => {
          const { data } = await this.client.get(`/anime/gogoanime/info/${animeId}`);
          return data;
        });
      });
      return data as ConsumetAnimeInfo;
    } catch {
      return null;
    }
  }

  protected async performHealthCheck(): Promise<void> {
    await this.client.get('/anime/gogoanime/search', {
      params: { query: 'test', page: 1 },
      timeout: 5000,
    });
  }
}
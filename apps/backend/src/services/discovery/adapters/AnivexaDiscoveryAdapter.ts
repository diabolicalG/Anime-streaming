import { BaseDiscoveryAdapter } from './DiscoveryAdapter';
import { ProviderDiscoveryConfig, DiscoveredReleaseInput, DiscoveryAdapterCallOptions } from '../../../types/discovery';
import { getProviderConfig } from '../../../config/discovery';

interface AnivexaSearchResult {
  id: string;
  title: string;
  image: string;
  type: string;
  episodes: number;
  status: string;
}

interface AnivexaAnimeInfo {
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
  episodesList: AnivexaEpisode[];
}

interface AnivexaEpisode {
  id: string;
  number: number;
  title: string;
}

interface AnivexaRecentEpisode {
  animeId: string;
  animeTitle: string;
  animeImage: string;
  episodeId: string;
  episodeNum: number;
  episodeTitle: string;
  airDate: string;
}

export class AnivexaDiscoveryAdapter extends BaseDiscoveryAdapter {
  readonly providerId = 'anivexa';
  readonly providerName = 'Anivexa';

  constructor(config?: Partial<ProviderDiscoveryConfig>) {
    const fullConfig = getProviderConfig('anivexa');
    const baseUrl = fullConfig.baseUrl ?? 'https://api.anivexa.com';
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
            const { data } = await this.client.get('/recent-episodes', {
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
    const results = (data as { results?: AnivexaRecentEpisode[] })?.results || [];
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
    await this.client.get('/search', {
      params: { q: 'test', page: 1 },
      timeout: 5000,
    });
  }
}

export class AnivexaAnimeDiscoveryAdapter extends BaseDiscoveryAdapter {
  readonly providerId = 'anivexa';
  readonly providerName = 'Anivexa (Anime Catalog)';

  constructor(config?: Partial<ProviderDiscoveryConfig>) {
    const fullConfig = getProviderConfig('anivexa');
    const baseUrl = fullConfig.baseUrl ?? 'https://api.anivexa.com';
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
            const { data } = await this.client.get('/top-airing', {
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
    const results = (data as { results?: AnivexaSearchResult[] })?.results || [];
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
            isFiller: false,
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

  private async fetchAnimeInfo(animeId: string): Promise<AnivexaAnimeInfo | null> {
    try {
      const { data } = await this.withRetry(async () => {
        return await this.withConcurrency(async () => {
          const { data } = await this.client.get(`/anime/${animeId}`);
          return data;
        });
      });
      return data as AnivexaAnimeInfo;
    } catch {
      return null;
    }
  }

  protected async performHealthCheck(): Promise<void> {
    await this.client.get('/search', {
      params: { q: 'test', page: 1 },
      timeout: 5000,
    });
  }
}
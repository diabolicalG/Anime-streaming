import { BaseDiscoveryAdapter } from './DiscoveryAdapter';
import { getProviderConfig } from "../../../config/discovery";
import { ProviderDiscoveryConfig, DiscoveredReleaseInput, DiscoveryAdapterCallOptions } from '../../../types/discovery';

export class AnikotoDiscoveryAdapter extends BaseDiscoveryAdapter {
  readonly providerId = 'anikoto';
  readonly providerName = 'AniKoto';

  constructor(config?: Partial<ProviderDiscoveryConfig>) {
    const fullConfig = getProviderConfig('anikoto');
    const baseUrl = fullConfig.baseUrl ?? 'https://anikotoapi.site';
    super({ ...fullConfig, ...config }, baseUrl);
  }

  async discover(options: DiscoveryAdapterCallOptions = {}): Promise<DiscoveredReleaseInput[]> {
    const { page = 1, limit = this.config.maxPagesPerScan, signal } = options;
    const releases: DiscoveredReleaseInput[] = [];
    const maxReleases = this.config.maxReleasesPerScan;

    try {
      // First, get anime list from /recent-anime for anime-level discovery
      const { data: animeResponse } = await this.withRetry(async () => {
        return await this.withConcurrency(async () => {
          const { data } = await this.client.get('/recent-anime', {
            params: { page, per_page: 50 },
            signal,
          });
          return data || { anikoto_domains: [], data: [] };
        });
      });

      const animeList = animeResponse?.data || [];

      // For each anime, fetch episode-level data from /series/{id}
      for (const anime of animeList.slice(0, maxReleases)) {
        const animeId = anime.id;
        if (!animeId) continue;

        // Fetch episode details from /series/{id}
        const { data: seriesData } = await this.withRetry(async () => {
          return await this.withConcurrency(async () => {
            const { data } = await this.client.get(`/series/${animeId}`, {
              signal,
            });
            return data || { data: { anime: {}, episodes: [] } };
          });
        });

        const seriesInfo = seriesData?.data?.anime;
        const episodes = seriesData?.data?.episodes || [];

        // Map each episode to a DiscoveredReleaseInput
        for (const episode of episodes.slice(0, 5)) { // Limit episodes per anime
          releases.push({
            provider: this.providerId,
            providerAnimeId: animeId.toString(),
            providerEpisodeId: episode.episode_embed_id || '',
            episodeNumber: episode.number,
            episodeTitle: episode.title,
            isFiller: false,
            isRecap: false,
            rawData: {
              animeTitle: anime.title,
              animeSlug: anime.slug,
              animeAniId: anime.ani_id,
              animeMalId: anime.mal_id,
              episodeId: episode.id,
              episodeEmbedId: episode.episode_embed_id,
              episodeEmbedSub: episode.embed_url?.sub,
            },
          });
        }
      }
    } catch (error) {
      console.warn(`[${this.providerId}] Failed to fetch anime data:`, error);
    }

    return releases;
  }

  protected async performHealthCheck(): Promise<void> {
    await this.client.get('/health', {
      params: { check: 'api' },
      timeout: 5000,
    });
  }
}
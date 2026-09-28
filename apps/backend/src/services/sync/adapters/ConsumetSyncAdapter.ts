import { providerRegistry } from '../../streaming';
import type { SyncAdapter, SyncAnimeMeta, SyncEpisode } from './SyncAdapter';
import type { ProviderDetail, EpisodeInfo, ProviderSearchResult } from '../../streaming/Provider';

export class ConsumetSyncAdapter {
  readonly providerId = 'consumet';
  readonly providerName = 'Consumet';

  private getProvider() {
    const provider = providerRegistry.getProvider('consumet');
    if (!provider) {
      throw new Error('ConsumetProvider not initialized');
    }
    return provider;
  }

  async fetchFullCatalog(): Promise<SyncAnimeMeta[]> {
    const provider = this.getProvider();
    const catalog: SyncAnimeMeta[] = [];

    const endpoints = ['/anime/gogoanime/top-airing', '/anime/gogoanime/popular', '/anime/gogoanime/recent'];

    for (const endpoint of endpoints) {
      try {
        for (let page = 1; page <= 10; page++) {
          const response = await provider.search('', page);
          if (!response.length) break;

          for (const result of response) {
            const existing = catalog.find(c => c.providerAnimeId === result.id);
            if (!existing) {
              catalog.push({
                providerAnimeId: result.id,
                title: result.title,
                synonyms: [], // ProviderSearchResult doesn't have synonyms
                image: result.image,
                type: result.type,
                status: result.status ?? 'unknown',
                episodeCount: result.episodes,
                genres: [], // ProviderSearchResult doesn't have genres
              });
            }
          }

          if (response.length < 20) break;
        }
      } catch (error) {
        console.warn(`[${this.providerId}] Failed to fetch catalog from ${endpoint}:`, error);
      }
    }

    return catalog;
  }

  async fetchAnimeMeta(providerAnimeId: string): Promise<SyncAnimeMeta | null> {
    try {
      const provider = this.getProvider();
      const detail = await provider.getAnimeInfo(providerAnimeId);

      return {
        providerAnimeId: detail.id,
        title: detail.title,
        synonyms: detail.synonyms || [],
        image: detail.image,
        type: detail.type,
        status: detail.status,
        episodeCount: detail.episodes,
        season: detail.season,
        year: detail.year,
        genres: detail.genres || [],
      };
    } catch (error) {
      console.warn(`[${this.providerId}] Failed to fetch anime meta for ${providerAnimeId}:`, error);
      return null;
    }
  }

  async fetchEpisodeList(providerAnimeId: string): Promise<SyncEpisode[]> {
    try {
      const provider = this.getProvider();
      const detail = await provider.getAnimeInfo(providerAnimeId);

      return detail.episodesList
        .filter(ep => ep.number != null)
        .map(ep => ({
          providerEpisodeId: String(ep.id),
          number: ep.number,
          title: ep.title,
          isFiller: ep.filler ?? false,
          isRecap: false, // EpisodeInfo doesn't have isRecap
          airDate: undefined, // EpisodeInfo doesn't have airDate
        }));
    } catch (error) {
      console.warn(`[${this.providerId}] Failed to fetch episode list for ${providerAnimeId}:`, error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const provider = this.getProvider();
      return await provider.healthCheck();
    } catch {
      return false;
    }
  }
}

export const consumetSyncAdapter = new ConsumetSyncAdapter();
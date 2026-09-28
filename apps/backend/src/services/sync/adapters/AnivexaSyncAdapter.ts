import { providerRegistry } from '../../streaming';
import type { SyncAdapter, SyncAnimeMeta, SyncEpisode } from './SyncAdapter';
import type { ProviderDetail, EpisodeInfo, ProviderSearchResult } from '../../streaming/Provider';

export class AnivexaSyncAdapter {
  readonly providerId = 'anivexa';
  readonly providerName = 'Anivexa';

  private getProvider() {
    const provider = providerRegistry.getProvider('anivexa');
    if (!provider) {
      throw new Error('AnivexaProvider not initialized');
    }
    return provider;
  }

  async fetchFullCatalog(): Promise<SyncAnimeMeta[]> {
    const provider = this.getProvider();
    const catalog: SyncAnimeMeta[] = [];

    try {
      for (let page = 1; page <= 20; page++) {
        const response = await provider.search('', page);
        if (!response.length) break;

        for (const result of response) {
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

        if (response.length < 20) break;
      }
    } catch (error) {
      console.warn(`[${this.providerId}] Failed to fetch catalog:`, error);
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
          isRecap: false,
          airDate: undefined,
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

export const anivexaSyncAdapter = new AnivexaSyncAdapter();
import { ProviderName, ProviderDetail, ProviderSearchResult, StreamSource, PROVIDER_NAMES } from './Provider';
import { ConsumetProvider } from './ConsumetProvider';
import { AnivexaProvider } from './AnivexaProvider';
import { KuhiProvider } from './KuhiProvider';
import { env } from '../../config/env';
import { searchCache, animeCache, episodeCache, CACHE_TTL, searchCacheKey, animeCacheKey, episodeCacheKey } from '../cache';
import { providerCircuitBreakers } from './CircuitBreaker';
import { mappingService } from '../mapping';

export { PROVIDER_NAMES };

type ProviderInstance = ConsumetProvider | AnivexaProvider | KuhiProvider;

class ProviderRegistry {
  private providers: Map<ProviderName, ProviderInstance> = new Map();
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    // Disabled: api.consumet.org returns 451 (legally blocked).
    // this.providers.set('consumet', new ConsumetProvider(env.CONSUMET_BASE_URL));
    // Disabled: api.anivexa.com is ENOTFOUND (dead host).
    // this.providers.set('anivexa', new AnivexaProvider(env.ANIVEXA_BASE_URL));
    this.providers.set('kuhi', new KuhiProvider(env.KUHI_API_URL));

    this.initialized = true;
  }

  getProvider(name: ProviderName): ProviderInstance | undefined {
    this.initialize();
    return this.providers.get(name);
  }

  getAllProviders(): ProviderInstance[] {
    this.initialize();
    return Array.from(this.providers.values()).sort((a, b) => a.priority - b.priority);
  }

  async getBestProvider(): Promise<ProviderInstance | null> {
    const providers = this.getAllProviders();
    for (const provider of providers) {
      if (await provider.healthCheck()) return provider;
    }
    return null;
  }

  async searchWithFallback(query: string, page = 1): Promise<ProviderSearchResult[]> {
    const cacheKey = searchCacheKey(query, page);
    const cached = await searchCache.get<ProviderSearchResult[]>(cacheKey);
    if (cached) return cached;

    const providers = this.getAllProviders();
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const results = await providerCircuitBreakers.wrapSearch(provider.name, () => provider.search(query, page));
        if (results.length > 0) {
          await searchCache.set(cacheKey, results, CACHE_TTL.SEARCH);
          return results;
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${provider.name}] Search failed:`, error);
      }
    }
    throw lastError || new Error('All providers failed');
  }

  async getAnimeInfoWithFallback(providerId: string): Promise<ProviderDetail> {
    const cacheKey = animeCacheKey(providerId);
    const cached = await animeCache.get<ProviderDetail>(cacheKey);
    if (cached) return cached;

    // Check if this might be an AniList ID (numeric string that doesn't match provider format)
    const isPotentialAniListId = /^\d+$/.test(providerId) && 
      !providerId.startsWith('gogoanime') && 
      !providerId.startsWith('anivexa');

    if (isPotentialAniListId) {
      const anilistId = parseInt(providerId, 10);
      const resolved = await mappingService.resolveProviderId(anilistId);
      if (resolved) {
        // Use the resolved provider ID
        return this.getAnimeInfoWithFallback(resolved.providerId);
      }
    }

    const providers = this.getAllProviders();
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const detail = await providerCircuitBreakers.wrapAnimeInfo(provider.name, () => provider.getAnimeInfo(providerId));
        if (detail) {
          await animeCache.set(cacheKey, detail, CACHE_TTL.ANIME);
          return detail;
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${provider.name}] getAnimeInfo failed:`, error);
      }
    }
    throw lastError || new Error('All providers failed');
  }

  async getEpisodeSourcesWithFallback(
    providerId: string,
    providerEpisodeId: string,
  ): Promise<StreamSource[]> {
    const cacheKey = `ep:${providerId}:${providerEpisodeId}`;
    const cached = await episodeCache.get<StreamSource[]>(cacheKey);
    if (cached) return cached;

    // Check if this might be an AniList ID
    const isPotentialAniListId = /^\d+$/.test(providerId) && 
      !providerId.startsWith('gogoanime') && 
      !providerId.startsWith('anivexa');

    if (isPotentialAniListId) {
      const anilistId = parseInt(providerId, 10);
      const resolved = await mappingService.resolveProviderId(anilistId);
      if (resolved) {
        // Use the resolved provider ID and route to the specific provider
        const resolvedProvider = this.getProvider(resolved.providerName as ProviderName);
        if (!resolvedProvider) {
          throw new Error(`Resolved provider '${resolved.providerName}' not found`);
        }
        try {
          const sources = await providerCircuitBreakers.wrapEpisodeSources(
            resolvedProvider.name,
            () => resolvedProvider.getEpisodeSources(resolved.providerId, providerEpisodeId)
          );
          if (sources.length > 0) {
            await episodeCache.set(cacheKey, sources, CACHE_TTL.EPISODE_SOURCES);
            return sources;
          }
          // Resolved provider returned no sources - don't fall back to other providers
          throw new Error('No stream sources available from resolved provider');
        } catch (error) {
          // Preserve the original error path - don't silently try other providers
          throw error;
        }
      }
    }

    const providers = this.getAllProviders();
    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const sources = await providerCircuitBreakers.wrapEpisodeSources(provider.name, () => provider.getEpisodeSources(providerId, providerEpisodeId));
        if (sources.length > 0) {
          await episodeCache.set(cacheKey, sources, CACHE_TTL.EPISODE_SOURCES);
          return sources;
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${provider.name}] getEpisodeSources failed:`, error);
      }
    }
    throw lastError || new Error('No stream sources available from any provider');
  }

  /**
   * Get episode sources from a specific provider by name.
   * Use this when you know which provider the anime/episode belongs to (e.g., from availability checks).
   */
  async getEpisodeSourcesFromProvider(
    providerName: ProviderName,
    providerId: string,
    providerEpisodeId: string,
  ): Promise<StreamSource[]> {
    const cacheKey = `ep:${providerId}:${providerEpisodeId}`;
    const cached = await episodeCache.get<StreamSource[]>(cacheKey);
    if (cached) return cached;

    const provider = this.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider '${providerName}' not found`);
    }

    try {
      const sources = await providerCircuitBreakers.wrapEpisodeSources(
        providerName,
        () => provider.getEpisodeSources(providerId, providerEpisodeId)
      );
      if (sources.length > 0) {
        await episodeCache.set(cacheKey, sources, CACHE_TTL.EPISODE_SOURCES);
        return sources;
      }
      throw new Error(`No stream sources available from provider ${providerName}`);
    } catch (error) {
      console.warn(`[${providerName}] getEpisodeSources failed:`, error);
      throw error;
    }
  }
}

export const providerRegistry = new ProviderRegistry();

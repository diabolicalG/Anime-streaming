import { redis } from '../config/redis';

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

const DEFAULT_PREFIX = 'anime-streaming';

export class CacheService {
  private prefix: string;

  constructor(prefix: string = DEFAULT_PREFIX) {
    this.prefix = prefix;
  }

  private key(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(this.key(key));
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.warn(`Cache GET failed for ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await redis.setex(this.key(key), ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.warn(`Cache SET failed for ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await redis.del(this.key(key));
    } catch (error) {
      console.warn(`Cache DEL failed for ${key}:`, error);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(this.key(pattern));
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.warn(`Cache DEL pattern failed for ${pattern}:`, error);
    }
  }
}

export const searchCache = new CacheService('search');
export const animeCache = new CacheService('anime');
export const episodeCache = new CacheService('episode');

// AniList cache services
export const anilistSearchCache = new CacheService('anilist:search');
export const anilistDetailCache = new CacheService('anilist:detail');
export const anilistSeasonalCache = new CacheService('anilist:seasonal');
export const anilistBrowseCache = new CacheService('anilist:browse');
export const anilistRecommendationsCache = new CacheService('anilist:recommendations');
export const mappingCache = new CacheService('mapping:anilist');

export const CACHE_TTL = {
  SEARCH: 6 * 60 * 60,
  ANIME: 1 * 60 * 60,
  EPISODE_SOURCES: 6 * 60 * 60,
  ANILIST_SEARCH: 6 * 60 * 60,
  ANILIST_DETAIL: 1 * 60 * 60,
  ANILIST_SEASONAL: 1 * 60 * 60,
  ANILIST_BROWSE: 1 * 60 * 60,
  ANILIST_RECOMMENDATIONS: 6 * 60 * 60,
  MAPPING: 7 * 24 * 60 * 60, // 7 days
  MAPPING_UNRESOLVED: 60 * 60, // 1 hour
} as const;

export function searchCacheKey(query: string, page: number): string {
  return `q:${query.toLowerCase().trim()}:p:${page}`;
}

export function animeCacheKey(providerId: string): string {
  return `id:${providerId}`;
}

export function episodeCacheKey(providerId: string, episode: number): string {
  return `id:${providerId}:ep:${episode}`;
}

// AniList cache keys
export function anilistSearchCacheKey(query: string, page: number): string {
  return `q:${query.toLowerCase().trim()}:p:${page}`;
}

export function anilistDetailCacheKey(anilistId: number): string {
  return `id:${anilistId}`;
}

export function anilistSeasonalCacheKey(season: string, year: number, page: number): string {
  return `s:${season}:y:${year}:p:${page}`;
}

export function anilistBrowseCacheKey(filters: Record<string, unknown>): string {
  const sorted = Object.keys(filters).sort().map(k => `${k}:${filters[k]}`).join(':');
  return `b:${sorted}`;
}

export function anilistRecommendationsCacheKey(anilistId: number): string {
  return `rec:${anilistId}`;
}

export function mappingCacheKey(anilistId: number): string {
  return `id:${anilistId}`;
}

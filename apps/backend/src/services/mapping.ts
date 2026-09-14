import { providerRegistry } from './streaming';
import { mappingCache } from '../cache';
import { env } from '../config/env';
import { anilistService } from './anilist';
import type { ProviderSearchResult } from './streaming/Provider';

const CONFIDENCE_THRESHOLD = parseFloat(
  String(env.PROVIDER_MAPPING_CONFIDENCE_THRESHOLD || '0.85')
);

const OVERRIDE_MAP: Record<number, { providerId: string; providerName: string }> = {};

interface AniListMediaForMapping {
  title: { romaji: string; english?: string; native: string };
  synonyms: string[];
  format: string;
  seasonYear?: number;
  episodes?: number;
  season?: string;
}

function calculateScore(
  anilist: AniListMediaForMapping,
  provider: { title: string; year?: number; type?: string; episodes?: number; season?: string }
): number {
  let score = 0;

  const anilistTitles = [
    anilist.title.romaji,
    anilist.title.english,
    anilist.title.native,
    ...anilist.synonyms,
  ].filter((t): t is string => Boolean(t)).map(t => t.toLowerCase().trim());

  const providerTitle = provider.title.toLowerCase().trim();

  if (anilistTitles.length === 0) {
    return 0.1;
  }

  const firstTitle = anilistTitles[0];
  score = firstTitle === providerTitle ? 0.4 : stringSimilarity(providerTitle, firstTitle) * 0.3;

  score += anilist.synonyms.some((s: string) => s.toLowerCase() === providerTitle) ? 0.3 : 0;

  if (anilist.seasonYear && provider.year) {
    const yearDiff = Math.abs(anilist.seasonYear - provider.year);
    score += yearDiff === 0 ? 0.15 : yearDiff === 1 ? 0.1 : 0;
  }

  if (anilist.format && provider.type && anilist.format === provider.type) {
    score += 0.1;
  }

  if (anilist.episodes && provider.episodes) {
    const epDiff = Math.abs(anilist.episodes - provider.episodes);
    score += epDiff === 0 ? 0.05 : epDiff <= 2 ? 0.03 : 0;
  }

  if (anilist.season && provider.season) {
    const seasonMap: Record<string, string> = {
      winter: 'WINTER',
      spring: 'SPRING',
      summer: 'SUMMER',
      fall: 'FALL',
      autumn: 'FALL',
    };
    if (seasonMap[provider.season.toLowerCase()] === anilist.season) {
      score += 0.05;
    }
  }

  return Math.min(score, 1.0);
}

function stringSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

async function identifyProvider(providerId: string): Promise<string> {
  for (const provider of providerRegistry.getAllProviders()) {
    try {
      const info = await provider.getAnimeInfo(providerId);
      if (info) return provider.name;
    } catch {
      continue;
    }
  }
  return providerId.includes('gogoanime') ? 'consumet' : 'anivexa';
}

async function resolveProviderId(anilistId: number): Promise<{ providerId: string; providerName: string } | null> {
  const cacheKey = 'mapping:anilist:' + anilistId;

  const cached = await mappingCache.get<{ providerId: string; providerName: string }>(cacheKey);
  if (cached && cached.providerId) {
    return { providerId: cached.providerId, providerName: cached.providerName };
  }

  let anilist;
  try {
    const detail = await anilistService.getDetail(anilistId);
    anilist = detail.media;
  } catch (error) {
    console.warn('Failed to fetch AniList detail for ' + anilistId + ':', error);
    return null;
  }

  const override = OVERRIDE_MAP[anilistId];
  if (override) {
    await mappingCache.set('mapping:anilist:' + anilistId, override, 7 * 24 * 60 * 60);
    return { providerId: override.providerId, providerName: override.providerName };
  }

  let bestMatch: { result: { id: string; title: string; year?: number; type?: string; episodes?: number; season?: string }; score: number } | null = null;

  for (const provider of providerRegistry.getAllProviders()) {
    try {
      const results = await provider.search(anilist.title.romaji, 1);

      for (const result of results) {
        const score = calculateScore(
          anilist,
          result as ProviderSearchResult
        );
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { result, score };
        }
      }
    } catch (error) {
      console.warn('Provider search failed for mapping:', error);
    }
  }

  if (bestMatch && bestMatch.score >= CONFIDENCE_THRESHOLD) {
    const providerName = await identifyProvider(bestMatch.result.id);

    await mappingCache.set('mapping:anilist:' + anilistId, {
      providerId: bestMatch.result.id,
      providerName,
      score: bestMatch.score,
      resolvedAt: new Date().toISOString(),
    }, 7 * 24 * 60 * 60);

    return { providerId: bestMatch.result.id, providerName };
  }

  await mappingCache.set('mapping:anilist:' + anilistId, {
    providerId: '',
    providerName: 'consumet',
    score: 0,
    resolvedAt: new Date().toISOString(),
  }, 60 * 60);

  return null;
}

async function invalidateMapping(anilistId: number): Promise<void> {
  const cacheKey = 'mapping:anilist:' + anilistId;
  await mappingCache.del(cacheKey);
}

async function getMappingStatus(anilistId: number) {
  const cacheKey = 'mapping:anilist:' + anilistId;
  return mappingCache.get(cacheKey);
}

export const mappingService = {
  resolveProviderId,
  invalidateMapping,
  getMappingStatus,
};

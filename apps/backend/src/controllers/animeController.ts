import { Request, Response } from 'express';
import { z } from 'zod';
import { providerRegistry } from '../services/streaming';
import { streamResolver } from '../services/streaming/StreamResolver';
import { mappingService } from '../services/mapping';
import { anilistService } from '../services/anilist';
import { encodeToken } from '../stream/proxy';
import { StreamSource } from '../services/streaming/Provider';
import { PrismaClient } from '@prisma/client';
import { anilistSearchCache, anilistDetailCache, anilistSeasonalCache, anilistBrowseCache, anilistRecommendationsCache } from '../services/cache';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

const searchSchema = z.object({
  query: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
});

const animeIdSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

const episodeSchema = z.object({
  params: z.object({
    id: z.string().min(1),
    episode: z.coerce.number().int().positive(),
  }),
});

const seasonalSchema = z.object({
  query: z.object({
    season: z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL']).optional(),
    year: z.coerce.number().int().min(1970).max(2030).optional(),
    page: z.coerce.number().int().positive().default(1),
  }),
});

const browseSchema = z.object({
  query: z.object({
    genre: z.string().optional(),
    status: z.enum(['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS']).optional(),
    format: z.enum(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC', 'MANGA', 'NOVEL', 'ONE_SHOT']).optional(),
    season: z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL']).optional(),
    year: z.coerce.number().int().min(1970).max(2030).optional(),
    page: z.coerce.number().int().positive().default(1),
  }),
});

function withProxyUrls(sources: StreamSource[]): StreamSource[] {
  if (sources.length === 0) {
    return sources;
  }

  return sources.map((s) => {
    const srcToken = encodeToken(s.url);
    const refSuffix = s.referrer
      ? `&ref=${encodeToken(s.referrer)}`
      : '';

    const url = `/api/stream?src=${srcToken}${refSuffix}`;

    const subtitles =
      s.subtitles && s.subtitles.length > 0
        ? s.subtitles.map((t) => {
            const tSrc = encodeToken(t.url);
            const tRefSuffix = s.referrer
              ? `&ref=${encodeToken(s.referrer)}`
              : '';

            return {
              ...t,
              url: `/api/stream?src=${tSrc}${tRefSuffix}`,
            };
          })
        : s.subtitles;

    return {
      ...s,
      url,
      subtitles,
      referrer: undefined,
    };
  });
}

export const animeController = {
  async search(req: Request, res: Response) {
    const { query, page } = searchSchema.parse({ query: req.query.q, page: req.query.page });
    
    if (!query) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Query parameter "q" is required');
    }

    const results = await providerRegistry.searchWithFallback(query, page);
    
    res.json({ success: true, data: results });
  },

  async searchAnilist(req: Request, res: Response) {
    const { query, page } = searchSchema.parse({ query: req.query.q, page: req.query.page });
    
    if (!query) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Query parameter "q" is required');
    }

    const cacheKey = `search:${query.toLowerCase().trim()}:p:${page}`;
    const cached = await anilistSearchCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const result = await anilistService.search(query, page, 20);
    await anilistSearchCache.set(cacheKey, result, 6 * 60 * 60);
    
    res.json({ success: true, data: result });
  },

  async getAnimeInfo(req: Request, res: Response) {
    const { id } = animeIdSchema.parse(req).params;
    
    const detail = await providerRegistry.getAnimeInfoWithFallback(id);
    
    res.json({ success: true, data: detail });
  },

  async getAnilistDetail(req: Request, res: Response) {
    const { id } = req.params;
    const anilistId = parseInt(id, 10);
    
    if (isNaN(anilistId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid AniList ID');
    }

    const cacheKey = `detail:${anilistId}`;
    const cached = await anilistDetailCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const result = await anilistService.getDetail(anilistId);
    await anilistDetailCache.set(cacheKey, result, 60 * 60);
    
    res.json({ success: true, data: result });
  },

  async getEpisodeSources(req: Request, res: Response) {
    const { id, episode } = episodeSchema.parse(req).params;
    
    // Determine provider from provider ID format
    let providerName: string;
    let providerAnimeId: string;
    
    if (id.startsWith('gogoanime:')) {
      providerName = 'consumet';
      providerAnimeId = id.replace('gogoanime:', '');
    } else if (id.startsWith('anivexa:')) {
      providerName = 'anivexa';
      providerAnimeId = id.replace('anivexa:', '');
    } else {
      // Assume consumet format if no prefix
      providerName = 'consumet';
      providerAnimeId = id;
    }

    // Look up anime by provider mapping
    const anime = await prisma.anime.findFirst({
      where: {
        providerMappings: {
          path: [providerName],
          equals: providerAnimeId,
        },
      },
      select: { id: true },
    });

    if (!anime) {
      throw new AppError(404, 'NOT_FOUND', 'Anime not found for provider ID');
    }

    // Find episode and get provider-native episode ID
    const dbEpisode = await prisma.episode.findFirst({
      where: {
        animeId: anime.id,
        number: episode,
      },
      select: { providerEpisodeIds: true },
    });

    const providerEpisodeIds = dbEpisode?.providerEpisodeIds as Record<string, string> | null;
    const providerEpisodeId = providerEpisodeIds?.[providerName];

    if (!providerEpisodeId) {
      throw new AppError(404, 'NO_SOURCES', 'No provider-native episode ID found for this episode');
    }

    const resolution = await streamResolver.resolveWithRetry(
      providerAnimeId,
      episode,
      undefined,
      providerEpisodeId,
      { providerName: providerName as import('../services/streaming/Provider').ProviderName },
    );

    if (resolution.error) {
      const status = resolution.error.code === 'NO_SOURCES' ? 404 : 503;
      throw new AppError(status, resolution.error.code, resolution.error.message);
    }

    res.json({ success: true, data: withProxyUrls(resolution.sources) });
  },

  async getAnilistEpisodeSources(req: Request, res: Response) {
    const { id, episode } = req.params;
    const anilistId = parseInt(id, 10);
    const epNum = parseInt(episode, 10);
    
    if (isNaN(anilistId) || isNaN(epNum)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid AniList ID or episode number');
    }

    // Resolve AniList ID to provider
    const resolved = await mappingService.resolveProviderId(anilistId);
    if (!resolved) {
      throw new AppError(404, 'NOT_FOUND', 'Could not resolve provider for this AniList ID');
    }

    // Fetch episode from database to get provider-native episode ID
    const dbEpisode = await prisma.episode.findFirst({
      where: {
        anime: { anilistId },
        number: epNum,
      },
      select: { providerEpisodeIds: true },
    });

    const providerEpisodeIds = dbEpisode?.providerEpisodeIds as Record<string, string> | null;
    let providerEpisodeId = providerEpisodeIds?.[resolved.providerName];

    // Miruro's episode ID contract is unverified — Miruro is behind
    // MIRURO_ENABLED=false and not yet installed. If it requires an
    // encoded episode ID instead of the episode number, correct this fallback.
    if (!providerEpisodeId && (resolved.providerName === 'kuhi' || resolved.providerName === 'miruro')) {
      providerEpisodeId = String(epNum);
    }

    if (!providerEpisodeId) {
      throw new AppError(404, 'NO_SOURCES', 'No provider-native episode ID found for this episode');
    }

    const resolution = await streamResolver.resolveWithRetry(
      resolved.providerId,
      epNum,
      undefined,
      providerEpisodeId,
      { providerName: resolved.providerName as import('../services/streaming/Provider').ProviderName },
    );

    if (resolution.error) {
      const status = resolution.error.code === 'NO_SOURCES' ? 404 : 503;
      throw new AppError(status, resolution.error.code, resolution.error.message);
    }

    res.json({ success: true, data: withProxyUrls(resolution.sources) });
  },

  async getSeasonal(req: Request, res: Response) {
    const { season, year, page } = seasonalSchema.parse(req).query;
    
    const { season: currentSeason, year: currentYear } = anilistService.getCurrentSeason();
    const targetSeason = season || currentSeason;
    const targetYear = year || currentYear;

    const cacheKey = `seasonal:${targetSeason}:${targetYear}:p:${page}`;
    const cached = await anilistSeasonalCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const result = await anilistService.getSeasonal(targetSeason, targetYear, page, 20);
    await anilistSeasonalCache.set(cacheKey, result, 60 * 60);
    
    res.json({ success: true, data: result });
  },

  async getBrowse(req: Request, res: Response) {
    const filters = browseSchema.parse(req).query;
    const page = filters.page || 1;

    const cacheKey = `browse:${JSON.stringify(filters)}:p:${page}`;
    const cached = await anilistBrowseCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const result = await anilistService.browse({
      genre: filters.genre,
      status: filters.status,
      format: filters.format,
      season: filters.season,
      year: filters.year,
      page,
      perPage: 20,
    });
    
    await anilistBrowseCache.set(cacheKey, result, 60 * 60);
    
    res.json({ success: true, data: result });
  },

  async getRecommendations(req: Request, res: Response) {
    const { id } = req.params;
    const anilistId = parseInt(id, 10);
    
    if (isNaN(anilistId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid AniList ID');
    }

    const cacheKey = `rec:${anilistId}`;
    const cached = await anilistRecommendationsCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const result = await anilistService.getRecommendations(anilistId);
    await anilistRecommendationsCache.set(cacheKey, result, 6 * 60 * 60);
    
    res.json({ success: true, data: result });
  },

  async resolveProviderId(req: Request, res: Response) {
    const { id } = req.params;
    const anilistId = parseInt(id, 10);
    
    if (isNaN(anilistId)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid AniList ID');
    }

    const resolved = await mappingService.resolveProviderId(anilistId);
    
    if (!resolved) {
      return res.status(404).json({ 
        success: false, 
        error: { code: 'NOT_FOUND', message: 'Could not resolve provider for this AniList ID' } 
      });
    }

    res.json({ success: true, data: resolved });
  },
};

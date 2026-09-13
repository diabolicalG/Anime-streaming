import { Router } from 'express';
import { validate } from '../middleware/validation';
import { animeController } from '../controllers/animeController';
import { z } from 'zod';

const router = Router();

// Provider-based routes (existing)
const searchSchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200).optional(),
    page: z.coerce.number().int().positive().optional(),
  }),
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

// Provider-based routes
router.get('/search', validate(searchSchema), animeController.search);
router.get('/:id', validate(animeIdSchema), animeController.getAnimeInfo);
router.get('/:id/episodes/:episode/sources', validate(episodeSchema), animeController.getEpisodeSources);

// AniList routes
const anilistIdSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
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

const recommendationsSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
});

const anilistEpisodeSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
    episode: z.coerce.number().int().positive(),
  }),
});

router.get('/anilist/search', validate(searchSchema), animeController.searchAnilist);
router.get('/anilist/:id', validate(anilistIdSchema), animeController.getAnilistDetail);
router.get('/anilist/:id/recommendations', validate(recommendationsSchema), animeController.getRecommendations);
router.get('/anilist/seasonal', validate(seasonalSchema), animeController.getSeasonal);
router.get('/anilist/browse', validate(browseSchema), animeController.getBrowse);
router.get('/anilist/:id/episodes/:episode/sources', validate(anilistEpisodeSchema), animeController.getAnilistEpisodeSources);
router.get('/anilist/:id/resolve', validate(anilistIdSchema), animeController.resolveProviderId);

export default router;

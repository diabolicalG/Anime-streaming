import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const watchlistSchema = z.object({
  animeId: z.coerce.number().int().positive(),
  status: z.enum(['PLANNING', 'WATCHING', 'COMPLETED', 'ON_HOLD', 'DROPPED']).default('PLANNING'),
});

const preferencesSchema = z.object({
  theme: z.string().min(1).max(32).optional(),
  autoPlayNext: z.boolean().optional(),
  skipIntro: z.boolean().optional(),
  subtitleLang: z.string().min(1).max(16).optional(),
  videoQuality: z.string().min(1).max(16).optional(),
});

const profileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});

const historySchema = z.object({
  animeId: z.coerce.number().int().positive(),
  episode: z.coerce.number().int().positive(),
  position: z.coerce.number().finite().min(0).max(86400),
  completed: z.boolean().default(false),
});

router.use(authMiddleware);

router.post('/history', async (req, res) => {
  const input = historySchema.parse(req.body);
  const userId = req.user!.userId;

  const existing = await prisma.watchHistory.findFirst({
    where: {
      userId,
      animeId: input.animeId,
      episodeNumber: input.episode,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const history = existing
    ? await prisma.watchHistory.update({
        where: { id: existing.id },
        data: {
          progress: Math.floor(input.position),
          completed: input.completed,
          watchedAt: new Date(),
        },
      })
    : await prisma.watchHistory.create({
        data: {
          userId,
          animeId: input.animeId,
          episodeNumber: input.episode,
          progress: Math.floor(input.position),
          completed: input.completed,
        },
      });

  res.json({
    success: true,
    data: {
      id: history.id,
      animeId: history.animeId,
      episode: history.episodeNumber,
      position: history.progress,
      completed: history.completed,
      watchedAt: history.watchedAt,
    },
  });
});

router.get('/watchlist', async (req, res) => {
  const items = await prisma.watchlistItem.findMany({
    where: { userId: req.user!.userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ success: true, data: items.map((item) => ({ animeId: item.animeId, status: item.status, progress: item.progress, updatedAt: item.updatedAt })) });
});

router.post('/watchlist', async (req, res) => {
  const input = watchlistSchema.parse(req.body);
  const userId = req.user!.userId;
  const existing = await prisma.watchlistItem.findFirst({ where: { userId, animeId: input.animeId } });
  const item = existing
    ? await prisma.watchlistItem.update({ where: { id: existing.id }, data: { status: input.status } })
    : await prisma.watchlistItem.create({ data: { userId, animeId: input.animeId, status: input.status } });
  res.json({ success: true, data: { animeId: item.animeId, status: item.status, progress: item.progress, updatedAt: item.updatedAt } });
});

router.delete('/watchlist/:animeId', async (req, res) => {
  const animeId = Number(req.params.animeId);
  if (!Number.isInteger(animeId) || animeId <= 0) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid animeId');
  const item = await prisma.watchlistItem.findFirst({ where: { userId: req.user!.userId, animeId } });
  if (item) await prisma.watchlistItem.delete({ where: { id: item.id } });
  res.json({ success: true, data: { removed: Boolean(item), animeId } });
});

router.get('/preferences', async (req, res) => {
  const preferences = await prisma.userPreferences.findUnique({ where: { userId: req.user!.userId } });
  const data = preferences ?? await prisma.userPreferences.create({ data: { userId: req.user!.userId } });
  res.json({ success: true, data });
});

router.patch('/preferences', async (req, res) => {
  const input = preferencesSchema.parse(req.body);
  const preferences = await prisma.userPreferences.upsert({
    where: { userId: req.user!.userId },
    create: { userId: req.user!.userId, ...input },
    update: input,
  });
  res.json({ success: true, data: preferences });
});

router.patch('/profile', async (req, res) => {
  const input = profileSchema.parse(req.body);
  if (input.username) {
    const duplicate = await prisma.user.findFirst({ where: { username: input.username, NOT: { id: req.user!.userId } } });
    if (duplicate) throw new AppError(409, 'CONFLICT', 'Username already exists');
  }
  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: input,
    select: { id: true, email: true, username: true, avatarUrl: true, role: true, createdAt: true, preferences: true },
  });
  res.json({ success: true, data: user });
});

router.get('/history', async (req, res) => {
  const animeId = req.query.animeId === undefined ? undefined : Number(req.query.animeId);
  const episode = req.query.episode === undefined ? undefined : Number(req.query.episode);

  if (animeId !== undefined && (!Number.isInteger(animeId) || animeId <= 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid animeId');
  }
  if (episode !== undefined && (!Number.isInteger(episode) || episode <= 0)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid episode');
  }

  const history = await prisma.watchHistory.findMany({
    where: {
      userId: req.user!.userId,
      ...(animeId !== undefined ? { animeId } : {}),
      ...(episode !== undefined ? { episodeNumber: episode } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  res.json({
    success: true,
    data: history.map((item) => ({
      id: item.id,
      animeId: item.animeId,
      episode: item.episodeNumber,
      position: item.progress,
      completed: item.completed,
      watchedAt: item.watchedAt,
    })),
  });
});

export default router;

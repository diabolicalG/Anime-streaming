import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const router = Router();

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

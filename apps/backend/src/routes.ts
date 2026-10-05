import { Router } from 'express';
import { authController } from './controllers/authController';
import { animeController } from './controllers/animeController';
import { authMiddleware } from './middleware/auth';
import userRoutes from './routes/user';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/refresh', authController.refresh);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authMiddleware, authController.me);

// User routes
router.use('/user', userRoutes);

// Anime routes (public)
router.get('/anime/search', animeController.search);
router.get('/anime/search/anilist', animeController.searchAnilist);
router.get('/anime/:id', animeController.getAnimeInfo);
router.get('/anime/anilist/:id', animeController.getAnilistDetail);
router.get('/anime/:id/episodes/:episode/sources', animeController.getEpisodeSources);
router.get('/anime/anilist/:id/episodes/:episode/sources', animeController.getAnilistEpisodeSources);
router.get('/anime/seasonal', animeController.getSeasonal);
router.get('/anime/browse', animeController.getBrowse);
router.get('/anime/anilist/:id/recommendations', animeController.getRecommendations);
router.get('/anime/anilist/:id/resolve', animeController.resolveProviderId);

export default router;

import { Router } from 'express';
import authRoutes from './auth';
import healthRoutes from './health';
import animeRoutes from './anime';

const router = Router();

router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/anime', animeRoutes);

export default router;

import { Router } from 'express';
import { validate } from '../middleware/validation';
import { authMiddleware } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { authController } from '../controllers/authController';
import { z } from 'zod';

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8).max(128),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

const router = Router();

router.post('/register', strictRateLimiter, validate(registerSchema), authController.register);
router.post('/login', strictRateLimiter, validate(loginSchema), authController.login);
router.post('/logout', authMiddleware, authController.logout);
router.post('/refresh', authController.refresh);
router.get('/me', authMiddleware, authController.me);

export default router;

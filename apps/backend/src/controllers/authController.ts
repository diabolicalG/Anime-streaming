import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { authService } from '../services/authService';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies';
import { AppError } from '../middleware/errorHandler';

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authController = {
  async register(req: Request, res: Response) {
    const { email, username, password } = registerSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Email or username already exists');
    }

    const passwordHash = await authService.hashPassword(password);
    const user = await prisma.user.create({
      data: { email, username, passwordHash },
      select: { id: true, email: true, username: true, role: true },
    });

    const { accessToken, refreshToken } = await authService.createTokens(user.id, user.email, user.role);
    await authService.storeRefreshToken(user.id, refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({ success: true, data: { user } });
  },

  async login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const valid = await authService.verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const { accessToken, refreshToken } = await authService.createTokens(user.id, user.email, user.role);
    await authService.storeRefreshToken(user.id, refreshToken);

    setAuthCookies(res, accessToken, refreshToken);

    res.json({ success: true, data: { user: { id: user.id, email: user.email, username: user.username, role: user.role } } });
  },

  async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
    clearAuthCookies(res);
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  },

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new AppError(401, 'NO_REFRESH_TOKEN', 'No refresh token provided');
    }

    const { accessToken, refreshToken: newRefreshToken, user } = await authService.rotateRefreshToken(refreshToken);
    setAuthCookies(res, accessToken, newRefreshToken);

    res.json({ success: true, data: { message: 'Token refreshed' } });
  },

  async me(req: Request, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, username: true, avatarUrl: true, role: true, createdAt: true, preferences: true },
    });
    res.json({ success: true, data: { user } });
  },
};

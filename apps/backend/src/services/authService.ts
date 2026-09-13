import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';

export const authService = {
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  },

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  },

  async createTokens(userId: string, email: string, role: string) {
    const accessToken = generateAccessToken({ userId, email, role });
    const refreshToken = generateRefreshToken({ userId, email, role });
    return { accessToken, refreshToken };
  },

  async storeRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });
  },

  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { revoked: true },
    });
  },

  async rotateRefreshToken(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', 'User not found');

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    const { accessToken, refreshToken: newRefreshToken } = await this.createTokens(
      user.id, user.email, user.role
    );
    await this.storeRefreshToken(user.id, newRefreshToken);

    return { accessToken, refreshToken: newRefreshToken, user };
  },
};

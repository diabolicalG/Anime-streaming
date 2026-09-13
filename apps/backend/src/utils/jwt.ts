import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

export const generateAccessToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
};

export const generateRefreshToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'],
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};

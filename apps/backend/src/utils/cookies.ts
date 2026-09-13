import { Response } from 'express';
import { env, isProduction } from '../config/env';

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  domain: isProduction ? env.COOKIE_DOMAIN : undefined,
  path: '/',
  maxAge,
});

export const setAuthCookies = (res: Response, accessToken: string, refreshToken: string): void => {
  res.cookie('accessToken', accessToken, cookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
};

export const clearAuthCookies = (res: Response): void => {
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    domain: isProduction ? env.COOKIE_DOMAIN : undefined,
    path: '/',
  };
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
};

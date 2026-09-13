import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { prisma } from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const accessToken = req.cookies?.accessToken;
  
  if (!accessToken) {
    res.status(401).json({ 
      success: false, 
      error: { code: 'UNAUTHORIZED', message: 'No access token provided' } 
    });
    return;
  }

  try {
    const payload = verifyAccessToken(accessToken);
    
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true }
    });
    
    if (!user) {
      res.status(401).json({ 
        success: false, 
        error: { code: 'USER_NOT_FOUND', message: 'User no longer exists' } 
      });
      return;
    }
    
    req.user = { userId: user.id, email: user.email, role: user.role, type: 'access' };
    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      res.status(401).json({ 
        success: false, 
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } 
      });
      return;
    }
    res.status(401).json({ 
      success: false, 
      error: { code: 'INVALID_TOKEN', message: 'Invalid access token' } 
    });
  }
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const accessToken = req.cookies?.accessToken;
  if (!accessToken) return next();
  
  try {
    const payload = verifyAccessToken(accessToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true }
    });
    if (user) req.user = { userId: user.id, email: user.email, role: user.role, type: 'access' };
  } catch (err) { console.warn("Optional auth failed:", err); }
  next();
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ 
        success: false, 
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } 
      });
      return;
    }
    next();
  };
};

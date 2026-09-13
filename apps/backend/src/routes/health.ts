import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { providerRegistry } from '../services/streaming';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  const checks = {
    database: false,
    redis: false,
    providers: {} as Record<string, boolean>,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) { console.warn("DB health check failed:", err); }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (err) { console.warn("DB health check failed:", err); }

  for (const name of ['consumet', 'anivexa']) {
    const provider = providerRegistry.getProvider(name as any);
    if (provider) {
      checks.providers[name] = await provider.healthCheck();
    }
  }

  const healthy = checks.database && checks.redis;
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', (req: Request, res: Response) => {
  res.json({ success: true, ready: true });
});

export default router;

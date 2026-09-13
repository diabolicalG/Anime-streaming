import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function connectRedis() {
  await redis.connect();
}

export async function disconnectRedis() {
  await redis.quit();
}

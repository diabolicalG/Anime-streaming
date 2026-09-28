import { redis } from '../../config/redis';

export const LOCK_TTL_SECONDS = 3600;
export const LOCK_RENEWAL_INTERVAL_MS = 60_000;

export const SYNC_SCHEDULER_LOCK_KEY = 'sync:scheduler:lock';
export const SYNC_SCHEDULER_STATE_KEY = 'sync:scheduler:state';
export const SYNC_PROVIDER_LOCK_PREFIX = 'sync:lock:';
export const SYNC_METRICS_PREFIX = 'sync:metrics:';

export async function acquireLock(key: string): Promise<string | null> {
  const token = crypto.randomUUID();
  const ok = await redis.set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
  return ok ? token : null;
}

export async function renewLock(key: string, token: string): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, token, LOCK_TTL_SECONDS.toString());
  return result === 1;
}

export async function releaseLock(key: string, token: string): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, token);
  return result === 1;
}

export async function getLockOwner(key: string): Promise<string | null> {
  return redis.get(key);
}
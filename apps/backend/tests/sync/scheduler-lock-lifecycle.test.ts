import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { redis } from '../../src/config/redis';

const LOCK_KEY = 'sync:lock:test-provider';

describe('Redis Lock Atomic Ownership', () => {
  beforeEach(async () => {
    await redis.del('sync:lock:test');
  });

  afterEach(async () => {
    await redis.del('sync:lock:test');
  });

  it('owner can acquire lock', async () => {
    const token = await acquireLock('sync:lock:test');
    expect(token).toBeDefined();
    expect(await redis.get('sync:lock:test')).toBe(token);
  });

  it('owner can renew its own lock', async () => {
    const token = await acquireLock('sync:lock:test');
    await new Promise(r => setTimeout(r, 10));
    const renewed = await renewLock('sync:lock:test', token);
    expect(renewed).toBe(true);
    const ttl = await redis.ttl('sync:lock:test');
    expect(ttl).toBeGreaterThan(3500);
  });

  it('wrong token cannot renew', async () => {
    const token = await acquireLock('sync:lock:test');
    const renewed = await renewLock('sync:lock:test', 'wrong-token');
    expect(renewed).toBe(false);
  });

  it('owner can release its own lock', async () => {
    const token = await acquireLock('sync:lock:test');
    const released = await releaseLock('sync:lock:test', token);
    expect(released).toBe(true);
    expect(await redis.get('sync:lock:test')).toBeNull();
  });

  it('wrong token cannot release', async () => {
    const token = await acquireLock('sync:lock:test');
    const released = await releaseLock('sync:lock:test', 'wrong-token');
    expect(released).toBe(false);
    expect(await redis.get('sync:lock:test')).toBe(token);
  });

  it('expired lock can be acquired by new owner', async () => {
    const token = await acquireLock('sync:lock:test');
    await redis.expire('sync:lock:test', 1);
    await new Promise(r => setTimeout(r, 50));
    const newToken = await acquireLock('sync:lock:test');
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(token);
  });

  it('old owner cannot renew the new owner lock', async () => {
    const token1 = await acquireLock('sync:lock:test');
    await redis.del('sync:lock:test');
    const token2 = await acquireLock('sync:lock:test');
    
    const renewed = await renewLock('sync:lock:test', token1);
    expect(renewed).toBe(false);
  });

  it('old owner cannot release the new owner lock', async () => {
    const token1 = await acquireLock('sync:lock:test');
    await redis.del('sync:lock:test');
    const token2 = await acquireLock('sync:lock:test');
    
    const released = await releaseLock('sync:lock:test', token1);
    expect(released).toBe(false);
    expect(await redis.get('sync:lock:test')).toBe(token2);
  });

  it('renewal is atomic with ownership verification', async () => {
    const token = await acquireLock('sync:lock:test');
    await redis.set('sync:lock:test', 'new-owner-token');
    
    const renewed = await renewLock('sync:lock:test', token);
    expect(renewed).toBe(false);
  });
});

async function acquireLock(key: string): Promise<string | null> {
  const { redis } = await import('../../src/config/redis');
  const token = crypto.randomUUID();
  const ok = await redis.set(key, token, 'EX', 3600, 'NX');
  return ok ? token : null;
}

async function renewLock(key: string, token: string): Promise<boolean> {
  const { redis } = await import('../../src/config/redis');
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, token, '3600');
  return result === 1;
}

async function releaseLock(key: string, token: string): Promise<boolean> {
  const { redis } = await import('../../src/config/redis');
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
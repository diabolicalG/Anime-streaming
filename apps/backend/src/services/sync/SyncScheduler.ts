import { PrismaClient, SyncJobType, SyncJobStatus, ReleaseLifecycleState, AnimeSyncStatus, EpisodeSyncStatus } from '@prisma/client';
import { redis } from '../../config/redis';
import { getSyncAdapter } from './adapters';
import { providerRegistry } from '../streaming';
import { redis as redisClient } from '../../config/redis';
import { 
  acquireLock, 
  renewLock, 
  releaseLock, 
  LOCK_TTL_SECONDS, 
  LOCK_RENEWAL_INTERVAL_MS,
  SYNC_SCHEDULER_LOCK_KEY,
  SYNC_SCHEDULER_STATE_KEY,
  SYNC_PROVIDER_LOCK_PREFIX,
  SYNC_METRICS_PREFIX
} from './locks';
import { getProviderConfig, getSchedulerConfig } from '../../config/discovery';
import { discoveryLogger, generateCorrelationId } from '../../utils/logger';
import { Prisma } from '@prisma/client';

interface SyncSchedulerConfig {
  fullCatalogIntervalHours: number;
  incrementalIntervalMinutes: number;
  maxConcurrentProviders: number;
  jobTimeoutMinutes: number;
  maxRetries: number;
  lockTtlSeconds: number;
  lockRenewalIntervalSeconds: number;
}

interface SyncSchedulerState {
  running: boolean;
  lastRun?: Date;
  nextRun?: Date;
  currentJobs: Record<string, string>;
}

export class SyncScheduler {
  private prisma: PrismaClient;
  private config: {
    fullCatalogIntervalHours: number;
    incrementalIntervalMinutes: number;
    maxConcurrentProviders: number;
    jobTimeoutMinutes: number;
    maxRetries: number;
    lockTtlSeconds: number;
    lockRenewalIntervalSeconds: number;
  };
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running = false;
  private globalLockAcquired = false;
  private lockTokens = new Map<string, string>();
  private renewalInterval: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.config = this.getConfig();
  }

  private getConfig(): {
    fullCatalogIntervalHours: number;
    incrementalIntervalMinutes: number;
    maxConcurrentProviders: number;
    jobTimeoutMinutes: number;
    maxRetries: number;
    lockTtlSeconds: number;
    lockRenewalIntervalSeconds: number;
  } {
    return {
      fullCatalogIntervalHours: parseInt(process.env.SYNC_FULL_CATALOG_INTERVAL_HOURS || '24', 10),
      incrementalIntervalMinutes: parseInt(process.env.SYNC_INCREMENTAL_INTERVAL_MINUTES || '30', 10),
      maxConcurrentProviders: parseInt(process.env.SYNC_MAX_CONCURRENT_PROVIDERS || '2', 10),
      jobTimeoutMinutes: parseInt(process.env.SYNC_JOB_TIMEOUT_MINUTES || '120', 10),
      maxRetries: parseInt(process.env.SYNC_MAX_RETRIES || '3', 10),
      lockTtlSeconds: parseInt(process.env.SYNC_LOCK_TTL_SECONDS || '3600', 10),
      lockRenewalIntervalSeconds: parseInt(process.env.SYNC_LOCK_RENEWAL_INTERVAL_SECONDS || '60', 10),
    };
  }

  async start(): Promise<void> {
    if (this.running) return;

    const acquired = await this.acquireGlobalLock();
    if (!acquired) {
      console.warn('Another SyncScheduler instance is running');
      return;
    }

    this.globalLockAcquired = true;
    this.running = true;
    await this.saveState({ running: true, lastRun: new Date() });

    console.log('Starting SyncScheduler');
    this.startLockRenewal();
    this.scheduleAllProviders();
    this.scheduleWatchdog();
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    
    for (const [key, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
    }

    // Release all provider locks
    for (const [provider, token] of this.lockTokens) {
      await this.releaseProviderLock(provider, token);
    }
    this.lockTokens.clear();

    if (this.globalLockAcquired) {
      await this.releaseGlobalLock();
      this.globalLockAcquired = false;
    }

    await this.saveState({ running: false });
    console.log('SyncScheduler stopped');
  }

  private scheduleAllProviders(): void {
    const providerConfigs = {
      consumet: require('../../config/discovery').getProviderConfig('consumet'),
      anivexa: require('../../config/discovery').getProviderConfig('anivexa'),
    };

    for (const [providerId, config] of Object.entries(providerConfigs)) {
      if (!config.enabled) {
        console.log(`Provider ${providerId} disabled, skipping`);
        continue;
      }

      this.scheduleFullCatalog(providerId);
      this.scheduleIncremental(providerId);
    }
  }

  private scheduleFullCatalog(providerId: string): void {
    const run = async () => {
      if (!this.running) return;

      const idempotencyKey = `sync.full.${providerId}.${formatDate(new Date())}`;
      const job = await this.createSyncJob({
        jobKey: `sync.full.${providerId}`,
        type: SyncJobType.FULL_CATALOG,
        provider: providerId,
        correlationId: crypto.randomUUID(),
        idempotencyKey,
      });

      if (job.status !== SyncJobStatus.PENDING) {
        this.scheduleNextFullCatalog(providerId);
        return;
      }

      const lockToken = await this.acquireProviderLock(providerId);
      if (!lockToken) {
        this.scheduleNextFullCatalog(providerId);
        return;
      }

      try {
        await this.updateJobStatus(job.id, SyncJobStatus.RUNNING, { lockToken });
        
        const adapter = getSyncAdapter(providerId);
        const catalog = await adapter?.fetchFullCatalog?.() || [];
        
        let processed = 0;
        let deferred = 0;
        
        for (const meta of catalog) {
          const existingAnime = await this.prisma.anime.findFirst({
            where: { providerMappings: { path: [providerId], equals: meta.providerAnimeId } }
          });
          
          if (existingAnime) {
            processed++;
          } else {
            deferred++;
          }
        }
        
        await this.finishJob(job.id, SyncJobStatus.SUCCESS, { lockToken, provider: providerId, processed, deferred });
      } catch (e: any) {
        await this.finishJob(job.id, SyncJobStatus.FAILURE, { error: e.message, lockToken });
      } finally {
        this.scheduleNextFullCatalog(providerId);
      }
    };

    const intervalMs = this.config.fullCatalogIntervalHours * 60 * 60 * 1000;
    const timer = setTimeout(run, 1000);
    this.timers.set(`full-${providerId}`, timer);
  }

  private scheduleNextFullCatalog(providerId: string): void {
    if (!this.running) return;
    const intervalMs = this.config.fullCatalogIntervalHours * 60 * 60 * 1000;
    const timer = setTimeout(() => this.scheduleFullCatalog(providerId), intervalMs);
    this.timers.set(`full-${providerId}`, timer);
  }

  private scheduleIncremental(providerId: string): void {
    const run = async () => {
      if (!this.running) return;

      const windowStart = formatWindowStart(new Date());
      const idempotencyKey = `sync.incremental.${providerId}.${windowStart}`;
      const job = await this.createSyncJob({
        jobKey: `sync.incremental.${providerId}`,
        type: SyncJobType.INCREMENTAL_EPISODES,
        provider: providerId,
        correlationId: crypto.randomUUID(),
        idempotencyKey,
      });

      if (job.status !== SyncJobStatus.PENDING) {
        this.scheduleNextIncremental(providerId);
        return;
      }

      const lockToken = await this.acquireProviderLock(providerId);
      if (!lockToken) {
        this.scheduleNextIncremental(providerId);
        return;
      }

      try {
        await this.updateJobStatus(job.id, SyncJobStatus.RUNNING, { lockToken });
        
        await this.finishJob(job.id, SyncJobStatus.SUCCESS, { lockToken, provider: providerId });
      } catch (e: any) {
        await this.finishJob(job.id, SyncJobStatus.FAILURE, { error: e.message, lockToken, provider: providerId });
      } finally {
        this.scheduleNextIncremental(providerId);
      }
    };

    const intervalMs = this.config.incrementalIntervalMinutes * 60 * 60 * 1000;
    const timer = setTimeout(run, 1000);
    this.timers.set(`incremental-${providerId}`, timer);
  }

  private scheduleNextIncremental(providerId: string): void {
    if (!this.running) return;
    const intervalMs = this.config.incrementalIntervalMinutes * 60 * 60 * 1000;
    const timer = setTimeout(() => this.scheduleIncremental(providerId), intervalMs);
    this.timers.set(`incremental-${providerId}`, timer);
  }

  private scheduleWatchdog(): void {
    const run = async () => {
      if (!this.running) return;

      try {
        await this.watchdog();
      } catch (error) {
        console.error('Watchdog error:', error);
      }

      if (this.running) {
        const timer = setTimeout(run, 60_000); // Run every minute
        this.timers.set('watchdog', timer);
      }
    };

    const timer = setTimeout(run, 60_000);
    this.timers.set('watchdog', timer);
  }

  async watchdog(): Promise<void> {
    const timeoutAgo = new Date(Date.now() - this.config.jobTimeoutMinutes * 60 * 1000);
    
    const timedOutJobs = await this.prisma.syncJob.findMany({
      where: {
        status: SyncJobStatus.RUNNING,
        startedAt: { lt: new Date(Date.now() - this.config.jobTimeoutMinutes * 60 * 1000) }
      }
    });

    for (const job of timedOutJobs) {
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { 
          status: SyncJobStatus.FAILURE, 
          error: `Timeout after ${this.config.jobTimeoutMinutes} minutes`,
          finishedAt: new Date() 
        }
      });

      // DO NOT release lock - rely on TTL expiry
      console.warn('Job timed out, lock will expire via TTL', {
        jobId: job.id,
        provider: job.provider,
        correlationId: job.correlationId,
      });

      const jobType = job.type;
        const provider = job.provider;
        if (provider && (jobType === SyncJobType.FULL_CATALOG || jobType === SyncJobType.INCREMENTAL_EPISODES)) {
          await this.scheduleNextRecurringRun(provider, jobType);
      }
    }
  }

  private async createSyncJob(input: {
    jobKey: string;
    type: SyncJobType;
    provider?: string;
    correlationId: string;
    idempotencyKey: string;
    retryOf?: string;
    retryCount?: number;
  }): Promise<any> {
    const existing = await this.prisma.syncJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    
    if (existing) {
      if (existing.status === SyncJobStatus.SUCCESS) return existing;
      if (existing.status === SyncJobStatus.RUNNING) return existing;
      if (!input.idempotencyKey.includes('.retry.')) {
        throw new Error(`Job ${input.idempotencyKey} failed. Use retry key for retry.`);
      }
    }
    
    if (input.idempotencyKey.includes('.retry.')) {
      const baseKey = input.idempotencyKey.split('.retry.')[0];
      const baseSuccess = await this.prisma.syncJob.findFirst({
        where: { idempotencyKey: baseKey, status: SyncJobStatus.SUCCESS }
      });
      if (baseSuccess) {
        throw new Error(`Logical window ${baseKey} already completed successfully`);
      }
    }
    
    try {
      return await this.prisma.syncJob.create({
        data: {
          jobKey: input.jobKey,
          type: input.type,
          provider: input.provider,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          retryOf: input.retryOf || (input.idempotencyKey.includes('.retry.') ? input.idempotencyKey.split('.retry.')[0] : null),
          retryCount: input.retryCount ?? 1,
          status: SyncJobStatus.PENDING,
        }
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        return this.prisma.syncJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      }
      throw e;
    }
  }

  private async getOrCreateRunnableJob(input: {
    baseKey: string;
    jobKey: string;
    type: SyncJobType;
    provider: string;
    correlationId: string;
  }): Promise<any | null> {
    
    // 1. Window complete?
    const success = await this.prisma.syncJob.findFirst({
      where: {
        OR: [
          { idempotencyKey: input.baseKey },
          { retryOf: input.baseKey }
        ],
        status: SyncJobStatus.SUCCESS
      }
    });
    if (success) return null;

    // 2. Any attempt RUNNING?
    const running = await this.prisma.syncJob.findFirst({
      where: {
        OR: [
          { idempotencyKey: input.baseKey },
          { retryOf: input.baseKey }
        ],
        status: SyncJobStatus.RUNNING
      }
    });
    if (running) return null;

    // 3. Get latest attempt
    const latest = await this.prisma.syncJob.findFirst({
      where: {
        OR: [
          { idempotencyKey: input.baseKey },
          { retryOf: input.baseKey }
        ]
      },
      orderBy: { retryCount: 'desc' }
    });

    let nextRetryCount: number;
    let nextIdempotencyKey: string;

    if (!latest) {
      // First attempt (base)
      return this.prisma.syncJob.create({
        data: {
          jobKey: input.jobKey,
          type: SyncJobType.FULL_CATALOG,
          provider: input.provider,
          correlationId: input.correlationId,
          idempotencyKey: input.baseKey,
          retryOf: null,
          retryCount: 0,
          status: SyncJobStatus.PENDING,
        }
      });
    }

    if (latest.status === SyncJobStatus.FAILURE || latest.status === SyncJobStatus.PARTIAL) {
      // Retry failed attempt
      const nextCount = latest.retryCount + 1;
      if (nextCount > this.config.maxRetries) return null;
      nextRetryCount = nextCount;
      nextIdempotencyKey = `${input.baseKey}.retry.${nextRetryCount}`;
    } else {
      return null; // SUCCESS or other
    }

    // ATOMIC create
    try {
      return await this.prisma.syncJob.create({
        data: {
          jobKey: input.jobKey,
          type: input.type,
          provider: input.provider,
          correlationId: input.correlationId,
          idempotencyKey: nextIdempotencyKey,
          retryOf: input.baseKey,
          retryCount: nextRetryCount,
          status: SyncJobStatus.PENDING,
        }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.syncJob.findUnique({ where: { idempotencyKey: nextIdempotencyKey } });
      }
      throw e;
    }
  }

  private async updateJobStatus(jobId: string, status: SyncJobStatus, data: { lockToken?: string; error?: string; itemsProcessed?: number } = {}): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: { status, startedAt: new Date(), error: data.error, itemsProcessed: data.itemsProcessed }
    });
  }

  private async finishJob(jobId: string, status: SyncJobStatus, data: { lockToken?: string; provider?: string; error?: string; itemsProcessed?: number; deferred?: number; processed?: number } = {}): Promise<void> {
    const result = await this.prisma.syncJob.updateMany({
      where: { id: jobId, status: SyncJobStatus.RUNNING },
      data: { 
        status, 
        finishedAt: new Date(), 
        error: data.error, 
        itemsProcessed: data.itemsProcessed ?? 0 
      }
    });

    if (result.count === 0) {
      console.warn('Stale worker: job state already changed', { jobId });
      return;
    }

    if (data.lockToken && data.provider) {
      await this.releaseProviderLock(data.provider, data.lockToken);
    }
  }

  async acquireProviderLock(provider: string): Promise<string | null> {
    const token = crypto.randomUUID();
    const key = `sync:lock:${provider}`;
    const ok = await redis.set(key, token, 'EX', 3600, 'NX');
    if (!ok) return null;
    this.lockTokens.set(provider, token);
    return token;
  }

  async renewProviderLock(provider: string): Promise<boolean> {
    const token = this.lockTokens.get(provider);
    if (!token) return false;
    const key = `sync:lock:${provider}`;
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

  async releaseProviderLock(provider: string, token: string): Promise<boolean> {
    const key = `sync:lock:${provider}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redis.eval(script, 1, key, token);
    this.lockTokens.delete(provider);
    return result === 1;
  }

  private async acquireGlobalLock(): Promise<boolean> {
    const result = await redis.set('sync:scheduler:lock', process.pid.toString(), 'EX', 3600, 'NX');
    return result === 'OK';
  }

  private async releaseGlobalLock(): Promise<void> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(script, 1, 'sync:scheduler:lock', process.pid.toString());
  }

  private async saveState(state: any): Promise<void> {
    await redis.set('sync:scheduler:state', JSON.stringify(state));
  }

  private async startLockRenewal(): Promise<void> {
    setInterval(async () => {
      for (const [provider, token] of this.lockTokens) {
        const key = `sync:lock:${provider}`;
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("expire", KEYS[1], ARGV[2])
          else
            return 0
          end
        `;
        await redis.eval(script, 1, key, token, '3600');
      }
    }, 60_000);
  }

  private async scheduleNextRecurringRun(provider: string, type: string): Promise<void> {
    if (type === 'FULL_CATALOG') {
      this.scheduleFullCatalog(provider);
    } else if (type === 'INCREMENTAL_EPISODES') {
      this.scheduleIncremental(provider);
    }
  }

  async getStatus(): Promise<any> {
    return {
      running: this.running,
      activeJobs: this.timers.size,
      lockTokens: this.lockTokens.size,
    };
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatWindowStart(date: Date): string {
  const minutes = Math.floor(date.getMinutes() / 30) * 30;
  const d = new Date(date);
  d.setMinutes(minutes, 0, 0);
  return d.toISOString().replace(/[:.]/g, '-');
}

export async function createSyncScheduler(
  prisma: PrismaClient,
): Promise<SyncScheduler> {
  return new SyncScheduler(prisma);
}


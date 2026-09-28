import { PrismaClient, ScanJobStatus } from '@prisma/client';
import { ProviderDiscovery } from './ProviderDiscovery';
import { getSchedulerConfig, getProviderConfig } from '../../config/discovery';
import { redis } from '../../config/redis';
import { schedulerLogger } from '../../utils/logger';

const SCHEDULER_LOCK_KEY = 'discovery:scheduler:lock';
const SCHEDULER_STATE_KEY = 'discovery:scheduler:state';

export interface SchedulerState {
  running: boolean;
  lastRun?: Date;
  nextRun?: Date;
  currentJob?: string;
}

export class DiscoveryScheduler {
  private prisma: PrismaClient;
  private discovery: ProviderDiscovery;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running = false;
  private globalLockAcquired = false;

  constructor(prisma: PrismaClient, discovery: ProviderDiscovery) {
    this.prisma = prisma;
    this.discovery = discovery;
  }

  async start(): Promise<void> {
    if (this.running) return;

    const acquired = await this.acquireGlobalLock();
    if (!acquired) {
      schedulerLogger.warn('Another scheduler instance is running');
      return;
    }

    this.globalLockAcquired = true;
    this.running = true;
    await this.saveState({ running: true, lastRun: new Date() });

    schedulerLogger.info('Starting discovery scheduler');
    this.scheduleAllProviders();
    this.scheduleHealthChecks();
    this.schedulePruning();
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    
    for (const [key, timer] of this.timers) {
      clearTimeout(timer);
      schedulerLogger.debug('Cleared timer', { timer: key });
    }
    this.timers.clear();

    if (this.globalLockAcquired) {
      await this.releaseGlobalLock();
      this.globalLockAcquired = false;
    }

    await this.saveState({ running: false });
    schedulerLogger.info('Stopped');
  }

  private scheduleAllProviders(): void {
    const providerConfigs = {
      consumet: getProviderConfig('consumet'),
      anivexa: getProviderConfig('anivexa'),
    };

    for (const [providerId, config] of Object.entries(providerConfigs)) {
      if (!config.enabled) {
        schedulerLogger.info('Provider disabled, skipping', { provider: providerId });
        continue;
      }

      const intervalMs = config.scanIntervalMinutes * 60 * 1000;
      this.scheduleProvider(providerId, intervalMs);
    }
  }

  private scheduleProvider(providerId: string, intervalMs: number): void {
    const run = async () => {
      if (!this.running) return;

      const lockKey = `discovery:lock:${providerId}`;
      const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX');
      if (!acquired) {
        schedulerLogger.warn('Could not acquire lock, skipping', { provider: providerId });
        this.scheduleNextRun(providerId, intervalMs);
        return;
      }

      try {
        await this.saveState({ 
          running: true, 
          lastRun: new Date(), 
          currentJob: providerId 
        });

        schedulerLogger.info('Running discovery', { provider: providerId });
        await this.discovery.scanProvider(providerId);
        
        await this.saveState({ 
          running: true, 
          lastRun: new Date(), 
          currentJob: undefined 
        });
      } catch (error) {
        schedulerLogger.error('Discovery failed', { provider: providerId, error });
      } finally {
        await redis.del(lockKey);
        this.scheduleNextRun(providerId, intervalMs);
      }
    };

    const timer = setTimeout(run, 1000);
    this.timers.set(providerId, timer);
  }

  private scheduleNextRun(providerId: string, intervalMs: number): void {
    if (!this.running) return;

    const nextRun = new Date(Date.now() + intervalMs);
    const timer = setTimeout(() => {
      this.scheduleProvider(providerId, intervalMs);
    }, intervalMs);
    
    this.timers.set(providerId, timer);
    this.saveState({ nextRun });
  }

  private scheduleHealthChecks(): void {
    const intervalMs = getSchedulerConfig().healthCheckIntervalMinutes * 60 * 1000;

    const run = async () => {
      if (!this.running) return;

      try {
        const providerIds = Array.from(this.discovery['adapters'].keys());
        for (const providerId of providerIds) {
          await this.discovery.getProviderHealth(providerId);
        }
      } catch (error) {
        schedulerLogger.error('Health check failed', { error });
      }

      if (this.running) {
        const timer = setTimeout(run, intervalMs);
        this.timers.set('healthcheck', timer);
      }
    };

    const timer = setTimeout(run, intervalMs);
    this.timers.set('healthcheck', timer);
  }

  private schedulePruning(): void {
    const intervalMs = 24 * 60 * 60 * 1000; // Daily

    const run = async () => {
      if (!this.running) return;

      try {
        await this.pruneOldScanJobs();
      } catch (error) {
        schedulerLogger.error('Pruning failed', { error });
      }

      if (this.running) {
        const timer = setTimeout(run, intervalMs);
        this.timers.set('pruning', timer);
      }
    };

    const timer = setTimeout(run, intervalMs);
    this.timers.set('pruning', timer);
  }

  private async pruneOldScanJobs(): Promise<void> {
    const config = getSchedulerConfig();
    const cutoffDate = new Date(Date.now() - config.jobPruneDays * 24 * 60 * 60 * 1000);

    const staleJobs = await this.prisma.scanJob.findMany({
      where: {
        startedAt: { lt: cutoffDate },
        status: { in: [ScanJobStatus.SUCCESS, ScanJobStatus.FAILURE, ScanJobStatus.PARTIAL] },
      },
      orderBy: { startedAt: 'desc' },
      skip: config.maxRunsPerJob,
      select: { id: true },
    });

    if (staleJobs.length > 0) {
      await this.prisma.scanJob.deleteMany({
        where: { id: { in: staleJobs.map((j) => j.id) } },
      });
      schedulerLogger.info('Pruned old scan jobs', { count: staleJobs.length });
    }
  }

  private async acquireGlobalLock(): Promise<boolean> {
    const result = await redis.set(SCHEDULER_LOCK_KEY, process.pid.toString(), 'EX', 3600, 'NX');
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
    await redis.eval(script, 1, SCHEDULER_LOCK_KEY, process.pid.toString());
  }

  private async saveState(state: Partial<SchedulerState>): Promise<void> {
    const current = await this.getState();
    const updated = { ...current, ...state };
    await redis.set(SCHEDULER_STATE_KEY, JSON.stringify(updated));
  }

  private async getState(): Promise<SchedulerState> {
    const data = await redis.get(SCHEDULER_STATE_KEY);
    if (!data) return { running: false };
    return JSON.parse(data);
  }

  async getStatus(): Promise<SchedulerState & { timers: string[] }> {
    const state = await this.getState();
    return {
      ...state,
      timers: Array.from(this.timers.keys()),
    };
  }
}

export async function createDiscoveryScheduler(
  prisma: PrismaClient,
  discovery: ProviderDiscovery
): Promise<DiscoveryScheduler> {
  return new DiscoveryScheduler(prisma, discovery);
}
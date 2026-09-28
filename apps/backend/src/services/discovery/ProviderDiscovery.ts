import { PrismaClient, ReleaseLifecycleState, ScanJobStatus, DiscoveredRelease, ScanJob, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ConsumetDiscoveryAdapter } from './adapters/ConsumetDiscoveryAdapter';
import { AnivexaDiscoveryAdapter } from './adapters/AnivexaDiscoveryAdapter';
import { ConsumetAnimeDiscoveryAdapter } from './adapters/ConsumetDiscoveryAdapter';
import { AnivexaAnimeDiscoveryAdapter } from './adapters/AnivexaDiscoveryAdapter';
import { AnikotoDiscoveryAdapter } from './adapters/AnikotoDiscoveryAdapter';
import { AnikotoAnimeDiscoveryAdapter } from './adapters/AnikotoAnimeDiscoveryAdapter';
import {
  DiscoveryAdapter,
  DiscoveredReleaseInput,
  DiscoveredReleaseUpsertResult,
  ScanJobInput,
  ScanJobRecord,
  UpsertResultSummary,
  ProviderHealthStatus,
  DiscoveryOrchestrator,
  buildDiscoveryKey,
} from '../../types/discovery';
import { getProviderConfig, getSchedulerConfig } from '../../config/discovery';
import { redis, STREAM, EventType, appendEvent } from '../../config/redis';
import { discoveryLogger, generateCorrelationId } from '../../utils/logger';
import { wrapWithHealthMonitor } from './HealthMonitor';

const DISCOVERY_REDIS_PREFIX = 'discovery:';
const PROVIDER_LOCK_PREFIX = 'discovery:lock:';
const SCAN_JOB_PREFIX = 'discovery:job:';
const HEALTH_PREFIX = 'discovery:health:';

export class ProviderDiscovery implements DiscoveryOrchestrator {
  private prisma: PrismaClient;
  private adapters: Map<string, DiscoveryAdapter[]> = new Map();
  private globalSemaphore: Semaphore;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.globalSemaphore = new Semaphore(getSchedulerConfig().globalConcurrencyLimit);
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    const consumetConfig = getProviderConfig('consumet');
    const anivexaConfig = getProviderConfig('anivexa');

    if (consumetConfig.enabled) {
      this.adapters.set('consumet', [
        new ConsumetDiscoveryAdapter(consumetConfig),
        new ConsumetAnimeDiscoveryAdapter(consumetConfig),
      ]);
    }

    if (anivexaConfig.enabled) {
      this.adapters.set('anivexa', [
        new AnivexaDiscoveryAdapter(anivexaConfig),
        new AnivexaAnimeDiscoveryAdapter(anivexaConfig),
      ]);
    }

    const anikotoConfig = getProviderConfig('anikoto');

    if (anikotoConfig.enabled) {
      this.adapters.set('anikoto', [
        new AnikotoDiscoveryAdapter(anikotoConfig),
        new AnikotoAnimeDiscoveryAdapter(anikotoConfig),
      ]);
    }
  }

  async scanAllProviders(correlationId?: string): Promise<ScanJobRecord[]> {
    const cid = correlationId || generateCorrelationId();
    const logger = discoveryLogger.withCorrelationId(cid);
    const jobs: ScanJobRecord[] = [];
    const providerIds = Array.from(this.adapters.keys());

    logger.info('Starting scan for all providers', { providerCount: providerIds.length });

    for (const providerId of providerIds) {
      const job = await this.scanProvider(providerId, cid);
      jobs.push(job);
    }

    logger.info('Completed scan for all providers', { jobsCount: jobs.length });
    return jobs;
  }

  async scanProvider(providerId: string, correlationId?: string): Promise<ScanJobRecord> {
    const cid = correlationId || generateCorrelationId();
    const logger = discoveryLogger.withCorrelationId(cid).child({ provider: providerId });
    const adapters = this.adapters.get(providerId);
    
    if (!adapters || adapters.length === 0) {
      throw new Error(`No adapters found for provider: ${providerId}`);
    }

    const jobInput: ScanJobInput = {
      jobKey: `discovery.${providerId}`,
      provider: providerId,
      correlationId: cid,
    };

    const jobRecord = await this.createScanJob(jobInput);
    logger.info('Scan job created', { jobId: jobRecord.id, jobKey: jobRecord.jobKey });

    try {
      await this.updateScanJob(jobRecord.id, { status: ScanJobStatus.RUNNING });

      let totalFound = 0;
      let totalNew = 0;
      let totalUpdated = 0;

      for (const adapter of adapters) {
        logger.debug('Discovering releases', { adapter: adapter.providerName });
        const releases = await wrapWithHealthMonitor(providerId, () => adapter.discover());
        totalFound += releases.length;

        const upsertResult = await this.upsertReleases(releases, jobRecord.id);
        totalNew += upsertResult.inserted;
        totalUpdated += upsertResult.updated;
      }

      await this.updateScanJob(jobRecord.id, {
        status: ScanJobStatus.SUCCESS,
        finishedAt: new Date(),
        releasesFound: totalFound,
        releasesNew: totalNew,
        releasesUpdated: totalUpdated,
      });

      await this.pingHealthcheck(jobRecord.jobKey, true);

      logger.info('Scan completed successfully', { 
        releasesFound: totalFound, 
        releasesNew: totalNew, 
        releasesUpdated: totalUpdated 
      });

      const job = await this.getScanJob(jobRecord.id);
      if (!job) throw new Error('Scan job not found after creation');
      return this.toScanJobRecord(job);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      await this.updateScanJob(jobRecord.id, {
        status: ScanJobStatus.FAILURE,
        finishedAt: new Date(),
        error: errorMessage,
      });

      await this.pingHealthcheck(jobRecord.jobKey, false);

      logger.error('Scan failed', { error: errorMessage });
      throw error;
    }
  }

  async upsertReleases(
    releases: DiscoveredReleaseInput[],
    scanJobId: string
  ): Promise<UpsertResultSummary> {
    const summary: UpsertResultSummary = {
      totalProcessed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    };

    const batchSize = getSchedulerConfig().maxRunsPerJob;

    for (let i = 0; i < releases.length; i += batchSize) {
      const batch = releases.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((release) => this.upsertSingleRelease(release, scanJobId))
      );

      for (const result of results) {
        summary.totalProcessed++;
        if (result.status === 'fulfilled') {
          switch (result.value.action) {
            case 'INSERT':
              summary.inserted++;
              break;
            case 'UPDATE':
              summary.updated++;
              break;
            case 'SKIP':
              summary.skipped++;
              break;
          }
        } else {
          summary.errors++;
          discoveryLogger.error('Upsert error', { error: result.reason });
        }
      }
    }

    return summary;
  }

  private toPrismaJson(rawData?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
    return rawData as Prisma.InputJsonValue | undefined;
  }

  private async upsertSingleRelease(
    input: DiscoveredReleaseInput,
    scanJobId: string
  ): Promise<DiscoveredReleaseUpsertResult> {
    const key = buildDiscoveryKey(input.provider, input.providerAnimeId, input.providerEpisodeId);

    const createData = {
      provider: input.provider,
      providerAnimeId: input.providerAnimeId,
      providerEpisodeId: input.providerEpisodeId,
      episodeNumber: input.episodeNumber,
      episodeTitle: input.episodeTitle,
      airDate: input.airDate ? new Date(input.airDate) : null,
      isFiller: input.isFiller ?? false,
      isRecap: input.isRecap ?? false,
      rawData: this.toPrismaJson(input.rawData),
      lifecycleState: ReleaseLifecycleState.DISCOVERED,
      scanJobId,
    };

    const updateData = {
      episodeTitle: input.episodeTitle,
      airDate: input.airDate ? new Date(input.airDate) : null,
      isFiller: input.isFiller ?? false,
      isRecap: input.isRecap ?? false,
      rawData: this.toPrismaJson(input.rawData),
      lastSeenAt: new Date(),
      scanJobId,
    };

    try {
      const existing = await this.prisma.discoveredRelease.findFirst({
        where: {
          provider: input.provider,
          providerAnimeId: input.providerAnimeId,
          providerEpisodeId: input.providerEpisodeId,
        },
      });

      if (existing) {
        const updated = await this.prisma.discoveredRelease.update({
          where: { id: existing.id },
          data: updateData,
        });

        const changed = this.hasChanged(existing, input);
        return { action: 'UPDATE', release: this.toDiscoveredRelease(updated), changed };
      }

      const created = await this.prisma.discoveredRelease.create({
        data: createData,
      });

      // Publish Redis Stream event after PostgreSQL CREATE succeeds.
      // Never publish before PostgreSQL persistence succeeds.
      const airDateStr =
        input.airDate instanceof Date
          ? input.airDate.toISOString()
          : input.airDate?.toString() ?? undefined;

      try {
        await appendEvent('discoveredReleases', {
          event: EventType.ReleaseDiscovered,
          provider: input.provider,
          providerAnimeId: input.providerAnimeId,
          providerEpisodeId: input.providerEpisodeId,
          episodeNumber: input.episodeNumber,
          episodeTitle: input.episodeTitle,
          airDate: airDateStr,
          isFiller: input.isFiller ?? false,
          isRecap: input.isRecap ?? false,
        });
      } catch (publishError: any) {
        // PostgreSQL create already succeeded; the record is authoritative.
        // Log and swallow — do not throw, do not invent an outbox/retry system.
        discoveryLogger.error(
          'Redis Stream event publication failed after PostgreSQL CREATE',
          {
            provider: input.provider,
            providerAnimeId: input.providerAnimeId,
            providerEpisodeId: input.providerEpisodeId,
            error:
              publishError instanceof Error
                ? publishError.message
                : String(publishError),
          }
        );
        // Preserve the persisted PostgreSQL record; return normally.
      }

      return { action: 'INSERT', release: this.toDiscoveredRelease(created) };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        const existing = await this.prisma.discoveredRelease.findFirst({
          where: {
            provider: input.provider,
            providerAnimeId: input.providerAnimeId,
            providerEpisodeId: input.providerEpisodeId,
          },
        });
        if (existing) {
          return { action: 'SKIP', release: this.toDiscoveredRelease(existing), reason: 'Race condition - already exists' };
        }
      }
      throw error;
    }
  }

  private hasChanged(existing: DiscoveredRelease, input: DiscoveredReleaseInput): boolean {
    return (
      existing.episodeTitle !== input.episodeTitle ||
      existing.airDate?.getTime() !== (input.airDate ? new Date(input.airDate).getTime() : null) ||
      existing.isFiller !== input.isFiller ||
      existing.isRecap !== input.isRecap ||
      JSON.stringify(existing.rawData) !== JSON.stringify(input.rawData)
    );
  }

  private toDiscoveredRelease(r: DiscoveredRelease): DiscoveredReleaseInput & { id: string; lifecycleState: ReleaseLifecycleState; firstSeenAt: Date; lastSeenAt: Date; scanJobId?: string } {
    return {
      id: r.id,
      provider: r.provider,
      providerAnimeId: r.providerAnimeId,
      providerEpisodeId: r.providerEpisodeId,
      episodeNumber: r.episodeNumber,
      episodeTitle: r.episodeTitle ?? undefined,
      airDate: r.airDate ?? undefined,
      isFiller: r.isFiller,
      isRecap: r.isRecap,
      rawData: r.rawData as Record<string, unknown> | undefined,
      lifecycleState: r.lifecycleState,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      scanJobId: r.scanJobId ?? undefined,
    };
  }

  async getScanHistory(providerId?: string, limit = 50): Promise<ScanJobRecord[]> {
    const jobs = await this.prisma.scanJob.findMany({
      where: providerId ? { provider: providerId } : {},
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return jobs.map(this.toScanJobRecord);
  }

  async getProviderHealth(providerId: string): Promise<ProviderHealthStatus> {
    const cached = await redis.get(`${HEALTH_PREFIX}${providerId}`);
    if (cached) {
      return JSON.parse(cached) as ProviderHealthStatus;
    }

    const adapter = this.adapters.get(providerId)?.[0];
    const healthy = adapter ? await adapter.healthCheck() : false;

    const health: ProviderHealthStatus = {
      providerId,
      healthy,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      circuitOpen: false,
      errorRate: 0,
    };

    await redis.setex(`${HEALTH_PREFIX}${providerId}`, 60, JSON.stringify(health));
    return health;
  }

  private async createScanJob(input: ScanJobInput): Promise<ScanJob> {
    return this.prisma.scanJob.create({
      data: {
        jobKey: input.jobKey,
        provider: input.provider,
        correlationId: input.correlationId,
        status: ScanJobStatus.PENDING,
      },
    });
  }

  private async updateScanJob(
    id: string,
    data: Partial<Pick<ScanJob, 'status' | 'finishedAt' | 'releasesFound' | 'releasesNew' | 'releasesUpdated' | 'error'>>
  ): Promise<void> {
    await this.prisma.scanJob.update({
      where: { id },
      data,
    });
  }

  private async getScanJob(id: string): Promise<ScanJob | null> {
    return this.prisma.scanJob.findUnique({ where: { id } });
  }

  private toScanJobRecord(job: ScanJob): ScanJobRecord {
    return {
      id: job.id,
      jobKey: job.jobKey,
      provider: job.provider ?? undefined,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt ?? undefined,
      releasesFound: job.releasesFound,
      releasesNew: job.releasesNew,
      releasesUpdated: job.releasesUpdated,
      error: job.error ?? undefined,
      correlationId: job.correlationId,
    };
  }

  private async pingHealthcheck(jobKey: string, success: boolean): Promise<void> {
    const config = getSchedulerConfig();
    if (!config.healthchecksIoEnabled) return;

    const envVar = `HEALTHCHECKS_${jobKey.toUpperCase().replace(/\./g, '_')}_URL`;
    const url = process.env[envVar];
    if (!url) return;

    try {
      await fetch(success ? url : `${url}/fail`);
    } catch {
      // Best effort
    }
  }
}

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(max: number) {
    this.permits = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits += 1;
  }
}

export async function createProviderDiscovery(prisma: PrismaClient): Promise<ProviderDiscovery> {
  return new ProviderDiscovery(prisma);
}
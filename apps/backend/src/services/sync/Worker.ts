import 'dotenv/config';

import {
  PrismaClient,
  SyncJobStatus,
  SyncJobType,
} from '@prisma/client';

import { SyncOrchestrator } from './SyncOrchestrator';
import {
  acquireLock,
  releaseLock,
  renewLock,
  LOCK_TTL_SECONDS,
} from './locks';

const POLL_INTERVAL_MS = 30_000;
const ERROR_RETRY_INTERVAL_MS = 5_000;
const LOCK_RENEWAL_INTERVAL_MS = Math.floor(
  (LOCK_TTL_SECONDS * 1000) / 2,
);

interface WorkerJob {
  id: string;
  type: SyncJobType;
  provider: string | null;
}

export class SyncWorker {
  private readonly prisma: PrismaClient;
  private readonly orchestrator: SyncOrchestrator;

  private running = false;
  private activeJobPromise: Promise<void> | null = null;

  constructor(
    prisma: PrismaClient,
    orchestrator: SyncOrchestrator,
  ) {
    this.prisma = prisma;
    this.orchestrator = orchestrator;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    console.log('SyncWorker started');

    await this.workerLoop();
  }

  async stop(): Promise<void> {
    if (!this.running && !this.activeJobPromise) {
      return;
    }

    console.log(
      'SyncWorker stopping — no new jobs will be claimed',
    );

    this.running = false;

    if (this.activeJobPromise) {
      console.log(
        'SyncWorker waiting for active job to finish...',
      );

      await this.activeJobPromise;
    }

    console.log('SyncWorker stopped');
  }

  private async workerLoop(): Promise<void> {
    while (this.running) {
      try {
        const job = await this.claimNextJob();

        if (!job) {
          await this.sleep(POLL_INTERVAL_MS);
          continue;
        }

        const execution = this.processJob(job);

        this.activeJobPromise = execution;

        try {
          await execution;
        } finally {
          this.activeJobPromise = null;
        }
      } catch (error) {
        console.error('Worker loop error:', error);

        if (this.running) {
          await this.sleep(ERROR_RETRY_INTERVAL_MS);
        }
      }
    }
  }

  private async claimNextJob(): Promise<WorkerJob | null> {
    if (!this.running) {
      return null;
    }

    const job = await this.prisma.syncJob.findFirst({
      where: {
        status: SyncJobStatus.PENDING,
      },
      orderBy: {
        id: 'asc',
      },
    });

    if (!job) {
      return null;
    }

    const claimed = await this.prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.PENDING,
      },
      data: {
        status: SyncJobStatus.RUNNING,
        startedAt: new Date(),
        finishedAt: null,
        error: null,
      },
    });

    if (claimed.count !== 1) {
      return null;
    }

    return {
      id: job.id,
      type: job.type,
      provider: job.provider,
    };
  }

  private async processJob(job: WorkerJob): Promise<void> {
    if (!job.provider || job.provider.trim().length === 0) {
      await this.failRunningJob(
        job.id,
        'SyncJob has no provider configured',
      );

      return;
    }

    const provider = job.provider;
    const lockKey = `sync:lock:${provider}`;

    const lockToken = await acquireLock(lockKey);

    if (!lockToken) {
      /*
       * The job has already been atomically claimed as RUNNING.
       *
       * Do NOT move it back to PENDING.
       * The watchdog is responsible for recovering stale
       * RUNNING jobs.
       */
      console.warn(
        `Worker could not acquire provider lock for ${provider}; ` +
        `job ${job.id} remains RUNNING for watchdog recovery`,
      );

      return;
    }

    let renewalInterval: ReturnType<typeof setInterval> | null = null;
    let renewalInProgress = false;
    let lockLost = false;

    try {
      renewalInterval = setInterval(() => {
        if (renewalInProgress || lockLost) {
          return;
        }

        renewalInProgress = true;

        void this.renewProviderLock(
          lockKey,
          lockToken,
          job.id,
        )
          .then((renewed) => {
            if (!renewed) {
              lockLost = true;

              if (renewalInterval) {
                clearInterval(renewalInterval);
                renewalInterval = null;
              }
            }
          })
          .finally(() => {
            renewalInProgress = false;
          });
      }, LOCK_RENEWAL_INTERVAL_MS);

      let success = false;
      let error: string | undefined;

      try {
        switch (job.type) {
          case SyncJobType.FULL_CATALOG:
            await this.orchestrator.runFullCatalogSync(provider);
            success = true;
            break;

          case SyncJobType.INCREMENTAL_EPISODES:
            await this.orchestrator.processNewReleases(provider);
            success = true;
            break;

          default:
            success = false;
            error =
              `Unsupported SyncJob type: ${String(job.type)}`;
            break;
        }
      } catch (executionError) {
        success = false;

        error =
          executionError instanceof Error
            ? executionError.message
            : String(executionError);
      }

      if (renewalInterval) {
        clearInterval(renewalInterval);
        renewalInterval = null;
      }

      /*
       * Prevent the finalization race where a renewal is still
       * executing while the Worker finalizes the job.
       */
      while (renewalInProgress) {
        await this.sleep(50);
      }

      if (lockLost) {
        success = false;

        error = error
          ? `${error} (also: provider lock was lost mid-run)`
          : 'Provider lock was lost mid-run; result cannot be trusted';
      }

      /*
       * Atomic finalization:
       *
       * The Worker may finalize the job only if it is still RUNNING.
       * This prevents overwriting a state written by another process,
       * such as the watchdog.
       */
      const finalized = await this.prisma.syncJob.updateMany({
        where: {
          id: job.id,
          status: SyncJobStatus.RUNNING,
        },
        data: {
          status: success
            ? SyncJobStatus.SUCCESS
            : SyncJobStatus.FAILURE,
          finishedAt: new Date(),
          error: error ?? null,
        },
      });

      if (finalized.count === 0) {
        console.warn(
          `Worker could not finalize job ${job.id}; ` +
          'the job may already have been finalized by another process',
        );
      } else {
        console.log(
          `Worker job ${job.id}: ` +
          `${success ? 'SUCCESS' : 'FAILURE'}` +
          `${error ? ` (${error.substring(0, 80)})` : ''}`,
        );
      }
    } catch (unexpectedError) {
      const message =
        unexpectedError instanceof Error
          ? unexpectedError.message
          : String(unexpectedError);

      console.error(
        `Unexpected Worker error for job ${job.id}:`,
        unexpectedError,
      );

      if (renewalInterval) {
        clearInterval(renewalInterval);
        renewalInterval = null;
      }

      while (renewalInProgress) {
        await this.sleep(50);
      }

      await this.failRunningJob(
        job.id,
        message,
      );
    } finally {
      if (renewalInterval) {
        clearInterval(renewalInterval);
      }

      /*
       * releaseLock() verifies the UUID token before deleting
       * the Redis key, so this Worker cannot release another
       * process's provider lock.
       */
      try {
        await releaseLock(
          lockKey,
          lockToken,
        );
      } catch (releaseError) {
        console.error(
          `Failed to release provider lock ${lockKey}:`,
          releaseError,
        );
      }
    }
  }

  private async failRunningJob(
    jobId: string,
    error: string,
  ): Promise<void> {
    const finalized = await this.prisma.syncJob.updateMany({
      where: {
        id: jobId,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.FAILURE,
        finishedAt: new Date(),
        error,
      },
    });

    if (finalized.count === 0) {
      console.warn(
        `failRunningJob: could not finalize job ${jobId} ` +
        'as FAILURE; it may already have been finalized by another process',
      );
    }
  }

  private async renewProviderLock(
    lockKey: string,
    lockToken: string,
    jobId: string,
  ): Promise<boolean> {
    try {
      const renewed = await renewLock(
        lockKey,
        lockToken,
      );

      if (!renewed) {
        console.error(
          `Worker lost provider lock for job ${jobId}: ${lockKey}`,
        );
      }

      return renewed;
    } catch (error) {
      console.error(
        `Provider lock renewal failed for job ${jobId}:`,
        error,
      );

      return false;
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export function createSyncWorker(
  prisma: PrismaClient,
  orchestrator: SyncOrchestrator,
): SyncWorker {
  return new SyncWorker(
    prisma,
    orchestrator,
  );
}

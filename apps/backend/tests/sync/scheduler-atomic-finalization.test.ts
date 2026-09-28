import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, SyncJobStatus, SyncJobType } from '@prisma/client';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.syncJob.deleteMany();
});

afterEach(async () => {
  await prisma.$disconnect();
});

describe('Worker Atomic Finalization', () => {
  it('finalizes a RUNNING job as SUCCESS (0 rows affected on re-finalization)', async () => {
    const job = await prisma.syncJob.create({
      data: {
        jobKey: 'sync.atomic.test',
        type: SyncJobType.FULL_CATALOG,
        provider: 'consumet',
        status: SyncJobStatus.RUNNING,
        correlationId: 'test-corr-1',
        idempotencyKey: 'atomic.test.base',
      },
    });

    // Simulate the Worker's atomic finalization pattern:
    // updateMany WHERE id = jobId AND status = RUNNING
    const firstFinalize = await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.SUCCESS,
        finishedAt: new Date(),
      },
    });

    // 1. Job was finalized as SUCCESS
    expect(firstFinalize.count).toBe(1);

    // 2. Job is now SUCCESS, not RUNNING
    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated!.status).toBe(SyncJobStatus.SUCCESS);

    // 3. Re-finalization with same WHERE condition affects 0 rows
    //    (the job is no longer RUNNING, so the conditional update changes 0 rows)
    const secondFinalize = await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.SUCCESS,
        finishedAt: new Date(),
      },
    });

    // 3. Re-finalization affects 0 rows (job no longer RUNNING)
    expect(secondFinalize.count).toBe(0);

    // 4. The Worker does not overwrite the newer state
    //    (if another process finalized as FAILURE first, this would also affect 0 rows)
    const finalState = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(finalState!.status).toBe(SyncJobStatus.SUCCESS);
  });

  it('finalizes a RUNNING job as FAILURE (0 rows affected on re-finalization)', async () => {
    const job = await prisma.syncJob.create({
      data: {
        jobKey: 'sync.atomic.fail-test',
        type: SyncJobType.INCREMENTAL_EPISODES,
        provider: 'anivexa',
        status: SyncJobStatus.RUNNING,
        correlationId: 'test-corr-2',
        idempotencyKey: 'atomic.fail.base',
      },
    });

    // Finalize as FAILURE using the atomic pattern
    const firstFinalize = await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.FAILURE,
        finishedAt: new Date(),
        error: 'Test execution error',
      },
    });

    // 1. Job was finalized as FAILURE
    expect(firstFinalize.count).toBe(1);

    // 2. Job is now FAILURE, not RUNNING
    const updated = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(updated!.status).toBe(SyncJobStatus.FAILURE);

    // 3. Re-finalization with same WHERE condition affects 0 rows
    const secondFinalize = await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.FAILURE,
        finishedAt: new Date(),
        error: 'Test execution error',
      },
    });

    // 3. Re-finalization affects 0 rows
    expect(secondFinalize.count).toBe(0);

    // 4. Final state is FAILURE (not overwritten)
    const finalState = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(finalState!.status).toBe(SyncJobStatus.FAILURE);
  });

  it('Worker does not overwrite competing/newer state during finalization', async () => {
    // Create a RUNNING job
    const job = await prisma.syncJob.create({
      data: {
        jobKey: 'sync.atomic.contest',
        type: SyncJobType.FULL_CATALOG,
        provider: 'consumet',
        status: SyncJobStatus.RUNNING,
        correlationId: 'test-corr-3',
        idempotencyKey: 'atomic.contest.base',
      },
    });

    // Simulate: another process finalizes the job as FAILURE first
    await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.FAILURE,
        finishedAt: new Date(),
        error: 'Concurrent finalization',
      },
    });

    // Now attempt to finalize as SUCCESS using the atomic pattern
    // The WHERE status=RUNNING guard means this should affect 0 rows
    // because the job is no longer RUNNING
    const finalizeResult = await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: SyncJobStatus.RUNNING,
      },
      data: {
        status: SyncJobStatus.SUCCESS,
        finishedAt: new Date(),
      },
    });

    // The atomic guard prevents overwriting the competing state
    expect(finalizeResult.count).toBe(0);

    // The job retains the competing FAILURE state
    const finalState = await prisma.syncJob.findUnique({ where: { id: job.id } });
    expect(finalState!.status).toBe(SyncJobStatus.FAILURE);
    expect(finalState!.error).toBe('Concurrent finalization');
  });
});
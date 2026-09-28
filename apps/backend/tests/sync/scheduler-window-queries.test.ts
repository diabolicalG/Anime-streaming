import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Logical Window Queries', () => {
  beforeEach(async () => {
    await prisma.syncJob.deleteMany();
  });

  it('SUCCESS on base attempt → window complete', async () => {
    await prisma.syncJob.create({
      data: { 
        idempotencyKey: 'base', 
        status: 'SUCCESS',
        jobKey: 'sync.full.test',
        type: 'FULL_CATALOG',
        correlationId: 'test-1',
      }
    });
    const done = await isWindowComplete('base');
    expect(done).toBe(true);
  });

  it('SUCCESS on retry.1 → window complete', async () => {
    await prisma.syncJob.create({
      data: { 
        idempotencyKey: 'base.retry.1', 
        retryOf: 'base', 
        status: 'SUCCESS',
        jobKey: 'sync.full.test',
        type: 'FULL_CATALOG',
        correlationId: 'test-1',
      }
    });
    const done = await isWindowComplete('base');
    expect(done).toBe(true);
  });

  it('RUNNING on retry.2 → window busy', async () => {
    await prisma.syncJob.create({
      data: { 
        idempotencyKey: 'base.retry.2', 
        retryOf: 'base', 
        status: 'RUNNING',
        jobKey: 'sync.full.test',
        type: 'FULL_CATALOG',
        correlationId: 'test-1',
      }
    });
    const busy = await isWindowRunning('base');
    expect(busy).toBe(true);
  });

  it('latest attempt sees base + retries', async () => {
    await prisma.syncJob.createMany({
      data: [
        { idempotencyKey: 'base', retryCount: 0, retryOf: null, status: 'FAILURE', jobKey: 'sync.full.test', type: 'FULL_CATALOG', correlationId: 'c1' },
        { idempotencyKey: 'base.retry.1', retryCount: 1, retryOf: 'base', status: 'FAILURE', jobKey: 'sync.full.test', type: 'FULL_CATALOG', correlationId: 'c2' },
        { idempotencyKey: 'base.retry.2', retryCount: 2, retryOf: 'base', status: 'RUNNING', jobKey: 'sync.full.test', type: 'FULL_CATALOG', correlationId: 'c3' },
      ]
    });
    const latest = await getLatestAttempt('base');
    expect(latest!.retryCount).toBe(2);
  });

  it('retries exhausted after retry.3 fails', async () => {
    await prisma.syncJob.create({
      data: { idempotencyKey: 'base.retry.3', retryOf: 'base', retryCount: 3, status: 'FAILURE', jobKey: 'sync.full.test', type: 'FULL_CATALOG', correlationId: 'c1' }
    });
    const exhausted = await areRetriesExhausted('base', 3);
    expect(exhausted).toBe(true);
  });
});

async function isWindowComplete(baseKey: string): Promise<boolean> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const success = await prisma.syncJob.findFirst({
      where: {
        OR: [
          { idempotencyKey: baseKey },
          { retryOf: baseKey }
        ],
        status: 'SUCCESS'
      }
    });
    return !!success;
  } finally {
    await prisma.$disconnect();
  }
}

async function isWindowRunning(baseKey: string): Promise<boolean> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const running = await prisma.syncJob.findFirst({
      where: {
        OR: [
          { idempotencyKey: baseKey },
          { retryOf: baseKey }
        ],
        status: 'RUNNING'
      }
    });
    return !!running;
  } finally {
    await prisma.$disconnect();
  }
}

async function getLatestAttempt(baseKey: string) {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    return prisma.syncJob.findFirst({
      where: {
        OR: [
          { idempotencyKey: baseKey },
          { retryOf: baseKey }
        ]
      },
      orderBy: { retryCount: 'desc' }
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function areRetriesExhausted(baseKey: string, maxRetries: number): Promise<boolean> {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const attempts = await prisma.syncJob.findMany({
      where: { retryOf: baseKey },
      orderBy: { retryCount: 'desc' }
    });
    return attempts.length > 0 && attempts[0].retryCount >= 3;
  } finally {
    await prisma.$disconnect();
  }
}
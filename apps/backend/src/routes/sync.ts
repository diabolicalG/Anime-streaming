import { Router } from 'express';
import { Prisma, PrismaClient, SyncJobStatus, SyncJobType } from '@prisma/client';

const prisma = new PrismaClient();

const router = Router();

async function enqueueJob(
  type: SyncJobType,
  provider: string,
  idempotencyKey: string,
) {
  const existing = await prisma.syncJob.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    return existing;
  }

  try {
    return await prisma.syncJob.create({
      data: {
        jobKey:
          type === SyncJobType.FULL_CATALOG
            ? `sync.full.${provider}`
            : `sync.incremental.${provider}`,
        type,
        provider,
        correlationId: crypto.randomUUID(),
        idempotencyKey,
        status: SyncJobStatus.PENDING,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return prisma.syncJob.findUnique({
        where: { idempotencyKey },
      });
    }

    throw error;
  }
}

router.get('/status', async (_req, res) => {
  try {
    const [pending, running, success, failure, partial] =
      await Promise.all([
        prisma.syncJob.count({
          where: { status: SyncJobStatus.PENDING },
        }),
        prisma.syncJob.count({
          where: { status: SyncJobStatus.RUNNING },
        }),
        prisma.syncJob.count({
          where: { status: SyncJobStatus.SUCCESS },
        }),
        prisma.syncJob.count({
          where: { status: SyncJobStatus.FAILURE },
        }),
        prisma.syncJob.count({
          where: { status: SyncJobStatus.PARTIAL },
        }),
      ]);

    res.json({
      success: true,
      data: {
        pending,
        running,
        success,
        failure,
        partial,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/trigger/full/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

    const job = await enqueueJob(
      SyncJobType.FULL_CATALOG,
      provider,
      `sync.manual.full.${provider}.${timestamp}`,
    );

    res.status(202).json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/trigger/incremental/:provider', async (req, res) => {
  try {
    const { provider } = req.params;

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');

    const job = await enqueueJob(
      SyncJobType.INCREMENTAL_EPISODES,
      provider,
      `sync.manual.incremental.${provider}.${timestamp}`,
    );

    res.status(202).json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post(
  '/trigger/backfill/:provider/:anilistId',
  async (req, res) => {
    try {
      const { provider, anilistId } = req.params;

      const parsedAniListId = Number.parseInt(anilistId, 10);

      if (!Number.isInteger(parsedAniListId) || parsedAniListId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid AniList ID',
        });
        return;
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

      const job = await enqueueJob(
        SyncJobType.INCREMENTAL_EPISODES,
        provider,
        `sync.backfill.${provider}.${parsedAniListId}.${timestamp}`,
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'Backfill queued',
          job,
          anilistId: parsedAniListId,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

router.post(
  '/trigger/repair/:provider/:anilistId',
  async (req, res) => {
    try {
      const { provider, anilistId } = req.params;

      const parsedAniListId = Number.parseInt(anilistId, 10);

      if (!Number.isInteger(parsedAniListId) || parsedAniListId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid AniList ID',
        });
        return;
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

      const job = await enqueueJob(
        SyncJobType.INCREMENTAL_EPISODES,
        provider,
        `sync.repair.${provider}.${parsedAniListId}.${timestamp}`,
      );

      res.status(202).json({
        success: true,
        data: {
          message: 'Repair queued',
          job,
          anilistId: parsedAniListId,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

router.get('/jobs', async (req, res) => {
  try {
    const {
      status,
      provider,
      limit = '50',
      offset = '0',
    } = req.query;

    const parsedLimit = Math.min(
      Math.max(Number.parseInt(limit as string, 10) || 50, 1),
      100,
    );

    const parsedOffset = Math.max(
      Number.parseInt(offset as string, 10) || 0,
      0,
    );

    const where: Prisma.SyncJobWhereInput = {};

    if (status) {
      where.status = status as SyncJobStatus;
    }

    if (provider) {
      where.provider = provider as string;
    }

    const jobs = await prisma.syncJob.findMany({
      where,
      orderBy: {
        id: 'desc',
      },
      take: parsedLimit,
      skip: parsedOffset,
    });

    res.json({
      success: true,
      data: jobs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const job = await prisma.syncJob.findUnique({
      where: { id },
    });

    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;

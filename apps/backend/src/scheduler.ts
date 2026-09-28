import 'dotenv/config';

import { prisma } from './config/prisma';
import { connectRedis, disconnectRedis } from './config/redis';
import { providerRegistry } from './services/streaming';
import { createSyncScheduler } from './services/sync/SyncScheduler';

let shuttingDown = false;

async function startScheduler() {
  try {
    await connectRedis();
    console.log('Redis connected');

    await prisma.$connect();
    console.log('Database connected');

    providerRegistry.initialize();
    console.log('Streaming providers initialized');

    const scheduler = await createSyncScheduler(prisma);

    await scheduler.start();
    console.log('Sync scheduler started');

    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;

      console.log(`\n${signal} received. Shutting down scheduler...`);

      try {
        await scheduler.stop();
        await disconnectRedis();
        await prisma.$disconnect();

        console.log('Scheduler connections closed. Goodbye!');
        process.exit(0);
      } catch (error) {
        console.error('Scheduler shutdown error:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (error) {
    console.error('Failed to start SyncScheduler:', error);

    await disconnectRedis().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);

    process.exit(1);
  }
}

void startScheduler();

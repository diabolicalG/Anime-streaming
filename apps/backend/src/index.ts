import 'dotenv/config';
import { createApp } from './app';
import { env, isProduction } from './config/env';
import { connectRedis, disconnectRedis } from './config/redis';
import { prisma } from './config/prisma';
import { providerRegistry } from './services/streaming';

async function startServer() {
  try {
    await connectRedis();
    console.log('Redis connected');

    await prisma.$connect();
    console.log('Database connected');

    providerRegistry.initialize();
    console.log('Streaming providers initialized');

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server running on port ${env.PORT} (${env.NODE_ENV})`);
      console.log(`   API: http://localhost:${env.PORT}/api`);
      console.log(`   Health: http://localhost:${env.PORT}/api/health`);
    });

    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectRedis();
        await prisma.$disconnect();
        console.log('Connections closed. Goodbye!');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

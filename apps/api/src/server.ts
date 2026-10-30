import { createApp, graphqlServer } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'LENSEGUA API listening');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(async (error) => {
    if (error) {
      logger.error(error, 'Error while closing server');
      process.exit(1);
    }

    await graphqlServer.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

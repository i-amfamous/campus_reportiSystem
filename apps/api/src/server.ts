import { createApp } from './app';
import { getConfig } from './config/env';
import { logger } from './config/logger';
import { prisma } from './lib/prisma';

async function main(): Promise<void> {
  const config = getConfig();
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(`Campus Resolve API listening on port ${config.PORT}`, {
      environment: config.NODE_ENV,
      api: config.API_URL,
      app: config.APP_URL,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('API received shutdown signal', { signal });
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    // Force exit if connections hang.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('API failed to start', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

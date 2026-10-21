import { Worker } from './worker';
import { logger } from '../config/logger';
import { prisma } from '../lib/prisma';

/**
 * Entry point for the background worker process.
 *
 * Run it with `npm run worker` (development) or `npm run start:worker`
 * (production). It is a separate process from the API so a long-running job
 * can never block an HTTP request (PRD §16).
 */
async function main(): Promise<void> {
  const worker = new Worker();
  await worker.start();

  const shutdown = async (signal: string) => {
    logger.info('Worker received shutdown signal', { signal });
    await worker.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('Worker failed to start', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});

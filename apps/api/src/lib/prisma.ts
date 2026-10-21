import { PrismaClient } from '@prisma/client';
import { getConfig } from '../config/env';
import { logger } from '../config/logger';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: getConfig().NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (getConfig().NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

export function logDatabaseError(operation: string, error: unknown): void {
  logger.error('Database operation failed', {
    operation,
    message: error instanceof Error ? error.message : String(error),
  });
}

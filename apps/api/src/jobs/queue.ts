import type { Job, Prisma } from '@prisma/client';
import type { JobType } from '@campus-resolve/shared';
import { prisma } from '../lib/prisma';
import { clock } from '../config/clock';
import { logger } from '../config/logger';

export interface EnqueueOptions {
  /** Unique key that makes enqueueing idempotent (PRD §9.3). */
  dedupeKey?: string | undefined;
  runAt?: Date | undefined;
  maxAttempts?: number | undefined;
}

export const JOB_TYPE = {
  TICKET_REMINDER: 'TICKET_REMINDER',
  SLA_FIRST_RESPONSE: 'SLA_FIRST_RESPONSE',
  SLA_RESOLUTION: 'SLA_RESOLUTION',
  ESCALATION: 'ESCALATION',
  NOTIFICATION_DELIVERY: 'NOTIFICATION_DELIVERY',
} as const satisfies Record<JobType, JobType>;

/**
 * Adds a job to the queue. When a `dedupeKey` is supplied the insert is
 * idempotent, so a retried enqueue can never create a second occurrence.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<Job | null> {
  try {
    return await client.job.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        dedupeKey: options.dedupeKey ?? null,
        runAt: options.runAt ?? clock.now(),
        maxAttempts: options.maxAttempts ?? 5,
        status: 'PENDING',
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

/**
 * Atomically claims up to `limit` due jobs.
 *
 * `FOR UPDATE SKIP LOCKED` allows several workers to run concurrently without
 * ever processing the same job twice.
 */
export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  const rows = await prisma.$queryRaw<Job[]>`
    UPDATE jobs
       SET status = 'RUNNING',
           "lockedBy" = ${workerId},
           "lockedAt" = ${clock.now()},
           attempts = attempts + 1,
           "updatedAt" = ${clock.now()}
     WHERE id IN (
       SELECT id FROM jobs
        WHERE status = 'PENDING' AND "runAt" <= ${clock.now()}
        ORDER BY "runAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
  `;
  return rows;
}

export async function completeJob(jobId: string, result?: Record<string, unknown>): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      result: (result ?? null) as Prisma.InputJsonValue,
      lockedBy: null,
      lockedAt: null,
      lastError: null,
    },
  });
}

/**
 * Marks a job as failed. When attempts remain the job is rescheduled with an
 * exponential backoff so a transient outage does not lose the work.
 */
export async function failJob(jobId: string, error: string, retry: boolean): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (!retry || job.attempts >= job.maxAttempts) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        lastError: error.slice(0, 2000),
        lockedBy: null,
        lockedAt: null,
      },
    });
    logger.error('Background job failed permanently', { jobId, jobType: job.type, error });
    return;
  }

  const backoffMs = Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.max(0, job.attempts - 1));
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'PENDING',
      lastError: error.slice(0, 2000),
      lockedBy: null,
      lockedAt: null,
      runAt: new Date(clock.nowMs() + backoffMs),
    },
  });
  logger.warn('Background job failed, retrying', { jobId, jobType: job.type, error, backoffMs });
}

/**
 * Returns jobs that were left RUNNING by a crashed worker to the queue.
 * This is what makes the worker safe across restarts (PRD §21).
 */
export async function recoverStaleJobs(staleAfterMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(clock.nowMs() - staleAfterMs);
  const result = await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: cutoff } },
    data: { status: 'PENDING', lockedBy: null, lockedAt: null },
  });
  if (result.count > 0) {
    logger.warn('Recovered stale background jobs after worker restart', { count: result.count });
  }
  return result.count;
}

export async function cancelJobsForDedupeKey(dedupeKey: string): Promise<number> {
  const result = await prisma.job.updateMany({
    where: { dedupeKey, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  return result.count;
}

export async function pendingJobCount(): Promise<number> {
  return prisma.job.count({ where: { status: 'PENDING' } });
}

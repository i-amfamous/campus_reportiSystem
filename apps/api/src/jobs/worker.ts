import os from 'node:os';
import { getConfig } from '../config/env';
import { clock } from '../config/clock';
import { logger } from '../config/logger';
import { prisma } from '../lib/prisma';
import { claimJobs, completeJob, failJob, recoverStaleJobs } from './queue';
import { runJob } from './handlers';
import { RESTORE_LOCK_KEY } from '../modules/backup/backup.service';

export interface WorkerOptions {
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  /** Run a single tick instead of looping (used by tests). */
  once?: boolean;
}

/**
 * Database-backed background worker.
 *
 * The worker is safe to run in several instances: jobs are claimed atomically
 * with `FOR UPDATE SKIP LOCKED`, and jobs left `RUNNING` by a crashed process
 * are recovered on the next boot (PRD §9.3, §21).
 */
export class Worker {
  readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private processed = 0;
  private failed = 0;

  constructor(options: WorkerOptions = {}) {
    const config = getConfig();
    this.workerId =
      options.workerId ??
      (config.WORKER_ID
        ? config.WORKER_ID
        : `${os.hostname()}-${process.pid}-${Date.now().toString(36)}`);
    this.pollIntervalMs = options.pollIntervalMs ?? config.WORKER_POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? config.WORKER_BATCH_SIZE;
  }

  get stats(): { processed: number; failed: number } {
    return { processed: this.processed, failed: this.failed };
  }

  /** Processes one batch of due jobs. Returns the number of jobs handled. */
  async tick(): Promise<number> {
    // A restore rewrites every table. The worker must not touch anything
    // until the restore has finished and released the lock.
    if (await this.isRestoreInProgress()) {
      logger.info('Worker tick skipped: a restore is in progress');
      return 0;
    }

    // Return jobs abandoned by a crashed worker to the queue before claiming
    // new work, so a restart never leaves a ticket without its reminders.
    await recoverStaleJobs();
    const jobs = await claimJobs(this.workerId, this.batchSize);
    for (const job of jobs) {
      try {
        const result = await runJob(job);
        await completeJob(job.id, result as Record<string, unknown>);
        this.processed += 1;
      } catch (error) {
        this.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        const retry = job.attempts < job.maxAttempts;
        await failJob(job.id, message, retry);
      }
    }
    return jobs.length;
  }

  /** True while an administrator is restoring a backup. */
  private async isRestoreInProgress(): Promise<boolean> {
    try {
      const lock = await prisma.systemSetting.findUnique({ where: { key: RESTORE_LOCK_KEY } });
      const value = lock?.value as { active?: boolean } | undefined;
      return value?.active === true;
    } catch {
      // If the lock cannot be read the worker must not run blind.
      return true;
    }
  }

  /** Drains the queue until no job is due. Used by tests and by the CLI. */
  async drain(maxIterations = 50): Promise<number> {
    let total = 0;
    for (let index = 0; index < maxIterations; index += 1) {
      const handled = await this.tick();
      total += handled;
      if (handled === 0) break;
    }
    return total;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await recoverStaleJobs();
    logger.info('Background worker started', {
      workerId: this.workerId,
      pollIntervalMs: this.pollIntervalMs,
    });

    const loop = async () => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (error) {
        logger.error('Worker tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!this.running) return;
      // The timer is intentionally not unref'd: the worker is a long-running
      // process and must stay alive even when the queue is momentarily empty.
      // `stop()` is what ends the loop.
      this.timer = setTimeout(loop, this.pollIntervalMs);
    };

    await loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await prisma.job.updateMany({
      where: { lockedBy: this.workerId, status: 'RUNNING' },
      data: { status: 'PENDING', lockedBy: null, lockedAt: null },
    });
    logger.info('Background worker stopped', {
      workerId: this.workerId,
      at: clock.now().toISOString(),
    });
  }
}

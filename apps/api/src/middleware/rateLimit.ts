import type { NextFunction, Request, Response } from 'express';
import { rateLimited } from '../lib/errors';
import { clock } from '../config/clock';

interface Bucket {
  count: number;
  resetAt: number;
}

const registry = new Set<Map<string, Bucket>>();

/**
 * In-process sliding window rate limiter.
 *
 * Note for multi-instance deployments: replace the in-memory store with a
 * shared store (Redis) or move the counter into Postgres. The per-account lock
 * counters in the auth module provide a second, persistent layer.
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
  message?: string;
  skipSuccessful?: boolean;
}) {
  const buckets = new Map<string, Bucket>();
  registry.add(buckets);

  const keyFn =
    options.key ??
    ((req: Request) => {
      const forwarded = req.headers['x-forwarded-for'];
      const ip =
        (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
        req.socket.remoteAddress ??
        'unknown';
      return `${req.method}:${req.path}:${ip}`;
    });

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = clock.nowMs();
    const key = keyFn(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(options.max - 1));
      next();
      return;
    }

    if (options.skipSuccessful && res.statusCode < 400) {
      next();
      return;
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      next(rateLimited(options.message ?? 'Too many requests. Please try again later.'));
      return;
    }

    next();
  };
}

/** Clears every limiter bucket. Used by the automated test suite. */
export function resetAllRateLimiters(): void {
  for (const buckets of registry) buckets.clear();
}

/** Removes expired buckets so a limiter does not grow without bound. */
export function pruneRateLimitBuckets(buckets: Map<string, Bucket>): void {
  const now = clock.nowMs();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../config/logger';
import { formatZodError } from './validate';
import { Prisma } from '@prisma/client';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.',
    },
  });
}

/**
 * Converts every error into the consistent API error envelope and never leaks
 * internal details to the client (PRD §19, §21).
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        ...(req.requestId ? { requestId: req.requestId } : {}),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The submitted data is invalid.',
        details: formatZodError(error),
        ...(req.requestId ? { requestId: req.requestId } : {}),
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'A record with these details already exists.',
          ...(req.requestId ? { requestId: req.requestId } : {}),
        },
      });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          ...(req.requestId ? { requestId: req.requestId } : {}),
        },
      });
      return;
    }
  }

  const status =
    typeof (error as { status?: number })?.status === 'number'
      ? (error as { status: number }).status
      : 500;
  const code =
    typeof (error as { code?: string })?.code === 'string'
      ? (error as { code: string }).code
      : 'INTERNAL_ERROR';
  const message =
    status === 429
      ? 'Too many requests. Please try again later.'
      : 'An unexpected error occurred. The incident has been logged.';

  logger.error('Unhandled request error', {
    method: req.method,
    path: req.path,
    status,
    code,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    requestId: req.requestId,
  });

  res.status(status).json({
    error: {
      code,
      message,
      ...(req.requestId ? { requestId: req.requestId } : {}),
    },
  });
}

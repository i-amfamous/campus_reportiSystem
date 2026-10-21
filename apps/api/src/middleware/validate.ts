import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { validationError } from '../lib/errors';

type Source = 'body' | 'query' | 'params';

/**
 * Validates and coerces part of the request. The validated (and coerced) value
 * replaces the raw input so downstream handlers only ever see parsed data
 * (PRD §18, §19).
 */
export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(validationError(formatZodError(result.error)));
      return;
    }
    if (source === 'query') {
      // Express 5 exposes req.query as a getter; assign via defineProperty.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

export function formatZodError(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    details[key] = details[key] ?? [];
    details[key]!.push(issue.message);
  }
  return details;
}

import type { ApiErrorCode } from '@campus-resolve/shared';

/**
 * Application error type. The error handler converts these into the API error
 * envelope; unexpected errors are logged and reported as `INTERNAL_ERROR`
 * without leaking internals (PRD §19, §21).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string[] | string | number | boolean>;
  readonly expose: boolean;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, string[] | string | number | boolean>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const badRequest = (message: string, details?: AppError['details']) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const validationError = (details: Record<string, string[]>) =>
  new AppError(422, 'VALIDATION_ERROR', 'The submitted data is invalid.', details);

export const unauthenticated = (message = 'Authentication is required.') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'The requested resource was not found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const invalidTransition = (message: string) =>
  new AppError(409, 'INVALID_TRANSITION', message);

export const rateLimited = (message = 'Too many requests. Please try again later.') =>
  new AppError(429, 'RATE_LIMITED', message);

export const emailNotVerified = () =>
  new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your institutional email address to continue.');

export const accountSuspended = () =>
  new AppError(
    403,
    'ACCOUNT_SUSPENDED',
    'This account has been suspended. Contact the administrator.',
  );

export const accountLocked = (message = 'This account is temporarily locked. Try again later.') =>
  new AppError(423, 'ACCOUNT_LOCKED', message);

export const payloadTooLarge = (message = 'The uploaded file is too large.') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message);

export const unsupportedMediaType = (message = 'This file type is not supported.') =>
  new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message);

export const csrfFailed = () => new AppError(403, 'CSRF_FAILED', 'Invalid or missing CSRF token.');

export const internalError = (message = 'An unexpected error occurred.') =>
  new AppError(500, 'INTERNAL_ERROR', message);

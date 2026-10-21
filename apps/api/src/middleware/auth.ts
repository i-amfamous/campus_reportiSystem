import type { NextFunction, Request, Response } from 'express';
import type { PermissionKey, RoleName } from '@campus-resolve/shared';
import {
  accountSuspended,
  emailNotVerified,
  forbidden,
  unauthenticated,
  csrfFailed,
} from '../lib/errors';
import { getConfig } from '../config/env';
import { prisma } from '../lib/prisma';
import { verifyCsrfToken } from '../modules/auth/session.service';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(unauthenticated());
    return;
  }
  if (req.auth.accountStatus === 'SUSPENDED') {
    next(accountSuspended());
    return;
  }
  next();
}

export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(unauthenticated());
    return;
  }
  if (!req.auth.emailVerified) {
    next(emailNotVerified());
    return;
  }
  next();
}

export function requirePermission(permission: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (!req.auth.permissions.has(permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (!permissions.some((permission) => req.auth?.permissions.has(permission))) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (!roles.some((role) => req.auth?.roles.includes(role))) {
      next(forbidden());
      return;
    }
    next();
  };
}

/**
 * CSRF protection for cookie-authenticated state-changing requests.
 * The `X-CSRF-Token` header must match the session's CSRF secret.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  if (!req.auth) {
    // Unauthenticated state-changing requests are rejected by requireAuth
    // anyway; CSRF only protects cookie-authenticated requests.
    next();
    return;
  }
  const header = req.get('x-csrf-token') ?? undefined;
  void prisma.session
    .findUnique({ where: { id: req.auth.sessionId }, select: { csrfTokenHash: true } })
    .then((session) => {
      if (!session || !verifyCsrfToken(session.csrfTokenHash, header)) {
        next(csrfFailed());
        return;
      }
      next();
    })
    .catch(() => next(csrfFailed()));
}

/** Restrict the API to a list of allowed browser origins. */
export function originGuard(req: Request, _res: Response, next: NextFunction): void {
  const config = getConfig();
  const origin = req.get('origin');
  if (!origin) {
    next();
    return;
  }
  if (!config.CORS_ORIGINS.includes(origin)) {
    next(forbidden('Origin is not allowed.'));
    return;
  }
  next();
}

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import type { AppConfig } from '../../config/env';
import { getConfig } from '../../config/env';
import { generateSessionToken, hashToken, safeCompare } from '../../lib/crypto';
import { clock } from '../../config/clock';
import type { AuthContext } from './auth.types';
import { ROLE_PERMISSIONS, type PermissionKey, type RoleName } from '@campus-resolve/shared';

export const SESSION_COOKIE = getConfig().SESSION_COOKIE_NAME;
export const CSRF_COOKIE = getConfig().CSRF_COOKIE_NAME;

interface CreatedSession {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | undefined; userAgent?: string | undefined } = {},
): Promise<CreatedSession> {
  const config = getConfig();
  const sessionToken = generateSessionToken();
  const csrfToken = generateSessionToken();
  const expiresAt = new Date(clock.nowMs() + config.SESSION_TTL_HOURS * 3_600_000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(sessionToken, config.SESSION_SECRET),
      csrfTokenHash: hashToken(csrfToken, config.SESSION_SECRET),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
    },
  });

  return { sessionId: session.id, sessionToken, csrfToken, expiresAt };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: clock.now() },
  });
}

export interface ResolvedSession {
  auth: AuthContext;
  sessionTokenHash: string;
}

export async function resolveSession(sessionToken: string): Promise<ResolvedSession | null> {
  const config = getConfig();
  const tokenHash = hashToken(sessionToken, config.SESSION_SECRET);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
          memberships: { include: { department: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= clock.nowMs()) return null;
  if (session.user.accountStatus === 'DEACTIVATED') return null;
  if (session.user.accountStatus === 'SUSPENDED') return null;

  const roles = session.user.roles.map((entry) => entry.role.name as RoleName);
  const permissions = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) permissions.add(permission);
  }

  const auth: AuthContext = {
    userId: session.user.id,
    sessionId: session.id,
    email: session.user.email,
    fullName: session.user.fullName,
    studentId: session.user.studentId,
    emailVerified: session.user.emailVerifiedAt !== null,
    accountStatus: session.user.accountStatus as AuthContext['accountStatus'],
    roles,
    permissions,
    departments: session.user.memberships.map((membership) => ({
      departmentId: membership.department.id,
      departmentName: membership.department.name,
      departmentRole: membership.departmentRole,
      isActive: membership.isActive,
    })),
    lastLoginAt: session.user.lastLoginAt,
    mustChangePassword: (session.user as any).mustChangePassword ?? false,
  };

  return { auth, sessionTokenHash: tokenHash };
}

export function verifyCsrfToken(
  sessionCsrfHash: string,
  presentedToken: string | undefined,
): boolean {
  if (!presentedToken) return false;
  const config = getConfig();
  return safeCompare(sessionCsrfHash, hashToken(presentedToken, config.SESSION_SECRET));
}

/**
 * The `Secure` cookie flag. Production defaults to secure; a deployment that
 * is served over plain HTTP has to opt out explicitly.
 */
function cookieIsSecure(config: AppConfig): boolean {
  return config.COOKIE_SECURE ?? config.NODE_ENV === 'production';
}

export function setSessionCookies(res: Response, session: CreatedSession): void {
  const config = getConfig();
  const secure = cookieIsSecure(config);
  const base = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  };
  res.cookie(SESSION_COOKIE, session.sessionToken, {
    ...base,
    expires: session.expiresAt,
  });
  // The CSRF cookie is intentionally readable by the browser so the client can
  // echo it in the X-CSRF-Token header (double-submit pattern).
  res.cookie(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    expires: session.expiresAt,
  });
}

export function clearSessionCookies(res: Response): void {
  const config = getConfig();
  const secure = cookieIsSecure(config);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure, sameSite: 'lax', path: '/' });
}

/** Express middleware that populates `req.auth` when a valid session exists. */
export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    next();
    return;
  }
  resolveSession(token)
    .then((resolved) => {
      if (resolved) req.auth = resolved.auth;
      next();
    })
    .catch(() => next());
}

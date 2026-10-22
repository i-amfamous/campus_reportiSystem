import type { User } from '@prisma/client';
import { normalizeEmail } from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { getConfig } from '../../config/env';
import {
  accountLocked,
  accountSuspended,
  badRequest,
  conflict,
  emailNotVerified,
  forbidden,
  notFound,
  unauthenticated,
} from '../../lib/errors';
import { generateToken, hashPassword, hashToken, safeCompare, verifyPassword } from '../../lib/crypto';
import { queueNotification } from '../notifications/notification.service';
import { createSession, revokeSession } from './session.service';
import type { AuthContext } from './auth.types';

const VERIFICATION_TTL_MS = 10 * 60_000;
const RESET_TTL_MS = 60 * 60_000;
const MAX_FAILED_LOGINS = 8;
const LOCK_DURATION_MS = 15 * 60_000;

/** Generates a 6-digit numeric one-time code sent to the user's email. */
function generateOtp(): string {
  let otp = '';
  for (let i = 0; i < 6; i += 1) {
    otp += String(Math.floor(Math.random() * 10));
  }
  return otp;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  studentId?: string | undefined;
  password: string;
}

export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Student self-registration.
 *
 * Only the STUDENT role is ever granted here. Staff accounts are created by
 * administrators through the invitation flow, so a student can never promote
 * themselves by crafting a registration request (PRD §5.1, §5.2).
 */
export async function registerStudent(
  input: RegisterInput,
): Promise<{ user: User; otp: string }> {
  const config = getConfig();
  const email = normalizeEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw conflict('An account already exists for this email address.');
  }

  const studentId = input.studentId?.trim();
  if (studentId) {
    const existingStudent = await prisma.user.findUnique({ where: { studentId } });
    if (existingStudent) {
      throw conflict('This student ID is already registered.');
    }
  }

  const passwordHash = await hashPassword(input.password);
  const otp = generateOtp();
  const now = clock.now();

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        studentId,
        passwordHash,
        accountStatus: 'PENDING_VERIFICATION',
      },
    });

    const role = await tx.role.findUnique({ where: { name: 'STUDENT' } });
    if (role) {
      await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
    }

    await tx.emailVerificationToken.create({
      data: {
        userId: created.id,
        tokenHash: hashToken(otp, config.SESSION_SECRET),
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
      },
    });

    await queueNotification(
      {
        recipientId: created.id,
        type: 'EMAIL_VERIFICATION',
        idempotencyKey: `email-verification:${created.id}`,
        payload: { otp, detail: 'Please verify your email address.' },
      },
      tx,
    );

    return created;
  });

  return { user, otp };
}

/** Verifies a one-time code sent to the user's email and activates the account. */
export async function verifyOtp(
  email: string,
  otp: string,
): Promise<{ email: string; fullName: string }> {
  const config = getConfig();
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  const genericFailure = badRequest('The verification code is incorrect or has expired.');

  if (!user) throw genericFailure;
  if (user.emailVerifiedAt) throw genericFailure;

  const record = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= clock.nowMs()) {
    throw genericFailure;
  }

  const expected = hashToken(otp, config.SESSION_SECRET);
  if (!safeCompare(record.tokenHash, expected)) {
    throw genericFailure;
  }

  const now = clock.now();
  const updated = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    });
    const u = await tx.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: now, accountStatus: 'ACTIVE' },
    });
    await queueNotification(
      {
        recipientId: u.id,
        type: 'REGISTRATION_CONFIRMED',
        idempotencyKey: `registration-confirmed:${u.id}`,
        payload: {},
      },
      tx,
    );
    return u;
  });

  return { email: updated.email, fullName: updated.fullName };
}

/** Re-sends the verification OTP. Always succeeds to avoid account probing. */
export async function resendVerification(email: string): Promise<void> {
  const config = getConfig();
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || user.emailVerifiedAt) return;

  const otp = generateOtp();
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(otp, config.SESSION_SECRET),
        expiresAt: new Date(clock.nowMs() + VERIFICATION_TTL_MS),
      },
    });
    await queueNotification(
      {
        recipientId: user.id,
        type: 'EMAIL_VERIFICATION',
        idempotencyKey: `email-verification-resend:${user.id}:${otp.slice(0, 4)}`,
        payload: { otp },
      },
      tx,
    );
  });
}

export interface LoginResult {
  user: User;
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

/** Authenticates a user and creates a session. */
export async function login(
  email: string,
  password: string,
  meta: RequestMeta = {},
): Promise<LoginResult> {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  const genericFailure = badRequest('The email address or password is incorrect.');

  if (!user) {
    // Perform a dummy verification to keep the timing of unknown and known
    // accounts roughly comparable.
    await verifyPassword(password, 'scrypt$16384$8$1$00$00');
    throw genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > clock.nowMs()) {
    throw accountLocked(
      'This account is temporarily locked after too many failed attempts. Try again later.',
    );
  }

  if (user.accountStatus === 'SUSPENDED') throw accountSuspended();
  if (user.accountStatus === 'DEACTIVATED') {
    throw forbidden('This account has been deactivated.');
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED_LOGINS ? new Date(clock.nowMs() + LOCK_DURATION_MS) : null,
      },
    });
    throw genericFailure;
  }

  if (!user.emailVerifiedAt && user.accountStatus !== 'MUST_CHANGE_PASSWORD' && !(user as any).mustChangePassword) {
    await resendVerification(normalized);
    throw emailNotVerified(
      'We sent a new verification code to your email address. Enter it to activate your account.',
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: clock.now(), mustChangePassword: false },
  });

  const session = await createSession(user.id, meta);
  return {
    user,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    mustChangePassword: user.accountStatus === 'MUST_CHANGE_PASSWORD' || (user as any).mustChangePassword || false,
  } as any;
}

export async function logout(sessionId: string): Promise<void> {
  await revokeSession(sessionId);
}

/** Starts a password reset. The response is identical whether or not the account exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const config = getConfig();
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.emailVerifiedAt) return;

  const token = generateToken();
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token, config.SESSION_SECRET),
        expiresAt: new Date(clock.nowMs() + RESET_TTL_MS),
      },
    });
    await queueNotification(
      {
        recipientId: user.id,
        type: 'PASSWORD_RESET',
        idempotencyKey: `password-reset:${user.id}:${token.slice(0, 8)}`,
        payload: { token },
      },
      tx,
    );
  });
}

/** Completes a password reset. All existing sessions are revoked. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const config = getConfig();
  const tokenHash = hashToken(token, config.SESSION_SECRET);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt || record.expiresAt.getTime() <= clock.nowMs()) {
    throw badRequest('This password reset link is invalid or has expired.');
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: clock.now() } });
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null, mustChangePassword: false },
    });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: clock.now() },
    });
  });
}

/** Changes the password of the signed-in user. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound('Account not found.');
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw badRequest('The current password is incorrect.');
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null, mustChangePassword: false },
  });
}

/**
 * Accepts a staff invitation.
 *
 * An invited account has no usable password: the administrator created it
 * with a random placeholder. The invitee chooses their own password here, and
 * the same single-use token also confirms control of the institutional
 * mailbox, so the account becomes active in one step.
 */
export async function acceptInvitation(
  token: string,
  password: string,
): Promise<{ email: string; fullName: string }> {
  const config = getConfig();
  const tokenHash = hashToken(token, config.SESSION_SECRET);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= clock.nowMs()) {
    throw badRequest('This invitation link is invalid or has expired.');
  }
  if (!record.user.invitedById) {
    throw badRequest('This link is not a staff invitation.');
  }
  if (record.user.accountStatus === 'SUSPENDED' || record.user.accountStatus === 'DEACTIVATED') {
    throw accountSuspended();
  }

  const now = clock.now();
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    });
    const updated = await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    // Any session that existed before the password was set is no longer valid.
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await queueNotification(
      {
        recipientId: updated.id,
        type: 'REGISTRATION_CONFIRMED',
        idempotencyKey: `registration-confirmed:${updated.id}`,
        payload: {},
      },
      tx,
    );
    return updated;
  });

  return { email: user.email, fullName: user.fullName };
}

export function toSessionUser(auth: AuthContext) {
  return {
    id: auth.userId,
    email: auth.email,
    fullName: auth.fullName,
    studentId: auth.studentId,
    emailVerified: auth.emailVerified,
    accountStatus: auth.accountStatus,
    roles: auth.roles,
    permissions: [...auth.permissions],
    departments: auth.departments.map((scope) => ({
      departmentId: scope.departmentId,
      departmentName: scope.departmentName,
      departmentRole: scope.departmentRole,
    })),
    lastLoginAt: auth.lastLoginAt,
    createdAt: new Date().toISOString(),
    mustChangePassword: (auth as any).mustChangePassword ?? false,
  };
}

export function assertAuthenticated(auth: AuthContext | undefined): AuthContext {
  if (!auth) throw unauthenticated();
  return auth;
}

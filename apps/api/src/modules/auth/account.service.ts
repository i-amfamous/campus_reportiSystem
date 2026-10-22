/**
 * Account erasure ("Danger Zone").
 *
 * Erasure removes everything that identifies the person and lets them sign in
 * again, but it deliberately keeps the institutional record: tickets, replies,
 * attachments, history and the audit trail stay in the system exactly as they
 * were (PRD §9.7, §19).
 *
 * The implementation is therefore a *tombstone* rather than a row delete:
 *
 *   - the `users` row survives, stripped of every personal field, because the
 *     ticket, message, attachment and audit tables reference it with
 *     `ON DELETE RESTRICT` / `SET NULL` and dropping it would either fail or
 *     silently destroy the history the institution is required to keep;
 *   - sessions, tokens, role grants, department memberships and notifications
 *     are deleted outright — they are pure personal data with no record value;
 *   - the `audit_logs` rows are never touched, so "who did what" survives the
 *     deletion and the deletion itself is audited.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { verifyPassword } from '../../lib/crypto';
import type { AuthContext } from './auth.types';

export const DELETED_ACCOUNT_NAME = 'Deleted account';

/** RFC 2606 reserves `.invalid`, so a tombstone address can never resolve. */
const TOMBSTONE_EMAIL_DOMAIN = 'deleted.invalid';

export type ErasureScope = 'self' | 'admin';

export interface ErasureOptions {
  /** The user id recorded as the actor of the audit entry. */
  actorId: string;
  scope: ErasureScope;
  reason?: string | null | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface ErasureResult {
  userId: string;
  /** Records that were kept on purpose so the history is not lost. */
  retained: {
    tickets: number;
    messages: number;
    attachments: number;
    auditLogs: number;
  };
}

/** A tombstone address that is unique per user and can never be delivered to. */
export function tombstoneEmail(userId: string): string {
  return `deleted-${userId}@${TOMBSTONE_EMAIL_DOMAIN}`;
}

/** Masks an address so an audit trail can identify a record without storing it. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  if (local.length <= 2) return `**@${domain}`;
  return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 8))}@${domain}`;
}

async function countRemainingSuperAdmins(
  tx: Prisma.TransactionClient,
  excludingUserId: string,
): Promise<number> {
  return tx.user.count({
    where: {
      id: { not: excludingUserId },
      accountStatus: { not: 'DEACTIVATED' },
      roles: { some: { role: { name: 'SUPER_ADMIN' } } },
    },
  });
}

/**
 * The platform must never be left without a super administrator, otherwise it
 * can no longer be administered, audited or restored.
 */
export async function assertAnotherSuperAdminRemains(
  tx: Prisma.TransactionClient,
  user: { id: string; roles: { role: { name: string } }[] },
): Promise<void> {
  const isSuperAdmin = user.roles.some((entry) => entry.role.name === 'SUPER_ADMIN');
  if (!isSuperAdmin) return;
  const remaining = await countRemainingSuperAdmins(tx, user.id);
  if (remaining === 0) {
    throw conflict(
      'This is the last super administrator account. Promote another super administrator before deleting it.',
    );
  }
}

/**
 * Erases an account inside an open transaction. Shared by the self-service
 * Danger Zone and the administrator route so both behave identically.
 */
export async function eraseUserAccount(
  tx: Prisma.TransactionClient,
  userId: string,
  options: ErasureOptions,
): Promise<ErasureResult> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: { select: { name: true } } } } },
  });
  if (!user) throw notFound('Account not found.');

  await assertAnotherSuperAdminRemains(tx, user);

  const now = clock.now();

  // 1. Delete the records that exist only to serve this person. Notifications
  //    carry the rendered email body, so they are personal data too.
  await tx.notification.deleteMany({ where: { recipientId: userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.emailVerificationToken.deleteMany({ where: { userId } });
  await tx.passwordResetToken.deleteMany({ where: { userId } });
  await tx.departmentMembership.deleteMany({ where: { userId } });
  await tx.userRole.deleteMany({ where: { userId } });

  // 2. Strip the contact details the person typed onto their own tickets.
  await tx.ticket.updateMany({
    where: { studentId: userId },
    data: { contactPhone: null, preferredContactMethod: null },
  });

  // 3. Scrub the identity but keep the row, so the tickets, replies and audit
  //    entries that point at it stay valid and attributable.
  await tx.user.update({
    where: { id: userId },
    data: {
      fullName: DELETED_ACCOUNT_NAME,
      email: tombstoneEmail(userId),
      studentId: null,
      passwordHash: null,
      emailVerifiedAt: null,
      accountStatus: 'DEACTIVATED',
      phone: null,
      preferredContactMethod: null,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      invitedById: null,
    },
  });

  // 4. Count what was kept, so the outcome is provable and reportable.
  const [tickets, messages, attachments, auditLogs] = await Promise.all([
    tx.ticket.count({ where: { studentId: userId } }),
    tx.ticketMessage.count({ where: { senderId: userId } }),
    tx.ticketAttachment.count({ where: { uploadedById: userId } }),
    tx.auditLog.count({ where: { actorId: userId } }),
  ]);

  // 5. Audit the deletion. The masked address identifies the record without
  //    copying the personal data back into the log.
  await tx.auditLog.create({
    data: {
      actorId: options.actorId,
      action: 'ACCOUNT_DELETED',
      entityType: 'User',
      entityId: userId,
      metadata: {
        scope: options.scope,
        reason: options.reason ?? null,
        deletedEmailMasked: maskEmail(user.email),
        retainedTickets: tickets,
        retainedMessages: messages,
        retainedAttachments: attachments,
        retainedAuditLogs: auditLogs,
        erasedAt: now.toISOString(),
      },
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent?.slice(0, 255) ?? null,
    },
  });

  return {
    userId,
    retained: { tickets, messages, attachments, auditLogs },
  };
}

/**
 * Self-service erasure from the Danger Zone. The current password proves the
 * session belongs to the account owner.
 */
export async function deleteOwnAccount(
  auth: AuthContext,
  input: { currentPassword: string },
  meta: { ipAddress?: string | undefined; userAgent?: string | undefined } = {},
): Promise<ErasureResult> {
  const user = await prisma.user.findUnique({ where: { id: auth.userId } });
  if (!user) throw notFound('Account not found.');

  // An account that never had a usable password (an invitation that was never
  // accepted) cannot be confirmed with a password; the confirmation phrase
  // carried in the request is then the only proof of intent.
  if (user.passwordHash) {
    const valid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!valid) throw badRequest('Your current password is incorrect.');
  }

  return prisma.$transaction(async (tx) =>
    eraseUserAccount(tx, auth.userId, {
      actorId: auth.userId,
      scope: 'self',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  );
}

/**
 * Administrator-initiated erasure. A regular administrator can remove
 * ordinary accounts; only a super administrator can remove a super
 * administrator, and nobody can remove their own account through this route
 * (the Danger Zone is the audited path for that).
 */
export async function deleteUserAccount(
  auth: AuthContext,
  userId: string,
  input: { reason: string },
  meta: { ipAddress?: string | undefined; userAgent?: string | undefined } = {},
): Promise<ErasureResult> {
  if (!auth.permissions.has('user:manage')) {
    throw forbidden('You are not authorised to delete accounts.');
  }
  if (userId === auth.userId) {
    throw badRequest('Use your own profile\'s Danger Zone to delete your account.');
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: { select: { name: true } } } } },
  });
  if (!target) throw notFound('User not found.');

  const targetIsSuperAdmin = target.roles.some((entry) => entry.role.name === 'SUPER_ADMIN');
  if (targetIsSuperAdmin && !auth.roles.includes('SUPER_ADMIN')) {
    throw forbidden('Only a super administrator can delete a super administrator account.');
  }

  return prisma.$transaction(async (tx) =>
    eraseUserAccount(tx, userId, {
      actorId: auth.userId,
      scope: 'admin',
      reason: input.reason,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  );
}

import type { Prisma } from '@prisma/client';
import { ASSIGNABLE_ROLES, type RoleName } from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { getConfig } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { paginate, type PaginationOptions } from '../../lib/pagination';
import { generateToken, hashPassword, hashToken } from '../../lib/crypto';
import { queueNotification } from '../notifications/notification.service';
import { normalizeEmail } from '@campus-resolve/shared';
import type { AuthContext } from '../auth/auth.types';

export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** Writes an audit record for a privileged action (PRD §19). */
export async function writeAudit(
  auth: AuthContext,
  action: string,
  entityType: string,
  entityId?: string | null | undefined,
  metadata?: Prisma.InputJsonValue | undefined,
  meta?: RequestMeta,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: auth.userId,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: metadata ?? undefined,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent?.slice(0, 255) ?? null,
    },
  });
}

export interface ListUsersOptions extends PaginationOptions {
  search?: string | undefined;
  role?: RoleName | undefined;
  accountStatus?: string | undefined;
  departmentId?: string | undefined;
}

export async function listUsers(auth: AuthContext, options: ListUsersOptions) {
  const where: Prisma.UserWhereInput = {
    ...(options.role ? { roles: { some: { role: { name: options.role } } } } : {}),
    ...(options.accountStatus ? { accountStatus: options.accountStatus as never } : {}),
    ...(options.departmentId
      ? { memberships: { some: { departmentId: options.departmentId, isActive: true } } }
      : {}),
    ...(options.search
      ? {
          OR: [
            { fullName: { contains: options.search, mode: 'insensitive' } },
            { email: { contains: options.search, mode: 'insensitive' } },
            { studentId: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: options.page ? (options.page - 1) * (options.pageSize ?? 20) : 0,
      take: options.pageSize ?? 20,
      include: {
        roles: { include: { role: { select: { name: true } } } },
        memberships: { include: { department: { select: { id: true, name: true } } } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return paginate(
    users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      studentId: user.studentId,
      accountStatus: user.accountStatus,
      emailVerified: user.emailVerifiedAt !== null,
      roles: user.roles.map((role) => role.role.name),
      departments: user.memberships.map((membership) => ({
        id: membership.department.id,
        name: membership.department.name,
        departmentRole: membership.departmentRole,
        isActive: membership.isActive,
      })),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    })),
    total,
    options,
  );
}

/**
 * Invites a staff member. Staff accounts can only be created by authorised
 * administrators (PRD §5.2).
 */
export async function inviteUser(
  auth: AuthContext,
  input: {
    email: string;
    fullName: string;
    role: RoleName;
    departmentId?: string | null | undefined;
    departmentRole?: 'OFFICER' | 'HEAD' | null | undefined;
  },
  meta: RequestMeta = {},
) {
  assertCanGrantRole(auth, input.role);

  const config = getConfig();
  const email = normalizeEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('A user with this email address already exists.');

  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw notFound('Department not found.');
  }

  const role = await prisma.role.findUnique({ where: { name: input.role } });
  if (!role) throw badRequest(`Unknown role "${input.role}".`);

  const token = generateToken();
  const temporaryPassword = generateToken(12);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        passwordHash: await hashPassword(temporaryPassword),
        accountStatus: 'PENDING_VERIFICATION',
        invitedById: auth.userId,
        roles: { create: { roleId: role.id, grantedById: auth.userId } },
        ...(input.departmentId
          ? {
              memberships: {
                create: {
                  departmentId: input.departmentId,
                  departmentRole: input.departmentRole ?? 'OFFICER',
                },
              },
            }
          : {}),
      },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: created.id,
        tokenHash: hashToken(token, config.SESSION_SECRET),
        expiresAt: new Date(clock.nowMs() + 24 * 3_600_000),
      },
    });

    await queueNotification(
      {
        recipientId: created.id,
        type: 'STAFF_INVITATION',
        idempotencyKey: `staff-invitation:${created.id}`,
        payload: { token, detail: `You were invited as ${input.role}.` },
      },
      tx,
    );

    return created;
  });

  await writeAudit(
    auth,
    'USER_INVITED',
    'User',
    user.id,
    { email, role: input.role, departmentId: input.departmentId ?? null },
    meta,
  );

  return { id: user.id, email: user.email, fullName: user.fullName, roles: [input.role] };
}

/**
 * Only a super administrator may grant the super-administrator role, and a
 * department head may only manage roles inside their own department
 * (PRD §4.5, §5.2).
 */
export function assertCanGrantRole(auth: AuthContext, targetRole: RoleName): void {
  if (auth.permissions.has('user:role:assign')) {
    if (targetRole === 'SUPER_ADMIN' && !auth.roles.includes('SUPER_ADMIN')) {
      throw forbidden('Only a super administrator can grant the super-administrator role.');
    }
    return;
  }
  if (auth.permissions.has('user:manage:department')) {
    if (targetRole !== 'OFFICER' && targetRole !== 'DEPARTMENT_HEAD') {
      throw forbidden('Department heads can only manage officer and department-head roles.');
    }
    return;
  }
  throw forbidden('You are not authorised to assign roles.');
}

export async function updateUserRole(
  auth: AuthContext,
  userId: string,
  role: RoleName,
  departmentId?: string | null | undefined,
  departmentRole?: 'OFFICER' | 'HEAD' | null | undefined,
  meta: RequestMeta = {},
) {
  assertCanGrantRole(auth, role);

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!target) throw notFound('User not found.');

  if (auth.permissions.has('user:manage:department') && !auth.permissions.has('user:role:assign')) {
    const scope = auth.departments.some(
      (entry) => entry.departmentId === departmentId && entry.isActive,
    );
    if (!scope) throw forbidden('You can only manage staff inside your own department.');
  }

  if (target.id === auth.userId && !target.roles.some((entry) => entry.role.name === role)) {
    throw badRequest('You cannot change your own role.');
  }

  const roleRecord = await prisma.role.findUnique({ where: { name: role } });
  if (!roleRecord) throw badRequest(`Unknown role "${role}".`);

  await prisma.$transaction(async (tx) => {
    // Staff roles are scoped by department; only the STUDENT role is global.
    if (role === 'STUDENT') {
      await tx.userRole.deleteMany({
        where: {
          userId,
          role: { name: { in: ['OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN'] } },
        },
      });
      await tx.userRole.create({
        data: { userId, roleId: roleRecord.id, grantedById: auth.userId },
      });
    } else {
      // Granting a staff role replaces the student's role: a user is either a
      // student or staff, never both.
      await tx.userRole.deleteMany({
        where: {
          userId,
          role: { name: { in: ['STUDENT', 'OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN'] } },
        },
      });
      await tx.userRole.create({
        data: { userId, roleId: roleRecord.id, grantedById: auth.userId },
      });
      if (departmentId) {
        await tx.departmentMembership.upsert({
          where: { departmentId_userId: { departmentId, userId } },
          create: { departmentId, userId, departmentRole: departmentRole ?? 'OFFICER' },
          update: { departmentRole: departmentRole ?? 'OFFICER', isActive: true },
        });
      }
    }
  });

  await writeAudit(
    auth,
    'USER_ROLE_UPDATED',
    'User',
    userId,
    { role, departmentId: departmentId ?? null },
    meta,
  );

  return { userId, role };
}

export async function updateUserStatus(
  auth: AuthContext,
  userId: string,
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED',
  reason?: string,
  meta: RequestMeta = {},
) {
  if (!auth.permissions.has('user:manage')) {
    throw forbidden('You are not authorised to change account status.');
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound('User not found.');
  if (target.id === auth.userId)
    throw badRequest('You cannot change the status of your own account.');

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { accountStatus },
    });
    if (accountStatus !== 'ACTIVE') {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: clock.now() },
      });
    }
    if (accountStatus === 'SUSPENDED') {
      await queueNotification(
        {
          recipientId: userId,
          type: 'ACCOUNT_SUSPENDED',
          idempotencyKey: `account-suspended:${userId}:${clock.nowMs()}`,
          payload: { note: reason ?? undefined },
        },
        tx,
      );
    }
  });

  await writeAudit(
    auth,
    'USER_STATUS_UPDATED',
    'User',
    userId,
    { accountStatus, reason: reason ?? null },
    meta,
  );

  return { userId, accountStatus };
}

export async function createDepartment(
  auth: AuthContext,
  input: {
    name: string;
    description?: string | undefined;
    contactEmail?: string | undefined;
    isActive?: boolean | undefined;
    isFallbackQueue?: boolean | undefined;
    sortOrder?: number | undefined;
  },
  meta: RequestMeta = {},
) {
  const department = await prisma.department.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      contactEmail: input.contactEmail ?? null,
      isActive: input.isActive ?? true,
      isFallbackQueue: input.isFallbackQueue ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAudit(
    auth,
    'DEPARTMENT_CREATED',
    'Department',
    department.id,
    { name: department.name },
    meta,
  );
  return department;
}

export async function updateDepartment(
  auth: AuthContext,
  departmentId: string,
  input: {
    name?: string | undefined;
    description?: string | undefined;
    contactEmail?: string | undefined;
    isActive?: boolean | undefined;
    isFallbackQueue?: boolean | undefined;
    sortOrder?: number | undefined;
  },
  meta: RequestMeta = {},
) {
  const existing = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!existing) throw notFound('Department not found.');

  const department = await prisma.department.update({
    where: { id: departmentId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isFallbackQueue !== undefined ? { isFallbackQueue: input.isFallbackQueue } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await writeAudit(
    auth,
    'DEPARTMENT_UPDATED',
    'Department',
    departmentId,
    input as Prisma.InputJsonValue,
    meta,
  );
  return department;
}

export async function createCategory(
  auth: AuthContext,
  input: {
    name: string;
    description?: string | undefined;
    departmentId?: string | null | undefined;
    defaultPriority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | undefined;
    isActive?: boolean | undefined;
    isSensitive?: boolean | undefined;
    sortOrder?: number | undefined;
  },
  meta: RequestMeta = {},
) {
  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw notFound('Department not found.');
  }
  const category = await prisma.category.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      departmentId: input.departmentId ?? null,
      defaultPriority: input.defaultPriority ?? 'NORMAL',
      isActive: input.isActive ?? true,
      isSensitive: input.isSensitive ?? false,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAudit(
    auth,
    'CATEGORY_CREATED',
    'Category',
    category.id,
    { name: category.name },
    meta,
  );
  return category;
}

export async function updateCategory(
  auth: AuthContext,
  categoryId: string,
  input: {
    name?: string | undefined;
    description?: string | undefined;
    departmentId?: string | null | undefined;
    defaultPriority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | undefined;
    isActive?: boolean | undefined;
    isSensitive?: boolean | undefined;
    sortOrder?: number | undefined;
  },
  meta: RequestMeta = {},
) {
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) throw notFound('Category not found.');

  const category = await prisma.category.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.defaultPriority !== undefined ? { defaultPriority: input.defaultPriority } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.isSensitive !== undefined ? { isSensitive: input.isSensitive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await writeAudit(
    auth,
    'CATEGORY_UPDATED',
    'Category',
    categoryId,
    input as Prisma.InputJsonValue,
    meta,
  );
  return category;
}

export async function listAuditLogs(
  auth: AuthContext,
  options: PaginationOptions & { action?: string; entityType?: string; actorId?: string },
) {
  const where: Prisma.AuditLogWhereInput = {
    ...(options.action ? { action: options.action } : {}),
    ...(options.entityType ? { entityType: options.entityType } : {}),
    ...(options.actorId ? { actorId: options.actorId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: options.page ? (options.page - 1) * (options.pageSize ?? 20) : 0,
      take: options.pageSize ?? 20,
      include: { actor: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paginate(items, total, options);
}

const SETTING_DEFAULTS = {
  institutionName: 'Campus Resolve',
  institutionEmailDomains: getConfig().INSTITUTION_EMAIL_DOMAINS,
  reminderIntervalMinutes: 120,
  escalationAfterReminders: 3,
  maxReminders: 8,
  autoCloseDays: 14,
  ticketRetentionMonths: 24,
  attachmentRetentionMonths: 12,
  allowStudentOfficerSelection: true,
  remindersPaused: false,
  supportEmail: 'support@campusresolve.edu.gh',
} as const;

export async function getSettings() {
  const rows = await prisma.systemSetting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...SETTING_DEFAULTS, ...stored };
}

export async function updateSettings(
  auth: AuthContext,
  input: Record<string, unknown>,
  meta: RequestMeta = {},
) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: auth.userId },
        update: { value: value as Prisma.InputJsonValue, updatedById: auth.userId },
      }),
    ),
  );
  await writeAudit(
    auth,
    'SETTINGS_UPDATED',
    'SystemSetting',
    null,
    input as Prisma.InputJsonValue,
    meta,
  );
  return getSettings();
}

/** Operational export of authorised reports (PRD §14.3). */
export async function exportReport(
  auth: AuthContext,
  type: 'tickets' | 'analytics' | 'notifications' | 'audit',
  format: 'csv' | 'json',
  options: {
    from?: Date | undefined;
    to?: Date | undefined;
    departmentId?: string | undefined;
  } = {},
) {
  if (!auth.permissions.has('export:create')) {
    throw forbidden('You are not authorised to export reports.');
  }

  const from = options.from ?? new Date(clock.nowMs() - 30 * 86_400_000);
  const to = options.to ?? clock.now();

  if (type === 'tickets') {
    const tickets = await prisma.ticket.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(options.departmentId ? { departmentId: options.departmentId } : {}),
      },
      select: {
        referenceNumber: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        reopenedCount: true,
        remindersSentInCycle: true,
        department: { select: { name: true } },
        category: { select: { name: true } },
        student: { select: { studentId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = tickets.map((ticket) => ({
      reference: ticket.referenceNumber,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category.name,
      department: ticket.department.name,
      studentId: ticket.student.studentId ?? '',
      createdAt: ticket.createdAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? '',
      reopened: ticket.reopenedCount,
      reminders: ticket.remindersSentInCycle,
    }));
    return format === 'json' ? { rows } : { csv: toCsv(rows) };
  }

  if (type === 'notifications') {
    const notifications = await prisma.notification.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        type: true,
        status: true,
        attemptCount: true,
        sentAt: true,
        createdAt: true,
        recipient: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const rows = notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      status: notification.status,
      attempts: notification.attemptCount,
      recipient: notification.recipient.email,
      createdAt: notification.createdAt.toISOString(),
      sentAt: notification.sentAt?.toISOString() ?? '',
    }));
    return format === 'json' ? { rows } : { csv: toCsv(rows) };
  }

  if (type === 'audit') {
    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const rows = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? '',
      actor: log.actor?.email ?? '',
      createdAt: log.createdAt.toISOString(),
    }));
    return format === 'json' ? { rows } : { csv: toCsv(rows) };
  }

  const analytics = await prisma.ticket.groupBy({
    by: ['departmentId', 'status'],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true },
  });
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const nameById = new Map(departments.map((department) => [department.id, department.name]));
  const rows = analytics.map((entry) => ({
    department: nameById.get(entry.departmentId) ?? entry.departmentId,
    status: entry.status,
    count: entry._count._all,
  }));
  return format === 'json' ? { rows } : { csv: toCsv(rows) };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(','));
  }
  return lines.join('\n');
}

export const ASSIGNABLE_ROLE_NAMES = Object.keys(ASSIGNABLE_ROLES) as RoleName[];

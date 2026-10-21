import type { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { paginate, resolvePagination } from '../../lib/pagination';
import type { AuthContext } from '../auth/auth.types';
import { listTickets } from '../tickets/ticket.service';

export async function listDepartments(auth: AuthContext, includeInactive = false) {
  const canManage = auth.permissions.has('department:manage');
  const departments = await prisma.department.findMany({
    where: includeInactive && canManage ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      serviceTarget: true,
      _count: { select: { memberships: { where: { isActive: true } }, categories: true } },
    },
  });

  const isAdmin = auth.permissions.has('analytics:global');
  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    contactEmail: department.contactEmail,
    isActive: department.isActive,
    isFallbackQueue: department.isFallbackQueue,
    sortOrder: department.sortOrder,
    staffCount: department._count.memberships,
    categoryCount: department._count.categories,
    serviceTarget: department.serviceTarget
      ? {
          firstResponseMinutes: department.serviceTarget.firstResponseMinutes,
          resolutionMinutes: department.serviceTarget.resolutionMinutes,
          reminderIntervalMinutes: department.serviceTarget.reminderIntervalMinutes,
          maxReminders: department.serviceTarget.maxReminders,
          escalationAfterReminders: department.serviceTarget.escalationAfterReminders,
          businessHoursOnly: department.serviceTarget.businessHoursOnly,
        }
      : null,
    ...(isAdmin ? { hasAccess: true } : {}),
  }));
}

export async function listCategories(auth: AuthContext, includeInactive = false) {
  const canManage = auth.permissions.has('category:manage');
  const categories = await prisma.category.findMany({
    where: includeInactive && canManage ? {} : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { department: { select: { id: true, name: true } } },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    departmentId: category.departmentId,
    departmentName: category.department?.name ?? null,
    defaultPriority: category.defaultPriority,
    isActive: category.isActive,
    isSensitive: category.isSensitive,
    sortOrder: category.sortOrder,
  }));
}

export async function listDepartmentStaff(departmentId: string) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!department) throw notFound('Department not found.');

  const memberships = await prisma.departmentMembership.findMany({
    where: { departmentId, isActive: true },
    orderBy: [{ departmentRole: 'asc' }, { user: { fullName: 'asc' } }],
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          accountStatus: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      },
    },
  });

  return {
    department,
    staff: memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.user.id,
      fullName: membership.user.fullName,
      email: membership.user.email,
      accountStatus: membership.user.accountStatus,
      departmentRole: membership.departmentRole,
      roles: membership.user.roles.map((role) => role.role.name),
    })),
  };
}

function assertDepartmentScope(auth: AuthContext, departmentId: string): void {
  if (auth.permissions.has('analytics:global')) return;
  const allowed = auth.departments.some(
    (scope) => scope.departmentId === departmentId && scope.isActive,
  );
  if (!allowed) throw forbidden('You do not have access to this department.');
}

export async function getDepartmentTickets(
  auth: AuthContext,
  departmentId: string,
  options: Parameters<typeof listTickets>[1],
) {
  assertDepartmentScope(auth, departmentId);
  return listTickets(auth, { ...options, departmentId });
}

export interface DepartmentMetrics {
  departmentId: string;
  departmentName: string;
  total: number;
  open: number;
  unassigned: number;
  overdue: number;
  escalated: number;
  resolved: number;
  reopened: number;
  awaitingStudent: number;
  averageFirstResponseMinutes: number | null;
  averageResolutionMinutes: number | null;
  resolvedWithinTarget: number;
  satisfactionAverage: number | null;
  satisfactionCount: number;
  volumeByStatus: Record<string, number>;
  volumeByPriority: Record<string, number>;
}

const OPEN_STATUSES: TicketStatus[] = [
  'SUBMITTED',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'AWAITING_STUDENT',
  'AWAITING_EXTERNAL',
  'ESCALATED',
  'REOPENED',
];

/**
 * Departmental performance metrics. Comparisons are made against the
 * department's own service targets rather than raw counts alone (PRD §14.2).
 */
export async function getDepartmentAnalytics(
  auth: AuthContext,
  departmentId: string,
  options: { from?: Date | undefined; to?: Date | undefined } = {},
): Promise<DepartmentMetrics> {
  assertDepartmentScope(auth, departmentId);

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, serviceTarget: true },
  });
  if (!department) throw notFound('Department not found.');

  const where: Prisma.TicketWhereInput = {
    departmentId,
    ...(options.from || options.to
      ? {
          createdAt: {
            ...(options.from ? { gte: options.from } : {}),
            ...(options.to ? { lte: options.to } : {}),
          },
        }
      : {}),
  };

  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      status: true,
      priority: true,
      createdAt: true,
      assignedAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      reopenedCount: true,
      firstResponseOverdue: true,
      resolutionOverdue: true,
      escalationLevel: true,
      assignedToId: true,
    },
  });

  const feedback = await prisma.studentFeedback.findMany({
    where: {
      ticket: {
        departmentId,
        ...(where.createdAt ? { ticket: { createdAt: where.createdAt } } : {}),
      },
    },
    select: { rating: true },
  });

  const now = clock.now();
  const resolutionTargetMinutes = department.serviceTarget?.resolutionMinutes ?? 4320;

  const firstResponseDurations: number[] = [];
  const resolutionDurations: number[] = [];
  const volumeByStatus: Record<string, number> = {};
  const volumeByPriority: Record<string, number> = {};
  let unassigned = 0;
  let overdue = 0;
  let escalated = 0;
  let resolved = 0;
  let reopened = 0;
  let awaitingStudent = 0;
  let resolvedWithinTarget = 0;

  for (const ticket of tickets) {
    volumeByStatus[ticket.status] = (volumeByStatus[ticket.status] ?? 0) + 1;
    volumeByPriority[ticket.priority] = (volumeByPriority[ticket.priority] ?? 0) + 1;
    if (!ticket.assignedToId) unassigned += 1;
    if (ticket.firstResponseOverdue || ticket.resolutionOverdue) overdue += 1;
    if (ticket.escalationLevel > 0) escalated += 1;
    if (ticket.reopenedCount > 0) reopened += 1;
    if (ticket.status === 'AWAITING_STUDENT') awaitingStudent += 1;
    if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      resolved += 1;
      if (ticket.resolvedAt && ticket.createdAt) {
        const minutes = (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 60_000;
        resolutionDurations.push(minutes);
        if (minutes <= resolutionTargetMinutes) resolvedWithinTarget += 1;
      }
    }
    if (ticket.firstResponseAt && ticket.createdAt) {
      firstResponseDurations.push(
        (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60_000,
      );
    }
    void now;
  }

  const average = (values: number[]): number | null =>
    values.length === 0
      ? null
      : Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;

  const satisfactionAverage =
    feedback.length === 0
      ? null
      : Math.round(
          (feedback.reduce((total, item) => total + item.rating, 0) / feedback.length) * 100,
        ) / 100;

  return {
    departmentId: department.id,
    departmentName: department.name,
    total: tickets.length,
    open: tickets.filter((ticket) => OPEN_STATUSES.includes(ticket.status)).length,
    unassigned,
    overdue,
    escalated,
    resolved,
    reopened,
    awaitingStudent,
    averageFirstResponseMinutes: average(firstResponseDurations),
    averageResolutionMinutes: average(resolutionDurations),
    resolvedWithinTarget,
    satisfactionAverage,
    satisfactionCount: feedback.length,
    volumeByStatus,
    volumeByPriority,
  };
}

/** System-wide metrics for the administrator dashboard (PRD §14.1). */
export async function getSystemDashboard(
  auth: AuthContext,
  options: { from?: Date | undefined } = {},
) {
  if (!auth.permissions.has('analytics:global')) {
    throw forbidden('Global analytics are restricted to administrators.');
  }

  const where: Prisma.TicketWhereInput = options.from ? { createdAt: { gte: options.from } } : {};

  const [total, open, unassigned, overdue, escalated, resolved, awaitingStudent, reopenedTickets] =
    await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: { in: OPEN_STATUSES } } }),
      prisma.ticket.count({ where: { ...where, assignedToId: null } }),
      prisma.ticket.count({
        where: { ...where, OR: [{ firstResponseOverdue: true }, { resolutionOverdue: true }] },
      }),
      prisma.ticket.count({ where: { ...where, escalationLevel: { gt: 0 } } }),
      prisma.ticket.count({ where: { ...where, status: { in: ['RESOLVED', 'CLOSED'] } } }),
      prisma.ticket.count({ where: { ...where, status: 'AWAITING_STUDENT' } }),
      prisma.ticket.count({ where: { ...where, reopenedCount: { gt: 0 } } }),
    ]);

  const responseTimes = await prisma.ticket.findMany({
    where: { ...where, firstResponseAt: { not: null } },
    select: { createdAt: true, firstResponseAt: true },
  });
  const resolutionTimes = await prisma.ticket.findMany({
    where: { ...where, resolvedAt: { not: null } },
    select: { createdAt: true, resolvedAt: true },
  });

  const average = (values: number[]): number | null =>
    values.length === 0
      ? null
      : Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10;

  const firstResponseDurations = responseTimes
    .filter((ticket) => ticket.firstResponseAt)
    .map((ticket) => (ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime()) / 60_000);
  const resolutionDurations = resolutionTimes
    .filter((ticket) => ticket.resolvedAt)
    .map((ticket) => (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime()) / 60_000);

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, serviceTarget: true },
  });

  const perDepartment = await Promise.all(
    departments.map(async (department) => ({
      id: department.id,
      name: department.name,
      total: await prisma.ticket.count({ where: { ...where, departmentId: department.id } }),
      open: await prisma.ticket.count({
        where: { ...where, departmentId: department.id, status: { in: OPEN_STATUSES } },
      }),
      unassigned: await prisma.ticket.count({
        where: { ...where, departmentId: department.id, assignedToId: null },
      }),
      overdue: await prisma.ticket.count({
        where: {
          ...where,
          departmentId: department.id,
          OR: [{ firstResponseOverdue: true }, { resolutionOverdue: true }],
        },
      }),
      resolutionTargetMinutes: department.serviceTarget?.resolutionMinutes ?? null,
    })),
  );

  const failedNotifications = await prisma.notification.count({ where: { status: 'FAILED' } });
  const pendingJobs = await prisma.job.count({ where: { status: 'PENDING' } });
  const failedJobs = await prisma.job.count({ where: { status: 'FAILED' } });

  return {
    totals: {
      total,
      open,
      unassigned,
      overdue,
      escalated,
      resolved,
      awaitingStudent,
      reopened: reopenedTickets,
      resolutionRate: total === 0 ? 0 : Math.round((resolved / total) * 1000) / 10,
    },
    timings: {
      averageFirstResponseMinutes: average(firstResponseDurations),
      averageResolutionMinutes: average(resolutionDurations),
    },
    departments: perDepartment,
    system: { failedNotifications, pendingJobs, failedJobs },
  };
}

/** Staff workload view for a department (PRD §13.1). */
export async function getStaffWorkload(auth: AuthContext, departmentId: string) {
  assertDepartmentScope(auth, departmentId);

  const memberships = await prisma.departmentMembership.findMany({
    where: { departmentId, isActive: true },
    select: { userId: true, user: { select: { fullName: true } } },
  });

  const workload = await Promise.all(
    memberships.map(async (membership) => {
      const [assigned, open, overdue, resolved] = await Promise.all([
        prisma.ticket.count({
          where: { assignedToId: membership.userId, status: { in: OPEN_STATUSES } },
        }),
        prisma.ticket.count({ where: { assignedToId: membership.userId } }),
        prisma.ticket.count({
          where: {
            assignedToId: membership.userId,
            OR: [{ firstResponseOverdue: true }, { resolutionOverdue: true }],
          },
        }),
        prisma.ticket.count({
          where: { assignedToId: membership.userId, status: { in: ['RESOLVED', 'CLOSED'] } },
        }),
      ]);
      return {
        userId: membership.userId,
        fullName: membership.user.fullName,
        open,
        overdue,
        resolved,
        assigned,
      };
    }),
  );

  return workload.sort((a, b) => b.open - a.open);
}

export async function upsertServiceTarget(
  departmentId: string,
  data: {
    firstResponseMinutes: number;
    resolutionMinutes: number;
    reminderIntervalMinutes: number;
    maxReminders: number;
    escalationAfterReminders: number;
    businessHoursOnly?: boolean | undefined;
    escalationUserId?: string | null | undefined;
  },
) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) throw notFound('Department not found.');
  if (data.firstResponseMinutes > data.resolutionMinutes) {
    throw badRequest('The first-response target must not exceed the resolution target.');
  }

  return prisma.departmentServiceTarget.upsert({
    where: { departmentId },
    create: {
      departmentId,
      firstResponseMinutes: data.firstResponseMinutes,
      resolutionMinutes: data.resolutionMinutes,
      reminderIntervalMinutes: data.reminderIntervalMinutes,
      maxReminders: data.maxReminders,
      escalationAfterReminders: data.escalationAfterReminders,
      businessHoursOnly: data.businessHoursOnly ?? false,
      escalationUserId: data.escalationUserId ?? null,
    },
    update: {
      firstResponseMinutes: data.firstResponseMinutes,
      resolutionMinutes: data.resolutionMinutes,
      reminderIntervalMinutes: data.reminderIntervalMinutes,
      maxReminders: data.maxReminders,
      escalationAfterReminders: data.escalationAfterReminders,
      ...(data.businessHoursOnly !== undefined
        ? { businessHoursOnly: data.businessHoursOnly }
        : {}),
      ...(data.escalationUserId !== undefined ? { escalationUserId: data.escalationUserId } : {}),
    },
  });
}

export async function listPaginatedDepartments(options: { page?: number; pageSize?: number }) {
  const { skip, take } = resolvePagination(options);
  const [items, total] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' }, skip, take }),
    prisma.department.count(),
  ]);
  return paginate(items, total, options);
}

export type TicketPriorityInput = TicketPriority;

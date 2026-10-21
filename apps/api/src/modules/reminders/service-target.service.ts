import { prisma } from '../../lib/prisma';
import { getConfig } from '../../config/env';
import { clock } from '../../config/clock';
import { addMinutes } from '../../config/clock';

export interface ServiceTarget {
  departmentId: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  reminderIntervalMinutes: number;
  maxReminders: number;
  escalationAfterReminders: number;
  businessHoursOnly: boolean;
  escalationUserId: string | null;
}

/**
 * Effective service target for a department: the persisted per-department
 * configuration when present, otherwise the platform defaults (PRD §10.2).
 */
export async function getServiceTarget(departmentId: string): Promise<ServiceTarget> {
  const config = getConfig();
  const record = await prisma.departmentServiceTarget.findUnique({
    where: { departmentId },
  });
  if (!record) {
    return {
      departmentId,
      firstResponseMinutes: config.SLA_FIRST_RESPONSE_MINUTES,
      resolutionMinutes: config.SLA_RESOLUTION_MINUTES,
      reminderIntervalMinutes: config.REMINDER_INTERVAL_MINUTES,
      maxReminders: config.MAX_REMINDERS,
      escalationAfterReminders: config.ESCALATION_AFTER_REMINDERS,
      businessHoursOnly: false,
      escalationUserId: null,
    };
  }
  return {
    departmentId,
    firstResponseMinutes: record.firstResponseMinutes,
    resolutionMinutes: record.resolutionMinutes,
    reminderIntervalMinutes: record.reminderIntervalMinutes,
    maxReminders: record.maxReminders,
    escalationAfterReminders: record.escalationAfterReminders,
    businessHoursOnly: record.businessHoursOnly,
    escalationUserId: record.escalationUserId,
  };
}

interface BusinessHourRow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

async function loadBusinessHours(departmentId: string): Promise<BusinessHourRow[]> {
  const rows = await prisma.departmentBusinessHour.findMany({
    where: { departmentId },
    select: { dayOfWeek: true, startMinute: true, endMinute: true },
  });
  return rows;
}

async function isHoliday(departmentId: string, date: Date): Promise<boolean> {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const holiday = await prisma.departmentHoliday.findFirst({
    where: { departmentId, holidayDate: day },
    select: { id: true },
  });
  return holiday !== null;
}

/**
 * Adds "business minutes" to a timestamp. When the department has no business
 * hours configured (or `businessHoursOnly` is disabled) the calculation is a
 * plain wall-clock offset.
 */
export async function addBusinessMinutes(
  departmentId: string,
  from: Date,
  minutes: number,
  businessHoursOnly: boolean,
): Promise<Date> {
  if (!businessHoursOnly) return addMinutes(from, minutes);

  const hours = await loadBusinessHours(departmentId);
  if (hours.length === 0) return addMinutes(from, minutes);

  const byDay = new Map<number, BusinessHourRow[]>();
  for (const row of hours) {
    const list = byDay.get(row.dayOfWeek) ?? [];
    list.push(row);
    byDay.set(row.dayOfWeek, list);
  }

  let remaining = minutes;
  let cursor = new Date(from.getTime());

  // Bound the search to 400 days so a misconfiguration cannot loop forever.
  for (let dayIndex = 0; dayIndex < 400 && remaining > 0; dayIndex += 1) {
    const dayOfWeek = cursor.getUTCDay();
    const windows = byDay.get(dayOfWeek) ?? [];
    if (windows.length > 0 && !(await isHoliday(departmentId, cursor))) {
      for (const window of windows) {
        const windowStart = new Date(cursor);
        windowStart.setUTCHours(0, window.startMinute, 0, 0);
        const windowEnd = new Date(cursor);
        windowEnd.setUTCHours(0, window.endMinute, 0, 0);
        if (cursor >= windowEnd) continue;
        if (cursor < windowStart) cursor = new Date(windowStart);
        const available = Math.floor((windowEnd.getTime() - cursor.getTime()) / 60_000);
        if (available <= 0) continue;
        const consumed = Math.min(available, remaining);
        remaining -= consumed;
        cursor = new Date(cursor.getTime() + consumed * 60_000);
        if (remaining <= 0) break;
      }
    }
    const nextDay = new Date(cursor.getTime());
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextDay.setUTCHours(0, 0, 0, 0);
    cursor = nextDay;
  }

  return cursor;
}

/** Service-target deadlines computed from the moment a ticket is assigned. */
export async function computeDeadlines(
  departmentId: string,
  from: Date,
): Promise<{ firstResponseDueAt: Date; resolutionDueAt: Date }> {
  const target = await getServiceTarget(departmentId);
  const firstResponseDueAt = await addBusinessMinutes(
    departmentId,
    from,
    target.firstResponseMinutes,
    target.businessHoursOnly,
  );
  const resolutionDueAt = await addBusinessMinutes(
    departmentId,
    from,
    target.resolutionMinutes,
    target.businessHoursOnly,
  );
  return { firstResponseDueAt, resolutionDueAt };
}

/** Resolve the person a ticket should be escalated to. */
export async function findEscalationTarget(departmentId: string): Promise<{
  userId: string | null;
  name: string | null;
}> {
  const target = await getServiceTarget(departmentId);
  if (target.escalationUserId) {
    const user = await prisma.user.findUnique({
      where: { id: target.escalationUserId },
      select: { id: true, fullName: true, accountStatus: true },
    });
    if (user && user.accountStatus === 'ACTIVE') {
      return { userId: user.id, name: user.fullName };
    }
  }

  const head = await prisma.departmentMembership.findFirst({
    where: {
      departmentId,
      departmentRole: 'HEAD',
      isActive: true,
      user: { accountStatus: 'ACTIVE' },
    },
    select: { userId: true, user: { select: { fullName: true } } },
  });
  if (head) return { userId: head.userId, name: head.user.fullName };

  const admin = await prisma.user.findFirst({
    where: {
      accountStatus: 'ACTIVE',
      roles: { some: { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } } } },
    },
    select: { id: true, fullName: true },
    orderBy: { createdAt: 'asc' },
  });
  return { userId: admin?.id ?? null, name: admin?.fullName ?? null };
}

/** Escalation targets for repeated reminders: the department head, then admins. */
export async function findEscalationRecipients(departmentId: string): Promise<string[]> {
  const recipients = new Set<string>();
  const target = await getServiceTarget(departmentId);
  if (target.escalationUserId) recipients.add(target.escalationUserId);

  const heads = await prisma.departmentMembership.findMany({
    where: {
      departmentId,
      departmentRole: 'HEAD',
      isActive: true,
      user: { accountStatus: 'ACTIVE' },
    },
    select: { userId: true },
  });
  for (const head of heads) recipients.add(head.userId);

  const admins = await prisma.user.findMany({
    where: {
      accountStatus: 'ACTIVE',
      roles: { some: { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } } } },
    },
    select: { id: true },
  });
  for (const admin of admins) recipients.add(admin.id);

  return [...recipients];
}

export function nowUtc(): Date {
  return clock.now();
}

import type { Ticket } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { getConfig } from '../../config/env';
import { enqueueJob } from '../../jobs/queue';
import { getServiceTarget } from './service-target.service';
import type { ReminderKind } from '@campus-resolve/shared';

export const REMINDER_KIND = {
  UNTOUCHED: 'UNTOUCHED',
  NEXT_ACTION: 'NEXT_ACTION',
} as const satisfies Record<ReminderKind, ReminderKind>;

/**
 * States in which the ticket is waiting for a member of staff to act.
 * `AWAITING_STUDENT` is excluded: the ball is with the student.
 */
const AWAITING_STAFF: ReadonlySet<string> = new Set([
  'SUBMITTED',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'AWAITING_EXTERNAL',
  'ESCALATED',
  'REOPENED',
]);

export interface TicketReminderState {
  status: Ticket['status'];
  assignedToId: string | null;
  reminderKind: ReminderKind | null;
  nextReminderAt: Date | null;
  remindersSentInCycle: number;
  reminderCycleStartedAt: Date | null;
}

/**
 * True when the ticket is waiting for staff and is not in a paused or
 * terminal state (PRD §9.2).
 */
export function requiresStaffAction(ticket: { status: Ticket['status'] }): boolean {
  return AWAITING_STAFF.has(ticket.status);
}

/** The assignee must still be an active staff member of the ticket's department. */
export async function hasActiveAssignee(ticket: {
  assignedToId: string | null;
  departmentId: string;
}): Promise<boolean> {
  if (!ticket.assignedToId) return false;
  const membership = await prisma.departmentMembership.findFirst({
    where: {
      userId: ticket.assignedToId,
      departmentId: ticket.departmentId,
      isActive: true,
      user: {
        accountStatus: 'ACTIVE',
        roles: { some: { role: { name: { in: ['OFFICER', 'DEPARTMENT_HEAD'] } } } },
      },
    },
    select: { id: true },
  });
  return membership !== null;
}

export function isUntouchedReminderEligible(ticket: TicketReminderState): boolean {
  if (ticket.reminderKind !== 'UNTOUCHED') return false;
  if (!requiresStaffAction(ticket)) return false;
  if (!ticket.assignedToId) return false;
  if (!ticket.nextReminderAt) return false;
  return true;
}

export function isNextActionReminderEligible(ticket: TicketReminderState): boolean {
  if (ticket.reminderKind !== 'NEXT_ACTION') return false;
  if (!requiresStaffAction(ticket)) return false;
  if (!ticket.assignedToId) return false;
  if (!ticket.nextReminderAt) return false;
  return true;
}

/**
 * Starts (or restarts) the untouched reminder cycle.
 * The next reminder is measured from the action timestamp, never from the
 * moment a worker happens to poll (PRD §9.1, §9.3).
 */
export async function startUntouchedCycle(
  ticketId: string,
  at: Date = clock.now(),
  intervalMinutes?: number,
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { departmentId: true },
  });
  if (!ticket) return;
  const target = await getServiceTarget(ticket.departmentId);
  const interval = intervalMinutes ?? target.reminderIntervalMinutes;

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      reminderKind: 'UNTOUCHED',
      reminderCycleStartedAt: at,
      nextReminderAt: new Date(at.getTime() + interval * 60_000),
      remindersSentInCycle: 0,
    },
  });
}

/**
 * Records a meaningful staff action.
 *
 * Qualifying actions: acknowledgement, meaningful public reply, substantive
 * internal note, moving to active investigation, recording a resolution or an
 * investigation step. Merely viewing a ticket never calls this function
 * (PRD §9.2).
 */
export async function markMeaningfulStaffAction(
  ticketId: string,
  at: Date = clock.now(),
  options: { kind?: 'UNTOUCHED' | 'NEXT_ACTION' | 'PAUSE' } = {},
): Promise<void> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, departmentId: true, status: true, assignedToId: true, reminderKind: true },
  });
  if (!ticket) return;

  const target = await getServiceTarget(ticket.departmentId);
  const interval = target.reminderIntervalMinutes;
  const paused = options.kind === 'PAUSE';
  const nextKind = options.kind ?? 'NEXT_ACTION';

  const data: Record<string, unknown> = {
    lastMeaningfulStaffActionAt: at,
    remindersSentInCycle: 0,
  };

  if (paused || !requiresStaffAction({ ...ticket, status: ticket.status })) {
    data.reminderKind = null;
    data.nextReminderAt = null;
  } else {
    data.reminderKind = nextKind;
    data.nextReminderAt = new Date(at.getTime() + interval * 60_000);
  }

  await prisma.ticket.update({ where: { id: ticketId }, data });
}

/** Stops all reminder activity for a ticket (resolution, closure, withdrawal). */
export async function pauseReminders(ticketId: string): Promise<void> {
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { reminderKind: null, nextReminderAt: null },
  });
}

/**
 * Schedules the two-hour reminder job for a ticket. The job carries the exact
 * due time so the interval is measured from the action, not from the poll.
 */
export async function scheduleReminderJob(
  ticketId: string,
  kind: ReminderKind,
  dueAt: Date,
  cycleKey: string,
): Promise<void> {
  await enqueueJob(
    'TICKET_REMINDER',
    { ticketId, kind, occurrenceKey: cycleKey, dueAt: dueAt.toISOString() },
    { dedupeKey: `reminder:${kind}:${cycleKey}` },
  );
}

/** Schedules the service-target jobs (first response + resolution). */
export async function scheduleServiceTargetJobs(
  ticketId: string,
  firstResponseDueAt: Date,
  resolutionDueAt: Date,
): Promise<void> {
  await enqueueJob(
    'SLA_FIRST_RESPONSE',
    { ticketId, dueAt: firstResponseDueAt.toISOString() },
    { dedupeKey: `sla-first-response:${ticketId}` },
  );
  await enqueueJob(
    'SLA_RESOLUTION',
    { ticketId, dueAt: resolutionDueAt.toISOString() },
    { dedupeKey: `sla-resolution:${ticketId}` },
  );
}

/** Cancels pending SLA jobs for a ticket that no longer needs them. */
export async function cancelServiceTargetJobs(ticketId: string): Promise<void> {
  await prisma.job.updateMany({
    where: {
      status: 'PENDING',
      payload: { path: ['ticketId'], equals: ticketId },
      type: { in: ['SLA_FIRST_RESPONSE', 'SLA_RESOLUTION'] },
    },
    data: { status: 'CANCELLED' },
  });
}

export function reminderIntervalMinutes(): number {
  return getConfig().REMINDER_INTERVAL_MINUTES;
}

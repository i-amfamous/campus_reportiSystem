import type { ReminderKind, TicketStatus } from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { logger } from '../../config/logger';
import { queueNotification } from '../../modules/notifications/notification.service';
import { getServiceTarget } from '../../modules/reminders/service-target.service';
import { hasActiveAssignee } from '../../modules/reminders/reminder.service';

export interface ReminderJobPayload {
  ticketId: string;
  kind: ReminderKind;
  occurrenceKey: string;
  dueAt: string;
}

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

/**
 * Sends the two-hour reminder for an untouched ticket.
 *
 * Safety properties (PRD §9.2 – §9.5):
 *  * the interval is measured from the action timestamp, not from the poll;
 *  * a ticket that is no longer eligible (resolved, closed, withdrawn,
 *    reassigned, or handled) is skipped;
 *  * the occurrence key is unique, so a repeated worker execution cannot send a
 *    second email for the same occurrence;
 *  * the reminder goes to the *current* assignee;
 *  * the result is recorded whether the send succeeds or fails.
 */
export async function handleReminderJob(payload: ReminderJobPayload): Promise<{
  sent: boolean;
  skipped: boolean;
  reason?: string;
}> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      assignedTo: { select: { id: true, fullName: true } },
    },
  });

  if (!ticket) return { sent: false, skipped: true, reason: 'Ticket not found' };

  const dueAtMs = new Date(payload.dueAt).getTime();

  if (ticket.reminderKind !== payload.kind) {
    return { sent: false, skipped: true, reason: 'Reminder cycle changed' };
  }
  if (!ticket.nextReminderAt) {
    return { sent: false, skipped: true, reason: 'Reminders are paused for this ticket' };
  }
  if (ticket.nextReminderAt.getTime() !== dueAtMs) {
    return {
      sent: false,
      skipped: true,
      reason: 'A newer action deadline superseded this occurrence',
    };
  }
  if (!AWAITING_STAFF.has(ticket.status)) {
    return { sent: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (!ticket.assignedToId || !ticket.assignedTo) {
    return { sent: false, skipped: true, reason: 'No responsible officer assigned' };
  }
  if (!(await hasActiveAssignee(ticket))) {
    return {
      sent: false,
      skipped: true,
      reason: 'Assignee is no longer an active officer of the department',
    };
  }

  const now = clock.now();

  // The unique occurrence key is the idempotency guard for the whole system.
  let occurrenceCreated = false;
  try {
    await prisma.reminderOccurrence.create({
      data: {
        ticketId: ticket.id,
        kind: payload.kind,
        occurrenceKey: payload.occurrenceKey,
        dueAt: new Date(dueAtMs),
        status: 'RUNNING',
        assignedOfficerId: ticket.assignedToId,
      },
    });
    occurrenceCreated = true;
  } catch (error) {
    const existing = await prisma.reminderOccurrence.findUnique({
      where: { occurrenceKey: payload.occurrenceKey },
    });
    if (existing) {
      if (existing.status === 'COMPLETED') {
        return { sent: false, skipped: true, reason: 'Reminder already sent for this occurrence' };
      }
      if (existing.status === 'RUNNING' && existing.assignedOfficerId === ticket.assignedToId) {
        // Another worker is handling this occurrence right now.
        return { sent: false, skipped: true, reason: 'Reminder already in progress' };
      }
    } else {
      throw error;
    }
  }

  const target = await getServiceTarget(ticket.departmentId);
  const remindersSent = ticket.remindersSentInCycle + 1;
  const reachedLimit = remindersSent > target.maxReminders;

  const notification = await queueNotification({
    recipientId: ticket.assignedToId,
    ticketId: ticket.id,
    type: 'STAFF_REMINDER_DUE',
    idempotencyKey: `reminder:${payload.occurrenceKey}`,
    payload: {
      referenceNumber: ticket.referenceNumber,
      status: ticket.status as TicketStatus,
      ticketSubject: ticket.subject,
      categoryName: ticket.category.name,
      departmentName: ticket.department.name,
      submittedAt: ticket.createdAt.toISOString(),
      assignedOfficerName: ticket.assignedTo?.fullName,
      nextAction:
        payload.kind === 'UNTOUCHED'
          ? 'Acknowledge the report, begin the investigation, or record the next action.'
          : 'Record the next action so the ticket does not breach its service target.',
      reminderKind: payload.kind,
    },
  });

  const nextReminderAt = reachedLimit
    ? null
    : new Date(now.getTime() + target.reminderIntervalMinutes * 60_000);

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        lastReminderSentAt: now,
        remindersSentInCycle: remindersSent,
        nextReminderAt,
      },
    }),
    prisma.reminderOccurrence.update({
      where: { occurrenceKey: payload.occurrenceKey },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        notificationId: notification.notification.id,
      },
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: 'REMINDER_SENT',
        newValue: String(remindersSent),
        reason: `${payload.kind === 'UNTOUCHED' ? 'Untouched-ticket' : 'Next-action'} reminder sent to the responsible officer.`,
      },
    }),
  ]);

  if (nextReminderAt) {
    const nextOccurrenceKey = `${ticket.id}:${payload.kind}:${nextReminderAt.toISOString()}`;
    await prisma.job.create({
      data: {
        type: 'TICKET_REMINDER',
        payload: {
          ticketId: ticket.id,
          kind: payload.kind,
          occurrenceKey: nextOccurrenceKey,
          dueAt: nextReminderAt.toISOString(),
        },
        dedupeKey: `reminder:${payload.kind}:${nextOccurrenceKey}`,
        runAt: nextReminderAt,
      },
    });
  }

  if (reachedLimit) {
    logger.warn('Reminder limit reached for ticket', { ticketId: ticket.id, remindersSent });
  }

  if (remindersSent >= target.escalationAfterReminders && target.escalationAfterReminders > 0) {
    await prisma.job.create({
      data: {
        type: 'ESCALATION',
        payload: {
          ticketId: ticket.id,
          level: ticket.escalationLevel + 1,
          reason: `${remindersSent} reminders were sent without a meaningful staff action.`,
          source: 'AUTO',
        },
        dedupeKey: `escalation:${ticket.id}:${ticket.escalationLevel + 1}`,
        runAt: now,
      },
    });
  }

  return { sent: true, skipped: !occurrenceCreated };
}

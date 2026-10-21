import { canTransition, type TicketStatus } from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { logger } from '../../config/logger';
import { queueNotification } from '../../modules/notifications/notification.service';
import {
  findEscalationRecipients,
  getServiceTarget,
} from '../../modules/reminders/service-target.service';

export interface EscalationJobPayload {
  ticketId: string;
  level: number;
  reason: string;
  source: 'AUTO' | 'MANUAL' | 'SLA';
}

const INACTIVE = new Set(['RESOLVED', 'CLOSED', 'WITHDRAWN']);

/**
 * Escalates a ticket to the department head and, when configured, an
 * administrator. Escalation keeps the original owner unless the escalation
 * explicitly reassigns it (PRD §10.4).
 */
export async function handleEscalationJob(payload: EscalationJobPayload): Promise<{
  escalated: boolean;
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
  if (!ticket) return { escalated: false, skipped: true, reason: 'Ticket not found' };
  if (INACTIVE.has(ticket.status)) {
    return { escalated: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (payload.source === 'AUTO' && ticket.escalationLevel >= payload.level) {
    return { escalated: false, skipped: true, reason: 'Already escalated to this level' };
  }

  const recipients = await findEscalationRecipients(ticket.departmentId);
  const now = clock.now();

  await prisma.$transaction(async (tx) => {
    const event = await tx.escalationEvent.create({
      data: {
        ticketId: ticket.id,
        level: payload.level,
        reason: payload.reason,
        source: payload.source,
        fromUserId: ticket.assignedToId,
        toUserId: recipients[0] ?? null,
        notifiedAt: now,
      },
    });

    const data: Record<string, unknown> = {
      escalatedAt: now,
      escalationLevel: payload.level,
    };
    if (canTransition(ticket.status as TicketStatus, 'ESCALATED')) {
      data.status = 'ESCALATED';
    }
    await tx.ticket.update({ where: { id: ticket.id }, data });

    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: 'ESCALATED',
        previousValue: ticket.status,
        newValue: (data.status as string | undefined) ?? ticket.status,
        reason: payload.reason,
      },
    });

    const payloadContext = {
      referenceNumber: ticket.referenceNumber,
      status: (data.status as TicketStatus | undefined) ?? (ticket.status as TicketStatus),
      ticketSubject: ticket.subject,
      categoryName: ticket.category.name,
      departmentName: ticket.department.name,
      submittedAt: ticket.createdAt.toISOString(),
      assignedOfficerName: ticket.assignedTo?.fullName,
      escalationLevel: payload.level,
    };

    for (const recipientId of recipients) {
      await queueNotification(
        {
          recipientId,
          ticketId: ticket.id,
          type: 'STAFF_TICKET_ESCALATED',
          idempotencyKey: `staff-escalated:${event.id}:${recipientId}`,
          payload: { ...payloadContext, note: payload.reason },
        },
        tx,
      );
    }

    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId: ticket.id,
        type: 'TICKET_ESCALATED',
        idempotencyKey: `ticket-escalated:${event.id}`,
        payload: { ...payloadContext, note: payload.reason },
      },
      tx,
    );
  });

  logger.warn('Ticket escalated', {
    ticketId: ticket.id,
    level: payload.level,
    recipients: recipients.length,
  });

  return { escalated: true, skipped: false };
}

/**
 * Flags a ticket whose first-response service target has been missed.
 * Runs independently of the untouched-ticket reminder (PRD §10.1).
 */
export async function handleFirstResponseJob(payload: { ticketId: string }): Promise<{
  breached: boolean;
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
  if (!ticket) return { breached: false, skipped: true, reason: 'Ticket not found' };
  if (INACTIVE.has(ticket.status)) {
    return { breached: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (ticket.firstResponseAt) {
    return { breached: false, skipped: true, reason: 'First response already recorded' };
  }
  if (ticket.firstResponseOverdue) {
    return { breached: false, skipped: true, reason: 'Already flagged as overdue' };
  }

  const target = await getServiceTarget(ticket.departmentId);

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { firstResponseOverdue: true },
    });
    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: 'SLA_BREACHED',
        newValue: 'FIRST_RESPONSE',
        reason: `First response target of ${target.firstResponseMinutes} minutes was exceeded.`,
      },
    });

    const context = {
      referenceNumber: ticket.referenceNumber,
      status: ticket.status as TicketStatus,
      ticketSubject: ticket.subject,
      categoryName: ticket.category.name,
      departmentName: ticket.department.name,
      submittedAt: ticket.createdAt.toISOString(),
      assignedOfficerName: ticket.assignedTo?.fullName,
      nextAction: 'Respond to the student — the first-response target has been exceeded.',
    };

    if (ticket.assignedToId) {
      await queueNotification(
        {
          recipientId: ticket.assignedToId,
          ticketId: ticket.id,
          type: 'STAFF_SLA_BREACHED',
          idempotencyKey: `sla-first-response:${ticket.id}`,
          payload: context,
        },
        tx,
      );
    }

    const heads = await tx.departmentMembership.findMany({
      where: { departmentId: ticket.departmentId, departmentRole: 'HEAD', isActive: true },
      select: { userId: true },
    });
    for (const head of heads) {
      await queueNotification(
        {
          recipientId: head.userId,
          ticketId: ticket.id,
          type: 'STAFF_SLA_BREACHED',
          idempotencyKey: `sla-first-response:${ticket.id}:${head.userId}`,
          payload: context,
        },
        tx,
      );
    }
  });

  return { breached: true, skipped: false };
}

/**
 * Flags a ticket whose resolution service target has been missed and escalates
 * it to the department head (PRD §10.1).
 */
export async function handleResolutionJob(payload: { ticketId: string }): Promise<{
  breached: boolean;
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
  if (!ticket) return { breached: false, skipped: true, reason: 'Ticket not found' };
  if (INACTIVE.has(ticket.status)) {
    return { breached: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (ticket.resolutionOverdue) {
    return { breached: false, skipped: true, reason: 'Already flagged as overdue' };
  }

  const target = await getServiceTarget(ticket.departmentId);

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { resolutionOverdue: true },
    });
    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: 'SLA_BREACHED',
        newValue: 'RESOLUTION',
        reason: `Resolution target of ${target.resolutionMinutes} minutes was exceeded.`,
      },
    });
  });

  await handleEscalationJob({
    ticketId: ticket.id,
    level: ticket.escalationLevel + 1,
    reason: `The resolution service target of ${target.resolutionMinutes} minutes was exceeded.`,
    source: 'SLA',
  });

  logger.warn('Resolution service target breached', { ticketId: ticket.id });

  return { breached: true, skipped: false };
}

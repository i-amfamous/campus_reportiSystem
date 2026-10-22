import type { Prisma, Ticket } from '@prisma/client';
import {
  STATUS_LABELS,
  canTransition,
  formatReference,
  isInactiveStatus,
  type TicketPriority,
  type TicketStatus,
} from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { getConfig } from '../../config/env';
import { badRequest, conflict, forbidden, invalidTransition, notFound } from '../../lib/errors';
import { paginate, resolvePagination, type PaginationOptions } from '../../lib/pagination';
import { queueNotification } from '../notifications/notification.service';
import { computeDeadlines, getServiceTarget } from '../reminders/service-target.service';
import { resolveRouting } from './routing.service';
import type { AuthContext } from '../auth/auth.types';
import * as policy from './ticket.policy';

/** An internal note shorter than this is not considered a substantive update. */
export const MIN_SUBSTANTIVE_NOTE_LENGTH = 10;

type Tx = Prisma.TransactionClient;

export interface CreateTicketInput {
  categoryId: string;
  departmentId: string;
  assignedToId?: string | null | undefined;
  useTriageQueue?: boolean | undefined;
  subject: string;
  description: string;
  priority?: TicketPriority | undefined;
  courseCode?: string | undefined;
  courseTitle?: string | undefined;
  semester?: string | undefined;
  assessmentReference?: string | undefined;
  transactionReference?: string | undefined;
  preferredContactMethod?: string | undefined;
  studentEmail?: string | undefined;
}

/** Atomically increments the yearly counter and returns a unique reference. */
async function nextReference(tx: Tx): Promise<string> {
  const year = clock.now().getUTCFullYear();
  const name = `ticket_reference_${year}`;
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    INSERT INTO counters (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
    RETURNING value;
  `;
  const sequence = Number(rows[0]?.value ?? 1);
  return formatReference(year, sequence);
}

/**
 * Schedules the reminder occurrence for a ticket.
 *
 * The occurrence key is derived from the exact deadline, so the same deadline
 * can never be scheduled twice and a superseded deadline is ignored by the
 * handler (PRD §9.3).
 */
async function scheduleReminderJob(
  tx: Tx,
  ticketId: string,
  kind: 'UNTOUCHED' | 'NEXT_ACTION',
  dueAt: Date,
): Promise<void> {
  const occurrenceKey = `${ticketId}:${kind}:${dueAt.toISOString()}`;
  await tx.job.upsert({
    where: { dedupeKey: `reminder:${kind}:${occurrenceKey}` },
    create: {
      type: 'TICKET_REMINDER',
      payload: { ticketId, kind, occurrenceKey, dueAt: dueAt.toISOString() },
      dedupeKey: `reminder:${kind}:${occurrenceKey}`,
      runAt: dueAt,
    },
    update: {},
  });
}

async function writeHistory(
  tx: Tx,
  data: {
    ticketId: string;
    actorId: string | null;
    actionType:
      | 'CREATED'
      | 'STATUS_CHANGED'
      | 'ASSIGNED'
      | 'REASSIGNED'
      | 'PRIORITY_CHANGED'
      | 'ESCALATED'
      | 'RESOLVED'
      | 'REOPENED'
      | 'CLOSED'
      | 'WITHDRAWN'
      | 'MESSAGE_ADDED'
      | 'NOTE_ADDED'
      | 'ATTACHMENT_ADDED'
      | 'FEEDBACK_ADDED'
      | 'INFORMATION_REQUESTED'
      | 'REMINDER_SENT'
      | 'SLA_BREACHED'
      | 'TRANSFERRED';
    previousValue?: string | null | undefined;
    newValue?: string | null | undefined;
    reason?: string | null | undefined;
    metadata?: Prisma.InputJsonValue | undefined;
  },
) {
  return tx.ticketHistory.create({
    data: {
      ticketId: data.ticketId,
      actorId: data.actorId,
      actionType: data.actionType,
      previousValue: data.previousValue ?? null,
      newValue: data.newValue ?? null,
      reason: data.reason ?? null,
      metadata: data.metadata ?? undefined,
    },
  });
}

type TicketPayloadContext = {
  referenceNumber: string;
  status: TicketStatus;
  ticketSubject: string;
  categoryName: string;
  departmentName: string;
  submittedAt: string;
  assignedOfficerName?: string;
};

async function buildPayloadContext(
  tx: Tx,
  ticket: {
    id: string;
    referenceNumber: string;
    status: TicketStatus;
    subject: string;
    createdAt: Date;
    categoryId: string;
    departmentId: string;
    assignedToId: string | null;
  },
): Promise<TicketPayloadContext> {
  const [category, department, assignee] = await Promise.all([
    tx.category.findUnique({ where: { id: ticket.categoryId }, select: { name: true } }),
    tx.department.findUnique({ where: { id: ticket.departmentId }, select: { name: true } }),
    ticket.assignedToId
      ? tx.user.findUnique({ where: { id: ticket.assignedToId }, select: { fullName: true } })
      : Promise.resolve(null),
  ]);

  return {
    referenceNumber: ticket.referenceNumber,
    status: ticket.status,
    ticketSubject: ticket.subject,
    categoryName: category?.name ?? 'General',
    departmentName: department?.name ?? 'Unassigned',
    submittedAt: ticket.createdAt.toISOString(),
    assignedOfficerName: assignee?.fullName,
  };
}

/**
 * Creates a ticket.
 *
 * The ticket, its history, its notifications and its scheduled jobs are
 * written in a single transaction: a failure never leaves a half-created
 * report, and a successful submission is never lost because an email failed
 * (PRD §7.3, §8, §21).
 */
export async function createTicket(auth: AuthContext, input: CreateTicketInput): Promise<Ticket> {
  const config = getConfig();
  const now = clock.now();

  const routing = await resolveRouting({
    categoryId: input.categoryId,
    departmentId: input.departmentId,
    requestedOfficerId: input.assignedToId ?? null,
    useTriageQueue: input.useTriageQueue ?? false,
    allowStudentOfficerSelection: true,
  });

  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { defaultPriority: true },
  });

  const priority = input.priority ?? category?.defaultPriority ?? 'NORMAL';
  const status: TicketStatus = routing.assignedToId ? 'ASSIGNED' : 'AWAITING_ASSIGNMENT';
  const serviceTarget = await getServiceTarget(routing.departmentId);
  const deadlines = routing.assignedToId
    ? await computeDeadlines(routing.departmentId, now)
    : { firstResponseDueAt: null, resolutionDueAt: null };

  const ticket = await prisma.$transaction(async (tx) => {
    const referenceNumber = await nextReference(tx);

    const created = await tx.ticket.create({
      data: {
        referenceNumber,
        studentId: auth.userId,
        categoryId: input.categoryId,
        departmentId: routing.departmentId,
        assignedToId: routing.assignedToId,
        subject: input.subject,
        description: input.description,
        status,
        priority,
        source: routing.source,
        courseCode: input.courseCode ?? null,
        courseTitle: input.courseTitle ?? null,
        semester: input.semester ?? null,
        assessmentReference: input.assessmentReference ?? null,
        transactionReference: input.transactionReference ?? null,
        preferredContactMethod: input.preferredContactMethod ?? null,
        studentEmail: input.studentEmail ?? null,
        assignedAt: routing.assignedToId ? now : null,
        lastMeaningfulStaffActionAt: routing.assignedToId ? now : null,
        reminderCycleStartedAt: routing.assignedToId ? now : null,
        reminderKind: routing.assignedToId ? 'UNTOUCHED' : null,
        nextReminderAt: routing.assignedToId
          ? new Date(now.getTime() + serviceTarget.reminderIntervalMinutes * 60_000)
          : null,
        firstResponseDueAt: deadlines.firstResponseDueAt,
        resolutionDueAt: deadlines.resolutionDueAt,
      },
    });

    const history = await writeHistory(tx, {
      ticketId: created.id,
      actorId: auth.userId,
      actionType: 'CREATED',
      newValue: referenceNumber,
      reason:
        routing.notes.length > 0
          ? routing.notes.join(' ')
          : routing.assignedToId
            ? 'Assigned directly to the selected officer.'
            : 'Sent to the department queue.',
      metadata: { status, priority, departmentId: routing.departmentId },
    });

    const payload = await buildPayloadContext(tx, created);

    await queueNotification(
      {
        recipientId: auth.userId,
        ticketId: created.id,
        type: 'TICKET_SUBMITTED',
        idempotencyKey: `ticket-submitted:${created.id}`,
        payload: { ...payload, nextAction: 'A department officer will acknowledge your report.' },
      },
      tx,
    );

    if (routing.assignedToId) {
      await queueNotification(
        {
          recipientId: routing.assignedToId,
          ticketId: created.id,
          type: 'STAFF_TICKET_ASSIGNED',
          idempotencyKey: `staff-assigned:${created.id}:${routing.assignedToId}`,
          payload: { ...payload, nextAction: 'Acknowledge the report to stop reminders.' },
        },
        tx,
      );
      await queueNotification(
        {
          recipientId: auth.userId,
          ticketId: created.id,
          type: 'TICKET_ASSIGNED',
          idempotencyKey: `ticket-assigned:${created.id}`,
          payload,
        },
        tx,
      );
      const firstReminderAt = new Date(
        now.getTime() + serviceTarget.reminderIntervalMinutes * 60_000,
      );
      await scheduleReminderJob(tx, created.id, 'UNTOUCHED', firstReminderAt);
    } else {
      // Unassigned tickets are routed to the department head for triage.
      const heads = await tx.departmentMembership.findMany({
        where: { departmentId: routing.departmentId, departmentRole: 'HEAD', isActive: true },
        select: { userId: true },
      });
      for (const head of heads) {
        await queueNotification(
          {
            recipientId: head.userId,
            ticketId: created.id,
            type: 'STAFF_TICKET_QUEUED',
            idempotencyKey: `staff-queued:${created.id}:${head.userId}`,
            payload,
          },
          tx,
        );
      }
    }

    if (deadlines.firstResponseDueAt && deadlines.resolutionDueAt) {
      await tx.job.create({
        data: {
          type: 'SLA_FIRST_RESPONSE',
          payload: { ticketId: created.id, dueAt: deadlines.firstResponseDueAt.toISOString() },
          dedupeKey: `sla-first-response:${created.id}`,
          runAt: deadlines.firstResponseDueAt,
        },
      });
      await tx.job.create({
        data: {
          type: 'SLA_RESOLUTION',
          payload: { ticketId: created.id, dueAt: deadlines.resolutionDueAt.toISOString() },
          dedupeKey: `sla-resolution:${created.id}`,
          runAt: deadlines.resolutionDueAt,
        },
      });
    }

    return { created, history };
  });

  void config;
  return ticket.created;
}

export interface TicketScopeFilter {
  where: Prisma.TicketWhereInput;
}

export function buildTicketScopeFilter(auth: AuthContext): Prisma.TicketWhereInput {
  if (policy.isGlobalAdmin(auth)) return {};
  const departmentIds = auth.departments
    .filter((scope) => scope.isActive)
    .map((scope) => scope.departmentId);

  const staffConditions: Prisma.TicketWhereInput[] = [
    { assignedToId: auth.userId },
    ...(departmentIds.length > 0 ? [{ departmentId: { in: departmentIds } }] : []),
  ];

  return {
    OR: [
      { studentId: auth.userId },
      ...(auth.permissions.has('ticket:read:department') ? staffConditions : []),
      ...(auth.permissions.has('ticket:read:any') ? [{}] : []),
    ],
  };
}

export interface ListTicketsOptions extends PaginationOptions {
  status?: TicketStatus | TicketStatus[] | undefined;
  categoryId?: string | undefined;
  departmentId?: string | undefined;
  assignedToId?: string | undefined;
  priority?: TicketPriority | TicketPriority[] | undefined;
  search?: string | undefined;
  overdue?: boolean | undefined;
  unassigned?: boolean | undefined;
  awaitingStudent?: boolean | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sort?: 'createdAt' | 'updatedAt' | 'referenceNumber' | 'priority' | undefined;
  order?: 'asc' | 'desc' | undefined;
}

export async function listTickets(auth: AuthContext, options: ListTicketsOptions) {
  const { skip, take } = resolvePagination(options);

  const scope = buildTicketScopeFilter(auth);
  const where: Prisma.TicketWhereInput = {
    AND: [
      scope,
      options.status
        ? { status: { in: Array.isArray(options.status) ? options.status : [options.status] } }
        : {},
      options.priority
        ? {
            priority: {
              in: Array.isArray(options.priority) ? options.priority : [options.priority],
            },
          }
        : {},
      options.categoryId ? { categoryId: options.categoryId } : {},
      options.departmentId ? { departmentId: options.departmentId } : {},
      options.assignedToId ? { assignedToId: options.assignedToId } : {},
      options.unassigned ? { assignedToId: null } : {},
      options.awaitingStudent ? { status: 'AWAITING_STUDENT' } : {},
      options.overdue
        ? {
            OR: [
              { firstResponseOverdue: true },
              { resolutionOverdue: true },
              { status: 'ESCALATED' },
            ],
          }
        : {},
      options.from ? { createdAt: { gte: options.from } } : {},
      options.to ? { createdAt: { lte: options.to } } : {},
      options.search
        ? {
            OR: [
              { subject: { contains: options.search, mode: 'insensitive' } },
              { referenceNumber: { contains: options.search, mode: 'insensitive' } },
              { description: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };

  const sortField = options.sort ?? 'createdAt';
  const order = options.order ?? 'desc';

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { [sortField]: order },
      skip,
      take,
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  return paginate(items.map(toTicketSummary), total, options);
}

export function toTicketSummary(ticket: {
  id: string;
  referenceNumber: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  reopenedCount: number;
  remindersSentInCycle: number;
  nextReminderAt: Date | null;
  firstResponseOverdue: boolean;
  resolutionOverdue: boolean;
  escalationLevel: number;
  category?: { id: string; name: string } | undefined;
  department?: { id: string; name: string } | undefined;
  assignedTo?: { id: string; fullName: true } | { id: string; fullName: string } | null | undefined;
}) {
  return {
    id: ticket.id,
    referenceNumber: ticket.referenceNumber,
    subject: ticket.subject,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    priority: ticket.priority,
    category: ticket.category ?? null,
    department: ticket.department ?? null,
    assignedTo: ticket.assignedTo
      ? { id: ticket.assignedTo.id, fullName: ticket.assignedTo.fullName }
      : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    reopenedCount: ticket.reopenedCount,
    remindersSentInCycle: ticket.remindersSentInCycle,
    nextReminderAt: ticket.nextReminderAt,
    overdue: ticket.firstResponseOverdue || ticket.resolutionOverdue,
    escalationLevel: ticket.escalationLevel,
  };
}

export interface TicketDetail {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  statusLabel: string;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  assignedAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  escalatedAt: Date | null;
  resolutionSummary: string | null;
  reopenedCount: number;
  remindersSentInCycle: number;
  nextReminderAt: Date | null;
  lastReminderSentAt: Date | null;
  lastMeaningfulStaffActionAt: Date | null;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstResponseOverdue: boolean;
  resolutionOverdue: boolean;
  escalationLevel: number;
  courseCode: string | null;
  courseTitle: string | null;
  semester: string | null;
  assessmentReference: string | null;
  transactionReference: string | null;
  preferredContactMethod: string | null;
  student: { id: string; fullName: string; studentId: string | null; email: string };
  category: { id: string; name: string };
  department: { id: string; name: string };
  assignedTo: { id: string; fullName: string } | null;
  messages: Array<{
    id: string;
    body: string;
    visibility: 'PUBLIC' | 'INTERNAL';
    createdAt: Date;
    sender: { id: string; fullName: string; isStaff: boolean };
  }>;
  attachments: Array<{
    id: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    createdAt: Date;
    uploadedBy: { id: string; fullName: string };
  }>;
  history: Array<{
    id: string;
    actionType: string;
    previousValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: Date;
    actor: { id: string; fullName: string } | null;
  }>;
  feedback: { rating: number; comment: string | null; createdAt: Date } | null;
}

export async function getTicketForUser(auth: AuthContext, ticketId: string): Promise<TicketDetail> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      student: { select: { id: true, fullName: true, studentId: true, email: true } },
      category: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, fullName: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              roles: { select: { role: { select: { name: true } } } },
            },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: 'asc' },
        include: { uploadedBy: { select: { id: true, fullName: true } } },
      },
      history: {
        orderBy: { createdAt: 'asc' },
        include: { actor: { select: { id: true, fullName: true } } },
      },
      feedback: true,
    },
  });

  if (!ticket) throw notFound('Ticket not found.');
  if (!policy.canViewTicket(auth, ticket))
    throw forbidden('You do not have access to this ticket.');

  const isStudentOwner = policy.isOwner(auth, ticket);
  const canSeeInternal = !isStudentOwner && policy.canAddInternalNote(auth, ticket);

  return {
    id: ticket.id,
    referenceNumber: ticket.referenceNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    assignedAt: ticket.assignedAt,
    firstResponseAt: ticket.firstResponseAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    escalatedAt: ticket.escalatedAt,
    resolutionSummary: ticket.resolutionSummary,
    reopenedCount: ticket.reopenedCount,
    remindersSentInCycle: ticket.remindersSentInCycle,
    nextReminderAt: ticket.nextReminderAt,
    lastReminderSentAt: ticket.lastReminderSentAt,
    lastMeaningfulStaffActionAt: ticket.lastMeaningfulStaffActionAt,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    firstResponseOverdue: ticket.firstResponseOverdue,
    resolutionOverdue: ticket.resolutionOverdue,
    escalationLevel: ticket.escalationLevel,
    courseCode: ticket.courseCode,
    courseTitle: ticket.courseTitle,
    semester: ticket.semester,
    assessmentReference: ticket.assessmentReference,
    transactionReference: ticket.transactionReference,
    preferredContactMethod: ticket.preferredContactMethod,
    student: ticket.student,
    category: ticket.category,
    department: ticket.department,
    assignedTo: ticket.assignedTo,
    messages: ticket.messages
      .filter((message) => canSeeInternal || message.visibility === 'PUBLIC')
      .map((message) => ({
        id: message.id,
        body: message.messageBody,
        visibility: message.visibility,
        createdAt: message.createdAt,
        sender: {
          id: message.sender.id,
          fullName: message.sender.fullName,
          isStaff: message.sender.roles.some((role) => role.role.name !== 'STUDENT'),
        },
      })),
    attachments: ticket.attachments.map((attachment) => ({
      id: attachment.id,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
      uploadedBy: attachment.uploadedBy,
    })),
    history: ticket.history.map((entry) => ({
      id: entry.id,
      actionType: entry.actionType,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      reason: entry.reason,
      createdAt: entry.createdAt,
      actor: entry.actor ? { id: entry.actor.id, fullName: entry.actor.fullName } : null,
    })),
    feedback: ticket.feedback
      ? {
          rating: ticket.feedback.rating,
          comment: ticket.feedback.comment,
          createdAt: ticket.feedback.createdAt,
        }
      : null,
  };
}

async function loadTicketForAction(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound('Ticket not found.');
  return ticket;
}

/**
 * Records a student-visible reply.
 * Staff replies are a meaningful action and reset the untouched-timer.
 */
export async function postMessage(
  auth: AuthContext,
  ticketId: string,
  body: string,
): Promise<{ id: string; createdAt: Date }> {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canReply(auth, ticket)) throw forbidden('You cannot reply on this ticket.');
  if (isInactiveStatus(ticket.status)) {
    throw conflict('This ticket is closed and cannot receive new messages.');
  }

  const now = clock.now();
  const isStaff = policy.canAddInternalNote(auth, ticket) && !policy.isOwner(auth, ticket);

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: {
        ticketId,
        senderId: auth.userId,
        messageBody: body,
        visibility: 'PUBLIC',
      },
    });

    await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'MESSAGE_ADDED',
      reason: body.slice(0, 500),
    });

    const payload = await buildPayloadContext(tx, ticket);

    if (isStaff) {
      await applyMeaningfulStaffAction(
        tx,
        ticket,
        auth,
        now,
        'A staff member replied on the ticket.',
      );
      if (!ticket.firstResponseAt) {
        await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: now } });
      }
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: 'TICKET_REPLY',
          idempotencyKey: `ticket-reply:${created.id}`,
          payload: { ...payload, actorName: auth.fullName, messageBody: body },
        },
        tx,
      );
    } else {
      // A student reply puts the ticket back in the staff's court.
      const studentReplyReminderAt = ticket.assignedToId
        ? new Date(
            now.getTime() +
              (await getServiceTarget(ticket.departmentId)).reminderIntervalMinutes * 60_000,
          )
        : null;
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          lastStudentReplyAt: now,
          status: ticket.status === 'AWAITING_STUDENT' ? 'IN_PROGRESS' : ticket.status,
          reminderKind: ticket.assignedToId ? 'UNTOUCHED' : null,
          reminderCycleStartedAt: ticket.assignedToId ? now : null,
          nextReminderAt: studentReplyReminderAt,
          remindersSentInCycle: 0,
        },
      });
      if (studentReplyReminderAt) {
        await scheduleReminderJob(tx, ticketId, 'UNTOUCHED', studentReplyReminderAt);
      }
      if (ticket.assignedToId) {
        await queueNotification(
          {
            recipientId: ticket.assignedToId,
            ticketId,
            type: 'STAFF_TICKET_REPLIED',
            idempotencyKey: `staff-replied:${created.id}`,
            payload: { ...payload, messageBody: body },
          },
          tx,
        );
      }
    }

    return created;
  });

  return { id: message.id, createdAt: message.createdAt };
}

/**
 * Adds an internal note. Internal notes are never returned to students and
 * never emailed to them (PRD §7.3, §11).
 */
export async function postInternalNote(
  auth: AuthContext,
  ticketId: string,
  body: string,
): Promise<{ id: string; createdAt: Date; substantive: boolean }> {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canAddInternalNote(auth, ticket)) {
    throw forbidden('Only authorised staff can add internal notes.');
  }
  if (isInactiveStatus(ticket.status)) {
    throw conflict('This ticket is closed.');
  }

  const now = clock.now();
  const substantive = body.trim().length >= MIN_SUBSTANTIVE_NOTE_LENGTH;

  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: { ticketId, senderId: auth.userId, messageBody: body, visibility: 'INTERNAL' },
    });

    await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'NOTE_ADDED',
      reason: 'Internal note added.',
    });

    if (substantive) {
      await applyMeaningfulStaffAction(
        tx,
        ticket,
        auth,
        now,
        'A substantive internal note was recorded.',
      );
    }

    return created;
  });

  return { id: note.id, createdAt: note.createdAt, substantive };
}

/**
 * Shared routine for staff actions that reset the untouched-timer and record
 * the action timestamp.
 */
async function applyMeaningfulStaffAction(
  tx: Tx,
  ticket: Ticket,
  auth: AuthContext,
  now: Date,
  reason: string,
): Promise<void> {
  const target = await getServiceTarget(ticket.departmentId);
  const nextReminderAt = requiresStaffActionStatus(ticket.status)
    ? new Date(now.getTime() + target.reminderIntervalMinutes * 60_000)
    : null;

  await tx.ticket.update({
    where: { id: ticket.id },
    data: {
      lastMeaningfulStaffActionAt: now,
      remindersSentInCycle: 0,
      reminderKind: nextReminderAt ? 'NEXT_ACTION' : null,
      nextReminderAt,
    },
  });

  if (nextReminderAt) {
    await scheduleReminderJob(tx, ticket.id, 'NEXT_ACTION', nextReminderAt);
  }

  await writeHistory(tx, {
    ticketId: ticket.id,
    actorId: auth.userId,
    actionType: 'REMINDER_SENT',
    newValue: 'action-recorded',
    reason,
  });
}

function requiresStaffActionStatus(status: TicketStatus): boolean {
  return [
    'SUBMITTED',
    'AWAITING_ASSIGNMENT',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'AWAITING_EXTERNAL',
    'ESCALATED',
    'REOPENED',
  ].includes(status);
}

/** Acknowledges a ticket: the first qualifying staff action. */
export async function acknowledgeTicket(auth: AuthContext, ticketId: string) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canChangeStatus(auth, ticket)) {
    throw forbidden('You cannot acknowledge this ticket.');
  }
  if (
    !['ASSIGNED', 'AWAITING_ASSIGNMENT', 'SUBMITTED', 'ESCALATED', 'REOPENED'].includes(
      ticket.status,
    )
  ) {
    throw invalidTransition(
      `A ticket in status "${STATUS_LABELS[ticket.status]}" cannot be acknowledged.`,
    );
  }

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const target = await getServiceTarget(ticket.departmentId);
    const nextReminderAt = new Date(now.getTime() + target.reminderIntervalMinutes * 60_000);
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'ACKNOWLEDGED',
        firstResponseAt: ticket.firstResponseAt ?? now,
        lastMeaningfulStaffActionAt: now,
        remindersSentInCycle: 0,
        // Untouched-ticket reminders stop once the ticket is acknowledged; the
        // ticket stays monitored by the next-action and service-target timers.
        reminderKind: 'NEXT_ACTION',
        nextReminderAt,
      },
    });

    await scheduleReminderJob(tx, ticketId, 'NEXT_ACTION', nextReminderAt);

    await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'STATUS_CHANGED',
      previousValue: ticket.status,
      newValue: 'ACKNOWLEDGED',
      reason: 'Report acknowledged by the responsible officer.',
    });

    const payload = await buildPayloadContext(tx, { ...ticket, status: 'ACKNOWLEDGED' });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'TICKET_ACKNOWLEDGED',
        idempotencyKey: `ticket-ack:${ticketId}`,
        payload: { ...payload, actorName: auth.fullName },
      },
      tx,
    );
  });

  return getTicketForUser(auth, ticketId);
}

/** Changes the status of a ticket, validating the transition. */
export async function changeStatus(
  auth: AuthContext,
  ticketId: string,
  nextStatus: TicketStatus,
  note?: string,
) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canChangeStatus(auth, ticket)) {
    throw forbidden('You cannot change the status of this ticket.');
  }
  if (ticket.status === nextStatus) {
    throw conflict('The ticket already has that status.');
  }
  if (!canTransition(ticket.status, nextStatus)) {
    throw invalidTransition(
      `A ticket cannot move from "${STATUS_LABELS[ticket.status]}" to "${STATUS_LABELS[nextStatus]}".`,
    );
  }
  if (nextStatus === 'RESOLVED') {
    throw badRequest('Use the resolve action so a resolution summary is recorded.');
  }

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const target = await getServiceTarget(ticket.departmentId);
    const data: Prisma.TicketUpdateInput = { status: nextStatus };

    if (nextStatus === 'AWAITING_STUDENT') {
      data.reminderKind = null;
      data.nextReminderAt = null;
      data.lastStaffReplyAt = now;
    } else if (nextStatus === 'IN_PROGRESS' || nextStatus === 'AWAITING_EXTERNAL') {
      const nextReminderAt = ticket.assignedToId
        ? new Date(now.getTime() + target.reminderIntervalMinutes * 60_000)
        : null;
      data.lastMeaningfulStaffActionAt = now;
      data.remindersSentInCycle = 0;
      data.reminderKind = nextReminderAt ? 'NEXT_ACTION' : null;
      data.nextReminderAt = nextReminderAt;
      if (!ticket.firstResponseAt) data.firstResponseAt = now;
      if (nextReminderAt) {
        await scheduleReminderJob(tx, ticketId, 'NEXT_ACTION', nextReminderAt);
      }
    }

    await tx.ticket.update({ where: { id: ticketId }, data });

    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'STATUS_CHANGED',
      previousValue: ticket.status,
      newValue: nextStatus,
      reason: note ?? null,
    });

    const payload = await buildPayloadContext(tx, { ...ticket, status: nextStatus });

    if (nextStatus === 'AWAITING_STUDENT') {
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: 'TICKET_INFO_REQUESTED',
          idempotencyKey: `ticket-info:${history.id}`,
          payload: { ...payload, note: note ?? undefined },
        },
        tx,
      );
    } else if (!policy.isOwner(auth, ticket)) {
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: 'TICKET_STATUS_CHANGED',
          idempotencyKey: `ticket-status:${history.id}`,
          payload: { ...payload, note: note ?? undefined },
        },
        tx,
      );
    }

    if (ticket.assignedToId && ticket.assignedToId !== auth.userId) {
      await queueNotification(
        {
          recipientId: ticket.assignedToId,
          ticketId,
          type: 'STAFF_TICKET_QUEUED',
          idempotencyKey: `staff-status:${history.id}`,
          payload: { ...payload, note: note ?? undefined },
        },
        tx,
      );
    }
  });

  return getTicketForUser(auth, ticketId);
}

/** Assigns or reassigns a ticket. */
export async function assignTicket(
  auth: AuthContext,
  ticketId: string,
  assignedToId: string | null,
  reason?: string,
) {
  const ticket = await loadTicketForAction(ticketId);
  const isReassignment = ticket.assignedToId !== null && ticket.assignedToId !== assignedToId;
  const allowed = isReassignment
    ? policy.canReassign(auth, ticket)
    : policy.canAssign(auth, ticket, assignedToId);
  if (!allowed) {
    throw forbidden('You are not authorised to assign this ticket.');
  }
  if (isInactiveStatus(ticket.status)) {
    throw conflict('A closed ticket cannot be assigned.');
  }

  if (assignedToId) {
    const membership = await prisma.departmentMembership.findFirst({
      where: {
        userId: assignedToId,
        departmentId: ticket.departmentId,
        isActive: true,
        user: { accountStatus: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!membership) {
      throw badRequest('The selected officer is not an active member of this department.');
    }
  }

  const now = clock.now();
  const target = await getServiceTarget(ticket.departmentId);

  await prisma.$transaction(async (tx) => {
    const data: Prisma.TicketUncheckedUpdateInput = {
      assignedToId,
      assignedAt: assignedToId ? now : null,
      status: assignedToId
        ? ticket.status === 'AWAITING_ASSIGNMENT'
          ? 'ASSIGNED'
          : ticket.status
        : 'AWAITING_ASSIGNMENT',
      lastMeaningfulStaffActionAt: now,
      remindersSentInCycle: 0,
      reminderCycleStartedAt: assignedToId ? now : null,
      reminderKind: assignedToId ? 'UNTOUCHED' : null,
      nextReminderAt: assignedToId
        ? new Date(now.getTime() + target.reminderIntervalMinutes * 60_000)
        : null,
    };

    if (assignedToId && (!ticket.firstResponseDueAt || !ticket.resolutionDueAt)) {
      const deadlines = await computeDeadlines(ticket.departmentId, now);
      data.firstResponseDueAt = deadlines.firstResponseDueAt;
      data.resolutionDueAt = deadlines.resolutionDueAt;
    }

    await tx.ticket.update({ where: { id: ticketId }, data });

    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: isReassignment ? 'REASSIGNED' : 'ASSIGNED',
      previousValue: ticket.assignedToId,
      newValue: assignedToId,
      reason: reason ?? null,
    });

    const payload = await buildPayloadContext(tx, ticket);

    if (assignedToId) {
      await queueNotification(
        {
          recipientId: assignedToId,
          ticketId,
          type: isReassignment ? 'STAFF_TICKET_REASSIGNED' : 'STAFF_TICKET_ASSIGNED',
          idempotencyKey: `staff-assign:${history.id}`,
          payload: { ...payload, nextAction: 'Acknowledge the report to stop reminders.' },
        },
        tx,
      );
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: isReassignment ? 'TICKET_REASSIGNED' : 'TICKET_ASSIGNED',
          idempotencyKey: `ticket-assign:${history.id}`,
          payload: { ...payload, note: reason ?? undefined },
        },
        tx,
      );

      // Schedule the reminder for the new owner; the previous owner's cycle
      // stops because the ticket now has a new next-reminder deadline.
      const nextReminderAt = new Date(now.getTime() + target.reminderIntervalMinutes * 60_000);
      await scheduleReminderJob(tx, ticketId, 'UNTOUCHED', nextReminderAt);
    } else {
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: 'TICKET_REASSIGNED',
          idempotencyKey: `ticket-unassign:${history.id}`,
          payload: { ...payload, note: 'The ticket was returned to the department queue.' },
        },
        tx,
      );
    }
  });

  return getTicketForUser(auth, ticketId);
}

/** Resolves a ticket. A resolution summary is mandatory (PRD §7.3). */
export async function resolveTicket(
  auth: AuthContext,
  ticketId: string,
  resolutionSummary: string,
) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canResolve(auth, ticket)) {
    throw forbidden('You cannot resolve this ticket.');
  }
  if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
    throw conflict('This ticket is already resolved.');
  }
  if (!canTransition(ticket.status, 'RESOLVED')) {
    throw invalidTransition(
      `A ticket in status "${STATUS_LABELS[ticket.status]}" cannot be resolved directly.`,
    );
  }
  if (resolutionSummary.trim().length < 10) {
    throw badRequest('A resolution summary of at least 10 characters is required.');
  }

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        resolutionSummary,
        resolvedAt: now,
        firstResponseAt: ticket.firstResponseAt ?? now,
        lastMeaningfulStaffActionAt: now,
        reminderKind: null,
        nextReminderAt: null,
        remindersSentInCycle: 0,
      },
    });

    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'RESOLVED',
      previousValue: ticket.status,
      newValue: 'RESOLVED',
      reason: resolutionSummary,
    });

    const payload = await buildPayloadContext(tx, { ...ticket, status: 'RESOLVED' });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'TICKET_RESOLVED',
        idempotencyKey: `ticket-resolved:${history.id}`,
        payload: { ...payload, note: resolutionSummary },
      },
      tx,
    );
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'FEEDBACK_REQUESTED',
        idempotencyKey: `feedback-request:${history.id}`,
        payload,
      },
      tx,
    );
  });

  return getTicketForUser(auth, ticketId);
}

/** Closes a resolved ticket (student confirmation or administrative closure). */
export async function closeTicket(auth: AuthContext, ticketId: string, reason?: string) {
  const ticket = await loadTicketForAction(ticketId);
  const isOwner = policy.isOwner(auth, ticket);
  if (!isOwner && !policy.isGlobalAdmin(auth)) {
    throw forbidden('Only the reporting student or an administrator can close this ticket.');
  }
  if (ticket.status !== 'RESOLVED') {
    throw invalidTransition('Only a resolved ticket can be closed.');
  }

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED', closedAt: now, reminderKind: null, nextReminderAt: null },
    });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'CLOSED',
      previousValue: ticket.status,
      newValue: 'CLOSED',
      reason: reason ?? 'Confirmed by the reporting student.',
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: 'CLOSED' });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'TICKET_CLOSED',
        idempotencyKey: `ticket-closed:${history.id}`,
        payload,
      },
      tx,
    );
  });

  return getTicketForUser(auth, ticketId);
}

/** Reopens a resolved ticket with a new action deadline. */
export async function reopenTicket(auth: AuthContext, ticketId: string, reason: string) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canReopen(auth, ticket)) {
    throw forbidden('You cannot reopen this ticket.');
  }
  const isOwner = policy.isOwner(auth, ticket);
  if (isOwner && !policy.studentMayReopen(ticket)) {
    throw invalidTransition('A student can only reopen a ticket that has been resolved.');
  }
  if (!isOwner && !canTransition(ticket.status, 'REOPENED')) {
    throw invalidTransition(
      `A ticket in status "${STATUS_LABELS[ticket.status]}" cannot be reopened.`,
    );
  }

  const now = clock.now();
  const target = await getServiceTarget(ticket.departmentId);
  const deadlines = await computeDeadlines(ticket.departmentId, now);

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'REOPENED',
        reopenedCount: { increment: 1 },
        resolvedAt: null,
        closedAt: null,
        escalationLevel: 0,
        escalatedAt: null,
        firstResponseOverdue: false,
        resolutionOverdue: false,
        // A reopened ticket receives a new action deadline.
        firstResponseDueAt: deadlines.firstResponseDueAt,
        resolutionDueAt: deadlines.resolutionDueAt,
        reminderCycleStartedAt: now,
        reminderKind: ticket.assignedToId ? 'UNTOUCHED' : null,
        nextReminderAt: ticket.assignedToId
          ? new Date(now.getTime() + target.reminderIntervalMinutes * 60_000)
          : null,
        remindersSentInCycle: 0,
      },
    });

    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'REOPENED',
      previousValue: ticket.status,
      newValue: 'REOPENED',
      reason,
    });

    const payload = await buildPayloadContext(tx, { ...ticket, status: 'REOPENED' });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'TICKET_REOPENED',
        idempotencyKey: `ticket-reopened:${history.id}`,
        payload: { ...payload, note: reason },
      },
      tx,
    );
    if (ticket.assignedToId) {
      await queueNotification(
        {
          recipientId: ticket.assignedToId,
          ticketId,
          type: 'STAFF_TICKET_QUEUED',
          idempotencyKey: `staff-reopened:${history.id}`,
          payload: { ...payload, note: reason },
        },
        tx,
      );
    }

    const reopenReminderAt = new Date(now.getTime() + target.reminderIntervalMinutes * 60_000);
    await scheduleReminderJob(tx, ticketId, 'UNTOUCHED', reopenReminderAt);
    await tx.job.create({
      data: {
        type: 'SLA_FIRST_RESPONSE',
        payload: { ticketId, dueAt: deadlines.firstResponseDueAt.toISOString() },
        dedupeKey: `sla-first-response:${ticketId}:${history.id}`,
        runAt: deadlines.firstResponseDueAt,
      },
    });
    await tx.job.create({
      data: {
        type: 'SLA_RESOLUTION',
        payload: { ticketId, dueAt: deadlines.resolutionDueAt.toISOString() },
        dedupeKey: `sla-resolution:${ticketId}:${history.id}`,
        runAt: deadlines.resolutionDueAt,
      },
    });
  });

  return getTicketForUser(auth, ticketId);
}

/** Withdraws a ticket. The action is recorded in the history. */
export async function withdrawTicket(auth: AuthContext, ticketId: string, reason?: string) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canWithdraw(auth, ticket)) {
    throw forbidden('This ticket cannot be withdrawn at its current stage.');
  }
  if (!canTransition(ticket.status, 'WITHDRAWN')) {
    throw invalidTransition('This ticket can no longer be withdrawn.');
  }

  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: now,
        reminderKind: null,
        nextReminderAt: null,
      },
    });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'WITHDRAWN',
      previousValue: ticket.status,
      newValue: 'WITHDRAWN',
      reason: reason ?? 'Withdrawn by the reporting student.',
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: 'WITHDRAWN' });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'TICKET_WITHDRAWN',
        idempotencyKey: `ticket-withdrawn:${history.id}`,
        payload,
      },
      tx,
    );
  });

  return getTicketForUser(auth, ticketId);
}

/** Escalates a ticket (manual request by a student or staff action). */
export async function escalateTicket(
  auth: AuthContext,
  ticketId: string,
  reason: string,
  targetUserId?: string | null,
) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canEscalate(auth, ticket)) {
    throw forbidden('You cannot escalate this ticket.');
  }
  if (isInactiveStatus(ticket.status)) {
    throw conflict('A closed ticket cannot be escalated.');
  }
  const isOwner = policy.isOwner(auth, ticket);
  if (isOwner && !policy.studentMayEscalate(ticket)) {
    throw invalidTransition('This ticket is not in a state that can be escalated.');
  }

  const now = clock.now();
  const recipients = await findEscalationRecipients(ticket.departmentId);
  const targets = targetUserId ? [targetUserId] : recipients;

  await prisma.$transaction(async (tx) => {
    const escalation = await tx.escalationEvent.create({
      data: {
        ticketId,
        level: ticket.escalationLevel + 1,
        reason,
        source: isOwner ? 'STUDENT' : 'MANUAL',
        fromUserId: auth.userId,
        toUserId: targets[0] ?? null,
        notifiedAt: now,
      },
    });

    const data: Prisma.TicketUpdateInput = {
      escalatedAt: now,
      escalationLevel: ticket.escalationLevel + 1,
    };
    if (canTransition(ticket.status, 'ESCALATED')) {
      data.status = 'ESCALATED';
    }
    await tx.ticket.update({ where: { id: ticketId }, data });

    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: 'ESCALATED',
      previousValue: ticket.status,
      newValue: data.status?.toString() ?? ticket.status,
      reason,
    });

    const payload = await buildPayloadContext(tx, ticket);
    for (const target of targets) {
      await queueNotification(
        {
          recipientId: target,
          ticketId,
          type: 'STAFF_TICKET_ESCALATED',
          idempotencyKey: `staff-escalated:${escalation.id}:${target}`,
          payload: { ...payload, note: reason, escalationLevel: ticket.escalationLevel + 1 },
        },
        tx,
      );
    }

    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: 'TICKET_ESCALATED',
        idempotencyKey: `ticket-escalated:${history.id}`,
        payload: { ...payload, note: reason },
      },
      tx,
    );
  });

  return getTicketForUser(auth, ticketId);
}

/** Records student feedback for a resolved ticket. */
export async function submitFeedback(
  auth: AuthContext,
  ticketId: string,
  rating: number,
  comment?: string,
) {
  const ticket = await loadTicketForAction(ticketId);
  if (!policy.canGiveFeedback(auth, ticket)) {
    throw forbidden('Feedback can only be given on your own resolved ticket.');
  }

  const existing = await prisma.studentFeedback.findUnique({ where: { ticketId } });
  if (existing) throw conflict('Feedback has already been recorded for this ticket.');

  const feedback = await prisma.studentFeedback.create({
    data: { ticketId, studentId: auth.userId, rating, comment: comment ?? null },
  });
  await writeHistory(prisma, {
    ticketId,
    actorId: auth.userId,
    actionType: 'FEEDBACK_ADDED',
    newValue: String(rating),
  });

  return feedback;
}

async function findEscalationRecipients(departmentId: string): Promise<string[]> {
  const { findEscalationRecipients: find } = await import('../reminders/service-target.service');
  return find(departmentId);
}

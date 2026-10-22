import type { Notification, NotificationType, Prisma } from '@prisma/client';
import type { TicketStatus } from '@campus-resolve/shared';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { getConfig } from '../../config/env';
import { logger } from '../../config/logger';
import { enqueueJob, isUniqueViolation } from '../../jobs/queue';
import { getEmailProvider } from './email.provider';
import { renderEmail, ticketLink, type TemplateContext, type TemplateTicket } from './templates';

export interface NotificationPayload {
  referenceNumber?: string;
  status?: TicketStatus;
  ticketSubject?: string;
  categoryName?: string;
  departmentName?: string;
  submittedAt?: string;
  lastActionAt?: string;
  assignedOfficerName?: string;
  actorName?: string;
  messageBody?: string;
  note?: string;
  token?: string;
  nextAction?: string;
  detail?: string;
  escalationLevel?: number;
  dueAt?: string;
  /** Sign-in details, set when an administrator creates an account. */
  email?: string;
  password?: string;
  roleLabel?: string;
  passwordReset?: boolean;
  [key: string]: unknown;
}

export interface QueueNotificationInput {
  recipientId: string;
  ticketId?: string | null | undefined;
  type: NotificationType;
  /** Deterministic key that prevents duplicate emails on retry (PRD §9.3). */
  idempotencyKey: string;
  payload: NotificationPayload;
}

export interface QueuedNotification {
  notification: Notification;
  created: boolean;
}

/**
 * Creates a notification record and schedules its delivery.
 *
 * The notification is persisted first so a delivery failure can never lose the
 * message, and the idempotency key makes repeated calls safe (PRD §9.3, §21).
 */
export async function queueNotification(
  input: QueueNotificationInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<QueuedNotification> {
  const existing = await client.notification.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return { notification: existing, created: false };
  }

  let notification: Notification;
  try {
    notification = await client.notification.create({
      data: {
        recipientId: input.recipientId,
        ticketId: input.ticketId ?? null,
        type: input.type,
        channel: 'EMAIL',
        status: 'PENDING',
        idempotencyKey: input.idempotencyKey,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await client.notification.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced) return { notification: raced, created: false };
    }
    throw error;
  }

  await enqueueJob(
    'NOTIFICATION_DELIVERY',
    { notificationId: notification.id },
    { dedupeKey: `deliver:${notification.id}` },
    client,
  );

  return { notification, created: true };
}

export type DeliveryResult = {
  sent: boolean;
  skipped: boolean;
  providerMessageId?: string;
  error?: string;
};

/** Narrows a stored JSON payload to a plain object so it can be merged safely. */
function asJsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Prisma.InputJsonObject;
  }
  return {};
}

function buildTemplateContext(
  payload: NotificationPayload,
  recipientName: string,
): TemplateContext {
  const config = getConfig();
  const ticket: TemplateTicket | undefined = payload.referenceNumber
    ? {
        referenceNumber: payload.referenceNumber,
        subject: payload.ticketSubject ?? '',
        status: (payload.status ?? 'SUBMITTED') as TicketStatus,
        categoryName: payload.categoryName,
        departmentName: payload.departmentName,
        submittedAt: payload.submittedAt ? new Date(payload.submittedAt) : undefined,
        lastActionAt: payload.lastActionAt ? new Date(payload.lastActionAt) : undefined,
        nextAction: payload.nextAction,
        assignedOfficerName: payload.assignedOfficerName,
      }
    : undefined;

  return {
    appUrl: config.APP_URL,
    institutionName: config.INSTITUTION_NAME,
    recipientName,
    ticket,
    actorName: payload.actorName,
    messageBody: payload.messageBody,
    token: payload.token,
    actionUrl: payload.referenceNumber
      ? ticketLink(config.APP_URL, payload.referenceNumber)
      : config.APP_URL,
    actionLabel: payload.referenceNumber ? 'Open ticket' : 'Open Campus Resolve',
    note: payload.note,
    dueAt: payload.dueAt ? new Date(payload.dueAt) : undefined,
    escalationLevel: payload.escalationLevel,
    detail: payload.detail,
    accountEmail: payload.email,
    accountPassword: payload.password,
    roleLabel: payload.roleLabel,
    passwordReset: payload.passwordReset,
  };
}

/**
 * Attempts to deliver a queued notification.
 *
 * The notification row is the source of truth: it is only marked `SENT` when
 * the provider confirmed delivery, and every attempt is logged (PRD §9.5,
 * §11.3).
 */
export async function deliverNotification(notificationId: string): Promise<DeliveryResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { recipient: true },
  });

  if (!notification) {
    return { sent: false, skipped: true, error: 'Notification not found' };
  }
  if (notification.status === 'SENT') {
    return {
      sent: true,
      skipped: true,
      providerMessageId: notification.providerMessageId ?? undefined,
    };
  }
  if (notification.status === 'SKIPPED') {
    return { sent: false, skipped: true, error: 'Notification was skipped' };
  }

  const payload = (notification.payload ?? {}) as NotificationPayload;
  const context = buildTemplateContext(payload, notification.recipient.fullName);
  const rendered = renderEmail(notification.type, context);
  const attemptNumber = notification.attemptCount + 1;

  // The rendered message is stored before the attempt so that a delivery that
  // fails is still readable in the outbox — the operator can see exactly what
  // was going to be delivered and why it did not arrive.
  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      payload: {
        ...asJsonObject(notification.payload),
        rendered: { subject: rendered.subject, text: rendered.text, html: rendered.html },
      } as Prisma.InputJsonValue,
    },
  });

  try {
    const result = await getEmailProvider().send({
      to: notification.recipient.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: notification.idempotencyKey,
    });

    // The password is only needed until the message has been delivered. It is
    // removed from the stored payload and from the stored copy of the message
    // so it does not sit in the database in plain text.
    const deliveredPayload = { ...asJsonObject(notification.payload) } as Record<string, unknown>;
    delete deliveredPayload.password;
    if (payload.password) deliveredPayload.passwordDelivered = true;
    const stored = payload.password
      ? {
          subject: rendered.subject,
          text: rendered.text.split(payload.password).join('••••••••'),
          html: rendered.html.split(payload.password).join('••••••••'),
        }
      : { subject: rendered.subject, text: rendered.text, html: rendered.html };

    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'SENT',
          sentAt: clock.now(),
          providerMessageId: result.providerMessageId,
          attemptCount: attemptNumber,
          lastAttemptAt: clock.now(),
          lastError: null,
          payload: {
            ...deliveredPayload,
            rendered: stored,
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attemptNumber,
          status: 'SENT',
          providerMessageId: result.providerMessageId,
        },
      }),
    ]);

    return { sent: true, skipped: false, providerMessageId: result.providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'FAILED',
          attemptCount: attemptNumber,
          lastAttemptAt: clock.now(),
          lastError: message.slice(0, 2000),
        },
      }),
      prisma.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attemptNumber,
          status: 'FAILED',
          error: message.slice(0, 2000),
        },
      }),
    ]);
    logger.warn('Notification delivery failed', {
      notificationId: notification.id,
      type: notification.type,
      error: message,
    });
    return { sent: false, skipped: false, error: message };
  }
}

/**
 * Re-attempts the delivery of a notification.
 *
 * Used when the mail provider was misconfigured — a sending domain that is
 * not verified yet, for example — so the message can be delivered again once
 * the configuration is fixed.
 */
export async function resendNotification(notificationId: string): Promise<DeliveryResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { recipient: true },
  });
  if (!notification) {
    return { sent: false, skipped: true, error: 'Notification not found' };
  }

  const payload = (notification.payload ?? {}) as NotificationPayload;
  const context = buildTemplateContext(payload, notification.recipient.fullName);
  const rendered = renderEmail(notification.type, context);

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: 'PENDING',
      lastError: null,
      payload: {
        ...asJsonObject(notification.payload),
        rendered: { subject: rendered.subject, text: rendered.text, html: rendered.html },
      } as Prisma.InputJsonValue,
    },
  });

  return deliverNotification(notificationId);
}

export interface OutboxEntry {
  id: string;
  type: NotificationType;
  status: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  links: string[];
  createdAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  attemptCount: number;
}

/** Extracts the action links from a rendered message. */
function extractLinks(text: string): string[] {
  const links = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
    links.add(match[0]);
  }
  return [...links];
}

/**
 * The operator's view of the mail the system has produced.
 *
 * Every message is recorded with the text that was rendered for it, so a
 * delivery that the provider rejected can still be read, and the link it
 * contained can be passed on by hand.
 */
export async function listOutbox(options: { limit?: number } = {}): Promise<OutboxEntry[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const notifications = await prisma.notification.findMany({
    where: { channel: 'EMAIL' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { recipient: { select: { email: true, fullName: true } } },
  });

  return notifications.map((notification) => {
    const payload = (notification.payload ?? {}) as NotificationPayload;
    const rendered = (payload.rendered ?? {}) as { subject?: string; text?: string };
    const body = rendered.text ?? '';
    return {
      id: notification.id,
      type: notification.type,
      status: notification.status,
      recipientEmail: notification.recipient.email,
      recipientName: notification.recipient.fullName,
      subject: rendered.subject ?? payload.detail ?? notification.type,
      body,
      links: extractLinks(body),
      createdAt: notification.createdAt,
      sentAt: notification.sentAt,
      lastError: notification.lastError,
      attemptCount: notification.attemptCount,
    };
  });
}

/** Lists notifications for a recipient (used by the in-app notification panel). */
export async function listNotifications(recipientId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { recipientId, channel: 'EMAIL' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      ticketId: true,
      createdAt: true,
      sentAt: true,
      payload: true,
    },
  });
}

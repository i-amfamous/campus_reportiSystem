import type { Job } from '@prisma/client';
import { deliverNotification } from '../../modules/notifications/notification.service';
import { handleReminderJob, type ReminderJobPayload } from './reminder.handler';
import {
  handleEscalationJob,
  handleFirstResponseJob,
  handleResolutionJob,
  type EscalationJobPayload,
} from './escalation.handler';

export interface JobResult {
  [key: string]: unknown;
}

/**
 * Dispatches a single job. Throwing signals a failure, which causes the queue
 * to retry with backoff (PRD §21).
 */
export async function runJob(job: Job): Promise<JobResult> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  switch (job.type) {
    case 'TICKET_REMINDER':
      return (await handleReminderJob(payload as unknown as ReminderJobPayload)) as JobResult;

    case 'ESCALATION':
      return (await handleEscalationJob(payload as unknown as EscalationJobPayload)) as JobResult;

    case 'SLA_FIRST_RESPONSE':
      return (await handleFirstResponseJob({ ticketId: String(payload.ticketId) })) as JobResult;

    case 'SLA_RESOLUTION':
      return (await handleResolutionJob({ ticketId: String(payload.ticketId) })) as JobResult;

    case 'NOTIFICATION_DELIVERY': {
      const notificationId = String(payload.notificationId);
      const result = await deliverNotification(notificationId);
      if (!result.sent && !result.skipped) {
        // Surface the failure so the queue retries the delivery.
        throw new Error(result.error ?? 'Notification delivery failed');
      }
      return result as JobResult;
    }

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

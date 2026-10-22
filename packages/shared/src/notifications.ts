/**
 * Canonical notification catalogue (PRD §11).
 *
 * Notification types are used as idempotency-key components and template
 * selectors, so they must stay stable across API, worker and templates.
 */

export const NOTIFICATION_TYPES = [
  // Account lifecycle
  'EMAIL_VERIFICATION',
  'REGISTRATION_CONFIRMED',
  'PASSWORD_RESET',
  'STAFF_INVITATION',
  'ACCOUNT_CREDENTIALS',
  'ACCOUNT_SUSPENDED',
  // Student-facing ticket events
  'TICKET_SUBMITTED',
  'TICKET_ACKNOWLEDGED',
  'TICKET_ASSIGNED',
  'TICKET_REASSIGNED',
  'TICKET_STATUS_CHANGED',
  'TICKET_INFO_REQUESTED',
  'TICKET_REPLY',
  'TICKET_ESCALATED',
  'TICKET_RESOLVED',
  'TICKET_REOPENED',
  'TICKET_CLOSED',
  'TICKET_WITHDRAWN',
  'FEEDBACK_REQUESTED',
  // Staff-facing ticket events
  'STAFF_TICKET_ASSIGNED',
  'STAFF_TICKET_REASSIGNED',
  'STAFF_TICKET_REPLIED',
  'STAFF_TICKET_ESCALATED',
  'STAFF_TICKET_QUEUED',
  'STAFF_REMINDER_DUE',
  'STAFF_SLA_WARNING',
  'STAFF_SLA_BREACHED',
  // System
  'SYSTEM_ADMIN_ALERT',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Audience determines template wording and whether internal data may appear. */
export const NOTIFICATION_AUDIENCE = {
  EMAIL_VERIFICATION: 'student',
  REGISTRATION_CONFIRMED: 'student',
  PASSWORD_RESET: 'student',
  STAFF_INVITATION: 'staff',
  ACCOUNT_CREDENTIALS: 'staff',
  ACCOUNT_SUSPENDED: 'student',
  TICKET_SUBMITTED: 'student',
  TICKET_ACKNOWLEDGED: 'student',
  TICKET_ASSIGNED: 'student',
  TICKET_REASSIGNED: 'student',
  TICKET_STATUS_CHANGED: 'student',
  TICKET_INFO_REQUESTED: 'student',
  TICKET_REPLY: 'student',
  TICKET_ESCALATED: 'student',
  TICKET_RESOLVED: 'student',
  TICKET_REOPENED: 'student',
  TICKET_CLOSED: 'student',
  TICKET_WITHDRAWN: 'student',
  FEEDBACK_REQUESTED: 'student',
  STAFF_TICKET_ASSIGNED: 'staff',
  STAFF_TICKET_REASSIGNED: 'staff',
  STAFF_TICKET_REPLIED: 'staff',
  STAFF_TICKET_ESCALATED: 'staff',
  STAFF_TICKET_QUEUED: 'staff',
  STAFF_REMINDER_DUE: 'staff',
  STAFF_SLA_WARNING: 'staff',
  STAFF_SLA_BREACHED: 'staff',
  SYSTEM_ADMIN_ALERT: 'staff',
} as const satisfies Record<NotificationType, 'student' | 'staff'>;

/**
 * Notification types whose content is staff-only. These must never be sent to
 * a student (PRD §7.3, §11).
 */
export const STAFF_ONLY_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'STAFF_INVITATION',
  'ACCOUNT_CREDENTIALS',
  'STAFF_TICKET_ASSIGNED',
  'STAFF_TICKET_REASSIGNED',
  'STAFF_TICKET_REPLIED',
  'STAFF_TICKET_ESCALATED',
  'STAFF_TICKET_QUEUED',
  'STAFF_REMINDER_DUE',
  'STAFF_SLA_WARNING',
  'STAFF_SLA_BREACHED',
  'SYSTEM_ADMIN_ALERT',
];

/** Background job types handled by the worker (PRD §9.3, §10). */
export const JOB_TYPES = [
  'TICKET_REMINDER',
  'SLA_FIRST_RESPONSE',
  'SLA_RESOLUTION',
  'ESCALATION',
  'NOTIFICATION_DELIVERY',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Reminder kinds, tracked separately from SLA/escalation work. */
export const REMINDER_KINDS = ['UNTOUCHED', 'NEXT_ACTION'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const JOB_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

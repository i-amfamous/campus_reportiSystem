/**
 * Canonical ticket domain vocabulary.
 *
 * Every status, priority and transition used by the API, the web client, the
 * background worker and the tests is defined here. Nothing else in the codebase
 * may invent a status name (PRD §7, §26 coordination rules 3 and 4).
 */

export const TICKET_STATUSES = [
  'SUBMITTED',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'AWAITING_STUDENT',
  'AWAITING_EXTERNAL',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'WITHDRAWN',
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Student-facing wording. Internal state names may differ from displayed text. */
export const STATUS_LABELS: Record<TicketStatus, string> = {
  SUBMITTED: 'Submitted',
  AWAITING_ASSIGNMENT: 'Awaiting assignment',
  ASSIGNED: 'Assigned',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  AWAITING_STUDENT: 'Awaiting your response',
  AWAITING_EXTERNAL: 'Awaiting external department',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  WITHDRAWN: 'Withdrawn',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/**
 * Allowed state transitions. Anything not listed here is rejected by the server
 * with an `INVALID_TRANSITION` error.
 */
export const STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  SUBMITTED: ['AWAITING_ASSIGNMENT', 'ASSIGNED', 'WITHDRAWN'],
  AWAITING_ASSIGNMENT: ['ASSIGNED', 'ESCALATED', 'WITHDRAWN'],
  ASSIGNED: [
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'AWAITING_STUDENT',
    'AWAITING_EXTERNAL',
    'RESOLVED',
    'ESCALATED',
    'AWAITING_ASSIGNMENT',
  ],
  ACKNOWLEDGED: ['IN_PROGRESS', 'AWAITING_STUDENT', 'AWAITING_EXTERNAL', 'RESOLVED', 'ESCALATED'],
  IN_PROGRESS: ['AWAITING_STUDENT', 'AWAITING_EXTERNAL', 'RESOLVED', 'ESCALATED'],
  AWAITING_STUDENT: ['IN_PROGRESS', 'RESOLVED', 'ESCALATED'],
  AWAITING_EXTERNAL: ['IN_PROGRESS', 'RESOLVED', 'ESCALATED'],
  ESCALATED: ['IN_PROGRESS', 'AWAITING_STUDENT', 'RESOLVED', 'ESCALATED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['ASSIGNED', 'AWAITING_ASSIGNMENT', 'ACKNOWLEDGED', 'IN_PROGRESS'],
  WITHDRAWN: [],
};

/** Statuses from which no further transition is permitted. */
export const TERMINAL_STATUSES: readonly TicketStatus[] = ['CLOSED', 'WITHDRAWN'];

/** Statuses that mean an officer is expected to take the next action. */
export const STAFF_ACTION_STATUSES: readonly TicketStatus[] = [
  'SUBMITTED',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'AWAITING_EXTERNAL',
  'ESCALATED',
  'REOPENED',
];

/** Statuses where the ball is in the student's court. */
export const AWAITING_STUDENT_STATUSES: readonly TicketStatus[] = ['AWAITING_STUDENT'];

/** Statuses that stop all reminder/SLA processing. */
export const INACTIVE_STATUSES: readonly TicketStatus[] = ['RESOLVED', 'CLOSED', 'WITHDRAWN'];

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isInactiveStatus(status: TicketStatus): boolean {
  return INACTIVE_STATUSES.includes(status);
}

export function requiresStaffAction(status: TicketStatus): boolean {
  return STAFF_ACTION_STATUSES.includes(status);
}

export function isAwaitingStudent(status: TicketStatus): boolean {
  return AWAITING_STUDENT_STATUSES.includes(status);
}

/** Roles that own a ticket queue. */
export const MESSAGE_VISIBILITIES = ['PUBLIC', 'INTERNAL'] as const;
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];

/** Attachment kinds. */
export const TICKET_SOURCE = ['STUDENT', 'TRIAGE', 'STAFF'] as const;
export type TicketSource = (typeof TICKET_SOURCE)[number];

export const FEEDBACK_RATING_MIN = 1;
export const FEEDBACK_RATING_MAX = 5;

/** Reference number format: CR-<year>-<6 digits>. */
export const REFERENCE_PREFIX = 'CR';
export const REFERENCE_SEQUENCE_NAME = 'ticket_reference';

export function formatReference(year: number, sequence: number): string {
  return `${REFERENCE_PREFIX}-${year}-${String(sequence).padStart(6, '0')}`;
}

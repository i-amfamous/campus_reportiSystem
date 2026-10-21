import type { TicketStatus } from '@campus-resolve/shared';
import { isAdminRole, isStaffRole } from '@campus-resolve/shared';
import type { AuthContext } from '../auth/auth.types';
import { headsDepartment, isInDepartment } from '../auth/auth.types';

export interface TicketResource {
  id: string;
  studentId: string;
  departmentId: string;
  assignedToId: string | null;
  status: TicketStatus;
}

/** The ticket belongs to this student. */
export function isOwner(auth: AuthContext, ticket: TicketResource): boolean {
  return auth.userId === ticket.studentId;
}

/** The user is staff attached to the ticket's department. */
export function isDepartmentStaff(auth: AuthContext, ticket: TicketResource): boolean {
  return auth.roles.some((role) => isStaffRole(role)) && isInDepartment(auth, ticket.departmentId);
}

/** The user is the officer currently responsible for the ticket. */
export function isCurrentAssignee(auth: AuthContext, ticket: TicketResource): boolean {
  return ticket.assignedToId !== null && ticket.assignedToId === auth.userId;
}

/** Platform administrator with unrestricted ticket access. */
export function isGlobalAdmin(auth: AuthContext): boolean {
  return auth.roles.some((role) => isAdminRole(role));
}

/**
 * Read access (PRD §4.1, §4.2, §4.6).
 * A student can only ever read their own report.
 */
export function canViewTicket(auth: AuthContext, ticket: TicketResource): boolean {
  if (isOwner(auth, ticket)) return true;
  if (isGlobalAdmin(auth)) return true;
  if (isDepartmentStaff(auth, ticket)) return true;
  return auth.permissions.has('ticket:read:any');
}

/** Post a student-visible reply. */
export function canReply(auth: AuthContext, ticket: TicketResource): boolean {
  if (isOwner(auth, ticket)) return true;
  if (isGlobalAdmin(auth)) return true;
  if (isCurrentAssignee(auth, ticket)) return true;
  return isDepartmentStaff(auth, ticket);
}

/** Internal notes are staff-only and never visible to students (PRD §4.2). */
export function canAddInternalNote(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  if (isCurrentAssignee(auth, ticket)) return true;
  return isDepartmentStaff(auth, ticket);
}

/** Change the status of a ticket. */
export function canChangeStatus(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  return isCurrentAssignee(auth, ticket) || isDepartmentStaff(auth, ticket);
}

/**
 * Assign a ticket.
 * Officers may assign a ticket to themselves (accepting it). Department heads
 * may assign within their department. Administrators may assign system-wide.
 */
export function canAssign(
  auth: AuthContext,
  ticket: TicketResource,
  targetUserId: string | null,
): boolean {
  if (isGlobalAdmin(auth)) return true;
  if (headsDepartment(auth, ticket.departmentId)) return true;
  // Officers may only take work for themselves, and only from the queue.
  if (targetUserId !== auth.userId) return false;
  if (!isDepartmentStaff(auth, ticket)) return false;
  // A ticket that already belongs to somebody else is a reassignment, which
  // is guarded separately so that a ticket can never be taken over silently.
  return ticket.assignedToId === null || ticket.assignedToId === auth.userId;
}

/** Reassign work that already has an owner. */
export function canReassign(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  if (headsDepartment(auth, ticket.departmentId)) return true;
  // The current owner may hand the work to a colleague in the department; the
  // service layer still checks that the target is an active member of it.
  return isCurrentAssignee(auth, ticket);
}

/** Resolve a ticket (a resolution summary is required by the service layer). */
export function canResolve(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  return isCurrentAssignee(auth, ticket) || isDepartmentStaff(auth, ticket);
}

/** Escalate. Students may request escalation; staff perform it. */
export function canEscalate(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  if (isDepartmentStaff(auth, ticket)) return true;
  return auth.permissions.has('ticket:escalate:request');
}

/** Reopen a resolved ticket. */
export function canReopen(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  if (auth.permissions.has('ticket:reopen:manage') && isDepartmentStaff(auth, ticket)) return true;
  return auth.permissions.has('ticket:reopen:request');
}

/** Withdraw a ticket. Students may withdraw only before staff have started. */
export function canWithdraw(auth: AuthContext, ticket: TicketResource): boolean {
  if (isGlobalAdmin(auth)) return true;
  if (!isOwner(auth, ticket)) return false;
  return ['SUBMITTED', 'AWAITING_ASSIGNMENT'].includes(ticket.status);
}

/** Upload supporting evidence. */
export function canUploadAttachment(auth: AuthContext, ticket: TicketResource): boolean {
  if (isOwner(auth, ticket)) return true;
  if (isGlobalAdmin(auth)) return true;
  return isDepartmentStaff(auth, ticket);
}

/** Download an attachment. Authorised on every request (PRD §19). */
export function canDownloadAttachment(auth: AuthContext, ticket: TicketResource): boolean {
  return canViewTicket(auth, ticket);
}

/** Rate the support received. */
export function canGiveFeedback(auth: AuthContext, ticket: TicketResource): boolean {
  return isOwner(auth, ticket) && ['RESOLVED', 'CLOSED'].includes(ticket.status);
}

/** Statuses a student may still act on. */
export function studentMayReopen(ticket: TicketResource): boolean {
  return ticket.status === 'RESOLVED';
}

export function studentMayEscalate(ticket: TicketResource): boolean {
  return ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'AWAITING_EXTERNAL'].includes(ticket.status);
}

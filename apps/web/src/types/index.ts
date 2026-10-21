import type { TicketPriority, TicketStatus } from '@campus-resolve/shared';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  studentId: string | null;
  emailVerified: boolean;
  accountStatus: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DEACTIVATED';
  roles: string[];
  permissions: string[];
  departments: Array<{
    departmentId: string;
    departmentName: string;
    departmentRole: 'OFFICER' | 'HEAD';
  }>;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TicketSummary {
  id: string;
  referenceNumber: string;
  subject: string;
  status: TicketStatus;
  statusLabel: string;
  priority: TicketPriority;
  category: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  assignedTo: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  reopenedCount: number;
  remindersSentInCycle: number;
  nextReminderAt: string | null;
  overdue: boolean;
  escalationLevel: number;
}

export interface TicketMessage {
  id: string;
  body: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  createdAt: string;
  sender: { id: string; fullName: string; isStaff: boolean };
}

export interface TicketAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: { id: string; fullName: string };
}

export interface TicketHistoryEntry {
  id: string;
  actionType: string;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  actor: { id: string; fullName: string } | null;
}

export interface TicketDetail {
  id: string;
  referenceNumber: string;
  subject: string;
  description: string;
  status: TicketStatus;
  statusLabel: string;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  assignedAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  resolutionSummary: string | null;
  reopenedCount: number;
  remindersSentInCycle: number;
  nextReminderAt: string | null;
  lastReminderSentAt: string | null;
  lastMeaningfulStaffActionAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
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
  messages: TicketMessage[];
  attachments: TicketAttachment[];
  history: TicketHistoryEntry[];
  feedback: { rating: number; comment: string | null; createdAt: string } | null;
}

export interface Department {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  contactEmail: string | null;
  isActive: boolean;
  isFallbackQueue: boolean;
  sortOrder: number;
  staffCount: number;
  categoryCount: number;
  serviceTarget: {
    firstResponseMinutes: number;
    resolutionMinutes: number;
    reminderIntervalMinutes: number;
    maxReminders: number;
    escalationAfterReminders: number;
    businessHoursOnly: boolean;
  } | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  defaultPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  isActive: boolean;
  isSensitive: boolean;
  sortOrder: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SystemDashboard {
  totals: {
    total: number;
    open: number;
    unassigned: number;
    overdue: number;
    escalated: number;
    resolved: number;
    awaitingStudent: number;
    reopened: number;
    resolutionRate: number;
  };
  timings: {
    averageFirstResponseMinutes: number | null;
    averageResolutionMinutes: number | null;
  };
  departments: Array<{
    id: string;
    name: string;
    total: number;
    open: number;
    unassigned: number;
    overdue: number;
    resolutionTargetMinutes: number | null;
  }>;
  system: { failedNotifications: number; pendingJobs: number; failedJobs: number };
}

export interface DepartmentMetrics {
  departmentId: string;
  departmentName: string;
  total: number;
  open: number;
  unassigned: number;
  overdue: number;
  escalated: number;
  resolved: number;
  reopened: number;
  awaitingStudent: number;
  averageFirstResponseMinutes: number | null;
  averageResolutionMinutes: number | null;
  resolvedWithinTarget: number;
  satisfactionAverage: number | null;
  satisfactionCount: number;
  volumeByStatus: Record<string, number>;
  volumeByPriority: Record<string, number>;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  studentId: string | null;
  accountStatus: string;
  emailVerified: boolean;
  roles: string[];
  departments: Array<{ id: string; name: string; departmentRole: string; isActive: boolean }>;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
}

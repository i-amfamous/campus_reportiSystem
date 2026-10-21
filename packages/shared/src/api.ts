/**
 * API envelope, error codes and pagination contracts (PRD §18, §21).
 */

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_TRANSITION',
  'INVALID_STATE',
  'RATE_LIMITED',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_LOCKED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'CSRF_FAILED',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string[] | string | number | boolean>;
    requestId?: string;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  studentId: string | null;
  emailVerified: boolean;
  accountStatus: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DEACTIVATED';
  roles: string[];
  departments: Array<{
    departmentId: string;
    departmentName: string;
    departmentRole: 'OFFICER' | 'HEAD';
  }>;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface SessionUser extends AuthenticatedUser {
  permissions: string[];
}

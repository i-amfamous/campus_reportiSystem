import type { PermissionKey, RoleName } from '@campus-resolve/shared';
import type { DepartmentRole } from '@campus-resolve/shared';

export interface DepartmentScope {
  departmentId: string;
  departmentName: string;
  departmentRole: DepartmentRole;
  isActive: boolean;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  fullName: string;
  studentId: string | null;
  emailVerified: boolean;
  accountStatus: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DEACTIVATED';
  roles: RoleName[];
  permissions: Set<PermissionKey>;
  departments: DepartmentScope[];
  lastLoginAt: Date | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

export function hasPermission(auth: AuthContext, permission: PermissionKey): boolean {
  return auth.permissions.has(permission);
}

export function hasRole(auth: AuthContext, role: RoleName): boolean {
  return auth.roles.includes(role);
}

/** True when the user may act inside the given department. */
export function isInDepartment(auth: AuthContext, departmentId: string): boolean {
  return auth.departments.some((scope) => scope.departmentId === departmentId && scope.isActive);
}

/** True when the user heads the given department. */
export function headsDepartment(auth: AuthContext, departmentId: string): boolean {
  return auth.departments.some(
    (scope) =>
      scope.departmentId === departmentId && scope.departmentRole === 'HEAD' && scope.isActive,
  );
}

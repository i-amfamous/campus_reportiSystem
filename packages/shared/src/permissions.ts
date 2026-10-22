/**
 * Canonical role and permission model (PRD §4, §4.6, §17.2).
 *
 * The server enforces these; the client only uses them to hide controls.
 */

export const ROLES = ['STUDENT', 'OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN'] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  STUDENT: 'Student',
  OFFICER: 'Department Officer',
  DEPARTMENT_HEAD: 'Department Head',
  ADMIN: 'Administrator',
  SUPER_ADMIN: 'Super Administrator',
};

export const PERMISSIONS = [
  // Tickets
  'ticket:create',
  'ticket:read:own',
  'ticket:read:department',
  'ticket:read:any',
  'ticket:reply:public',
  'ticket:note:internal',
  'ticket:status:update',
  'ticket:assign',
  'ticket:reassign',
  'ticket:resolve',
  'ticket:escalate:request',
  'ticket:escalate:manage',
  'ticket:reopen:request',
  'ticket:reopen:manage',
  'ticket:withdraw',
  'ticket:feedback:create',
  'ticket:feedback:read',
  // Attachments
  'attachment:upload',
  'attachment:download',
  // Reference data
  'department:read',
  'department:manage',
  'category:read',
  'category:manage',
  // People
  'user:manage',
  'user:manage:department',
  'user:role:assign',
  // Platform
  'settings:manage',
  'settings:institution',
  'analytics:department',
  'analytics:global',
  'audit:read',
  'export:create',
  'job:manage',
  'security:read',
  'retention:manage',
  // Platform backup
  'system:backup',
  'system:restore',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const STUDENT_PERMISSIONS: PermissionKey[] = [
  'ticket:create',
  'ticket:read:own',
  'ticket:reply:public',
  'ticket:escalate:request',
  'ticket:reopen:request',
  'ticket:withdraw',
  'ticket:feedback:create',
  'attachment:upload',
  'attachment:download',
  'department:read',
  'category:read',
];

const OFFICER_PERMISSIONS: PermissionKey[] = [
  ...STUDENT_PERMISSIONS,
  'ticket:read:department',
  'ticket:note:internal',
  'ticket:status:update',
  'ticket:assign',
  'ticket:reassign',
  'ticket:resolve',
  'ticket:escalate:manage',
  'ticket:reopen:manage',
  'ticket:feedback:read',
];

const DEPARTMENT_HEAD_PERMISSIONS: PermissionKey[] = [
  ...OFFICER_PERMISSIONS,
  'analytics:department',
  'user:manage:department',
];

const ADMIN_PERMISSIONS: PermissionKey[] = [
  ...DEPARTMENT_HEAD_PERMISSIONS,
  'ticket:read:any',
  'user:manage',
  'user:role:assign',
  'department:manage',
  'category:manage',
  'settings:manage',
  'analytics:global',
  'audit:read',
  'export:create',
  'job:manage',
];

const SUPER_ADMIN_PERMISSIONS: PermissionKey[] = [
  ...ADMIN_PERMISSIONS,
  'settings:institution',
  'security:read',
  'retention:manage',
  // Only a super administrator may take a copy of the whole platform or put
  // one back, because both operations can rewrite every record.
  'system:backup',
  'system:restore',
];

/**
 * Role → permission matrix. Explicit server-side policies are derived from this
 * (PRD §4.6: "The final permission matrix must be implemented as explicit
 * server-side policies, with super-administrator privileges separately
 * controlled.").
 */
export const ROLE_PERMISSIONS: Record<RoleName, readonly PermissionKey[]> = {
  STUDENT: STUDENT_PERMISSIONS,
  OFFICER: OFFICER_PERMISSIONS,
  DEPARTMENT_HEAD: DEPARTMENT_HEAD_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
};

export const STAFF_ROLES: readonly RoleName[] = [
  'OFFICER',
  'DEPARTMENT_HEAD',
  'ADMIN',
  'SUPER_ADMIN',
];

export function isStaffRole(role: RoleName): boolean {
  return STAFF_ROLES.includes(role);
}

export function isAdminRole(role: RoleName): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function roleHasPermission(role: RoleName, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Department scope levels for a staff member. */
export const DEPARTMENT_ROLES = ['OFFICER', 'HEAD'] as const;
export type DepartmentRole = (typeof DEPARTMENT_ROLES)[number];

/**
 * Roles that may be granted to a user account. A super administrator can grant
 * all of these; a regular administrator may grant staff roles but never
 * `SUPER_ADMIN` (PRD §4.5, §5.2).
 */
export const ASSIGNABLE_ROLES: Record<RoleName, readonly RoleName[]> = {
  STUDENT: ['STUDENT'],
  OFFICER: ['STUDENT', 'OFFICER'],
  DEPARTMENT_HEAD: ['STUDENT', 'OFFICER', 'DEPARTMENT_HEAD'],
  ADMIN: ['STUDENT', 'OFFICER', 'DEPARTMENT_HEAD', 'ADMIN'],
  SUPER_ADMIN: ['STUDENT', 'OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN'],
};

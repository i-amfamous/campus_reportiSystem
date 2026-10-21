import supertest from 'supertest';
import type { Express } from 'express';
import { prisma } from '../../src/lib/prisma';
import { clock } from '../../src/config/clock';
import { hashPassword } from '../../src/lib/crypto';
import { createApp } from '../../src/app';
import type { RoleName } from '@campus-resolve/shared';

export const TEST_PASSWORD = 'Str0ng!Password1';

const TABLES = [
  'notification_attempts',
  'notifications',
  'reminder_occurrences',
  'jobs',
  'escalation_events',
  'student_feedback',
  'ticket_history',
  'ticket_attachments',
  'ticket_messages',
  'tickets',
  'department_holidays',
  'department_business_hours',
  'department_service_targets',
  'categories',
  'department_memberships',
  'audit_logs',
  'system_settings',
  'sessions',
  'password_reset_tokens',
  'email_verification_tokens',
  'user_roles',
  'role_permissions',
  'permissions',
  'roles',
  'users',
  'departments',
  'counters',
];

/** Truncates every table and re-creates the canonical roles and permissions. */
export async function resetDatabase(): Promise<void> {
  const { resetAllRateLimiters } = await import('../../src/middleware/rateLimit');
  resetAllRateLimiters();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
  await seedRolesAndPermissions();
}

export async function seedRolesAndPermissions(): Promise<void> {
  const { PERMISSIONS, ROLE_PERMISSIONS, ROLES, ROLE_LABELS } =
    await import('@campus-resolve/shared');
  for (const role of ROLES) {
    await prisma.role.create({ data: { name: role, description: ROLE_LABELS[role] } });
  }
  for (const permission of PERMISSIONS) {
    await prisma.permission.create({ data: { key: permission } });
  }
  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((permission) => [permission.key, permission]));
  for (const role of ROLES) {
    const roleRecord = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    for (const key of ROLE_PERMISSIONS[role]) {
      const permission = byKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.create({
        data: { roleId: roleRecord.id, permissionId: permission.id },
      });
    }
  }
}

export interface TestUser {
  id: string;
  email: string;
  fullName: string;
  password: string;
}

export async function createUser(options: {
  email: string;
  fullName?: string;
  studentId?: string | null | undefined;
  roles?: RoleName[];
  accountStatus?: 'ACTIVE' | 'PENDING_VERIFICATION' | 'SUSPENDED' | 'DEACTIVATED';
  emailVerified?: boolean;
  password?: string;
  departmentId?: string | null | undefined;
  departmentRole?: 'OFFICER' | 'HEAD' | undefined;
}): Promise<TestUser> {
  const password = options.password ?? TEST_PASSWORD;
  const user = await prisma.user.create({
    data: {
      fullName: options.fullName ?? `Test ${options.email}`,
      email: options.email.toLowerCase(),
      studentId: options.studentId ?? null,
      passwordHash: await hashPassword(password),
      accountStatus: options.accountStatus ?? 'ACTIVE',
      emailVerifiedAt: options.emailVerified === false ? null : clock.now(),
      ...(options.departmentId
        ? {
            memberships: {
              create: {
                departmentId: options.departmentId,
                departmentRole: options.departmentRole ?? 'OFFICER',
              },
            },
          }
        : {}),
    },
  });

  for (const roleName of options.roles ?? ['STUDENT']) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  return { id: user.id, email: user.email, fullName: user.fullName, password };
}

export async function createDepartment(options: {
  name: string;
  isFallbackQueue?: boolean;
  isActive?: boolean;
}): Promise<{ id: string; name: string }> {
  return prisma.department.create({
    data: {
      name: options.name,
      isFallbackQueue: options.isFallbackQueue ?? false,
      isActive: options.isActive ?? true,
      serviceTarget: {
        create: {
          firstResponseMinutes: 480,
          resolutionMinutes: 4320,
          reminderIntervalMinutes: 120,
          maxReminders: 8,
          escalationAfterReminders: 3,
        },
      },
    },
    select: { id: true, name: true },
  });
}

export async function createCategory(options: {
  name: string;
  departmentId?: string | null | undefined;
}): Promise<{ id: string; name: string }> {
  return prisma.category.create({
    data: { name: options.name, departmentId: options.departmentId ?? null },
    select: { id: true, name: true },
  });
}

/**
 * Minimal HTTP client that keeps cookies and echoes the CSRF token, mirroring
 * the behaviour of the browser client.
 */
export class ApiClient {
  private cookies = new Map<string, string>();
  private csrfToken: string | undefined;
  private sendCsrf = true;

  constructor(private readonly app: Express) {}

  async request(method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, body?: unknown) {
    const agent = supertest(this.app);
    let request = agent[method](url);
    if (this.cookies.size > 0) {
      request = request.set(
        'Cookie',
        [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '),
      );
    }
    if (this.csrfToken && method !== 'get' && this.sendCsrf) {
      request = request.set('X-CSRF-Token', this.csrfToken);
    }
    if (body !== undefined) {
      request = request.send(body as object);
    }
    const response = await request;
    this.captureCookies(response.headers['set-cookie'] as unknown);
    return response;
  }

  get(url: string) {
    return this.request('get', url);
  }

  post(url: string, body?: unknown) {
    return this.request('post', url, body ?? {});
  }

  patch(url: string, body?: unknown) {
    return this.request('patch', url, body ?? {});
  }

  put(url: string, body?: unknown) {
    return this.request('put', url, body ?? {});
  }

  delete(url: string) {
    return this.request('delete', url);
  }

  /** Uploads a file as multipart/form-data. */
  async postFile(
    url: string,
    field: string,
    file: { buffer: Buffer; filename: string; contentType: string },
  ) {
    const agent = supertest(this.app);
    let request = agent.post(url);
    if (this.cookies.size > 0) {
      request = request.set(
        'Cookie',
        [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '),
      );
    }
    if (this.csrfToken) {
      request = request.set('X-CSRF-Token', this.csrfToken);
    }
    const response = await request.attach(field, file.buffer, {
      filename: file.filename,
      contentType: file.contentType,
    });
    this.captureCookies(response.headers['set-cookie'] as unknown);
    return response;
  }

  async login(email: string, password: string): Promise<void> {
    const response = await this.post('/api/v1/auth/login', { email, password });
    if (response.status !== 200) {
      throw new Error(`Login failed (${response.status}): ${JSON.stringify(response.body)}`);
    }
  }

  get csrf(): string | undefined {
    return this.csrfToken;
  }

  /** Controls whether the CSRF header is sent with the next requests. */
  setCsrfEnabled(enabled: boolean): void {
    this.sendCsrf = enabled;
  }

  clear() {
    this.cookies.clear();
    this.csrfToken = undefined;
  }

  private captureCookies(setCookies: unknown): void {
    if (!Array.isArray(setCookies)) return;
    for (const cookie of setCookies as string[]) {
      const [pair] = cookie.split(';');
      if (!pair) continue;
      const index = pair.indexOf('=');
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = decodeURIComponent(pair.slice(index + 1).trim());
      this.cookies.set(name, value);
      if (name === 'campus_csrf') this.csrfToken = value;
    }
  }
}

export function buildApp(): Express {
  return createApp();
}

export { clock, prisma };

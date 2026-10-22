import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApiClient,
  TEST_PASSWORD,
  clock,
  createCategory,
  createDepartment,
  createUser,
  prisma,
  resetDatabase,
} from './helpers/test-app';
import { buildApp } from './helpers/test-app';
import { runJob } from '../src/jobs/handlers';

const app = buildApp();

async function loginAs(email: string): Promise<ApiClient> {
  const client = new ApiClient(app);
  await client.login(email, TEST_PASSWORD);
  return client;
}

interface Fixture {
  department: { id: string; name: string };
  otherDepartment: { id: string; name: string };
  category: { id: string; name: string };
  student: { id: string; email: string };
  officer: { id: string; email: string };
  head: { id: string; email: string };
  admin: { id: string; email: string };
  superAdmin: { id: string; email: string };
}

async function setupFixture(): Promise<Fixture> {
  const department = await createDepartment({ name: 'Examinations Office' });
  const otherDepartment = await createDepartment({ name: 'Fees Office' });
  const category = await createCategory({ name: 'Missing results', departmentId: department.id });

  const student = await createUser({ email: '10234567@live.gctu.edu.gh', studentId: '10234567' });
  const officer = await createUser({
    email: 'officer@live.gctu.edu.gh',
    roles: ['OFFICER'],
    departmentId: department.id,
  });
  const head = await createUser({
    email: 'head@live.gctu.edu.gh',
    roles: ['DEPARTMENT_HEAD'],
    departmentId: department.id,
    departmentRole: 'HEAD',
  });
  const admin = await createUser({ email: 'admin@live.gctu.edu.gh', roles: ['ADMIN'] });
  const superAdmin = await createUser({ email: 'root@live.gctu.edu.gh', roles: ['SUPER_ADMIN'] });

  return { department, otherDepartment, category, student, officer, head, admin, superAdmin };
}

async function createTicket(
  client: ApiClient,
  fixture: Fixture,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; referenceNumber: string; status: string }> {
  const response = await client.post('/api/v1/tickets', {
    categoryId: fixture.category.id,
    departmentId: fixture.department.id,
    studentEmail: fixture.student.email,
    subject: 'My examination results are missing from the portal',
    description:
      'My semester results were not uploaded to the student portal and I need them for registration.',
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body;
}

describe('administration', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
  });

  it('restricts the operations dashboard to administrators', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const denied = await student.get('/api/v1/admin/dashboard');
    expect(denied.status).toBe(403);

    const admin = await loginAs(fixture.admin.email);
    const allowed = await admin.get('/api/v1/admin/dashboard');
    expect(allowed.status).toBe(200);
    expect(allowed.body.dashboard.totals.total).toBe(0);
    expect(Array.isArray(allowed.body.dashboard.departments)).toBe(true);
  });

  it('reports ticket volume in the operations dashboard', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    await createTicket(student, fixture);
    await createTicket(student, fixture);

    const admin = await loginAs(fixture.admin.email);
    const response = await admin.get('/api/v1/admin/dashboard');

    expect(response.status).toBe(200);
    expect(response.body.dashboard.totals.total).toBe(2);
    expect(response.body.dashboard.totals.unassigned).toBe(2);

    const departmentRow = response.body.dashboard.departments.find(
      (row: { id: string }) => row.id === fixture.department.id,
    );
    expect(departmentRow.total).toBe(2);
  });

  it('lists users with search and role filters', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const all = await admin.get('/api/v1/admin/users?pageSize=50');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(5);

    const officers = await admin.get('/api/v1/admin/users?role=OFFICER');
    expect(officers.body.total).toBe(1);
    expect(officers.body.items[0].email).toBe(fixture.officer.email);

    const searched = await admin.get(
      `/api/v1/admin/users?search=${encodeURIComponent('officer@')}`,
    );
    expect(searched.body.total).toBe(1);
  });

  it('invites a staff member and records the invitation in the audit trail', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.post('/api/v1/admin/users/invite', {
      email: 'new.officer@live.gctu.edu.gh',
      fullName: 'New Officer',
      role: 'OFFICER',
      departmentId: fixture.department.id,
      departmentRole: 'OFFICER',
    });

    expect(response.status).toBe(201);
    expect(response.body.user.roles).toEqual(['OFFICER']);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'new.officer@live.gctu.edu.gh' },
      include: { roles: { include: { role: true } }, memberships: true },
    });
    expect(user.accountStatus).toBe('PENDING_VERIFICATION');
    expect(user.roles.map((entry) => entry.role.name)).toEqual(['OFFICER']);
    expect(user.memberships).toHaveLength(1);

    const audit = await admin.get('/api/v1/admin/audit-logs?action=USER_INVITED');
    expect(audit.status).toBe(200);
    expect(audit.body.total).toBe(1);
  });

  it('replaces the student role when a staff role is granted', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.patch(`/api/v1/admin/users/${fixture.student.id}/role`, {
      role: 'OFFICER',
      departmentId: fixture.department.id,
      departmentRole: 'OFFICER',
    });

    expect(response.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: fixture.student.id },
      include: { roles: { include: { role: true } } },
    });
    expect(user.roles.map((entry) => entry.role.name)).toEqual(['OFFICER']);
  });

  it('suspends an account, revokes its sessions and notifies the user', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.patch(`/api/v1/admin/users/${fixture.student.id}/status`, {
      accountStatus: 'SUSPENDED',
      reason: 'Testing the suspension path',
    });
    expect(response.status).toBe(200);

    const sessions = await prisma.session.findMany({ where: { userId: fixture.student.id } });
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);

    const me = await student.get('/api/v1/auth/me');
    expect(me.status).toBe(401);

    const notifications = await prisma.notification.findMany({
      where: { recipientId: fixture.student.id, type: 'ACCOUNT_SUSPENDED' },
    });
    expect(notifications).toHaveLength(1);
  });

  it('lets an invited officer choose their own password and sign in', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const invited = await admin.post('/api/v1/admin/users/invite', {
      email: 'new.officer@live.gctu.edu.gh',
      fullName: 'New Officer',
      role: 'OFFICER',
      departmentId: fixture.department.id,
      departmentRole: 'OFFICER',
    });
    expect(invited.status).toBe(201);

    // The invitation email carries a single-use token.
    const token = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { user: { email: 'new.officer@live.gctu.edu.gh' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(token.usedAt).toBeNull();

    const notification = await prisma.notification.findFirstOrThrow({
      where: { recipientId: invited.body.user.id, type: 'STAFF_INVITATION' },
    });
    const rawToken = (notification.payload as { token: string }).token;
    expect(rawToken).toBeTruthy();

    const client = new ApiClient(app);

    const accepted = await client.post('/api/v1/auth/accept-invitation', {
      token: rawToken,
      password: 'Ch00se!StrongPassword',
    });
    expect(accepted.status).toBe(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'new.officer@live.gctu.edu.gh' },
    });
    expect(user.accountStatus).toBe('ACTIVE');
    expect(user.emailVerifiedAt).not.toBeNull();

    // The token is single use.
    const replay = await new ApiClient(app).post('/api/v1/auth/accept-invitation', {
      token: rawToken,
      password: 'An0ther!StrongPassword',
    });
    expect(replay.status).toBe(400);

    // The chosen password works.
    const officer = new ApiClient(app);
    await officer.login('new.officer@live.gctu.edu.gh', 'Ch00se!StrongPassword');
    const me = await officer.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.roles).toEqual(['OFFICER']);
  });

  it('refuses to treat a student verification token as a staff invitation', async () => {
    const client = new ApiClient(app);
    await client.post('/api/v1/auth/register', {
      fullName: 'Self Registered',
      email: '10239999@live.gctu.edu.gh',
      password: TEST_PASSWORD,
      acceptTerms: true,
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { type: 'EMAIL_VERIFICATION' },
      orderBy: { createdAt: 'desc' },
    });
    const studentToken = (notification.payload as { token: string }).token;

    const response = await new ApiClient(app).post('/api/v1/auth/accept-invitation', {
      token: studentToken,
      password: 'Ch00se!StrongPassword',
    });
    expect(response.status).toBe(422);

    // The student account is untouched by the failed attempt.
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: '10239999@live.gctu.edu.gh' },
    });
    expect(user.accountStatus).toBe('PENDING_VERIFICATION');
    expect(user.emailVerifiedAt).toBeNull();
  });

  it('creates and updates departments, categories and service targets', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const created = await admin.post('/api/v1/admin/departments', {
      name: 'Academic Affairs',
      description: 'Handles academic administration',
      contactEmail: 'academic@live.gctu.edu.gh',
    });
    expect(created.status).toBe(201);
    const departmentId = created.body.department.id as string;

    const updated = await admin.patch(`/api/v1/admin/departments/${departmentId}`, {
      description: 'Updated description',
    });
    expect(updated.status).toBe(200);

    const target = await admin.put(`/api/v1/admin/departments/${departmentId}/service-target`, {
      firstResponseMinutes: 240,
      resolutionMinutes: 2880,
      reminderIntervalMinutes: 60,
      maxReminders: 5,
      escalationAfterReminders: 2,
    });
    expect(target.status).toBe(200);
    expect(target.body.serviceTarget.firstResponseMinutes).toBe(240);

    const category = await admin.post('/api/v1/admin/categories', {
      name: 'Transcript request',
      departmentId,
      defaultPriority: 'NORMAL',
    });
    expect(category.status).toBe(201);

    const patched = await admin.patch(`/api/v1/admin/categories/${category.body.category.id}`, {
      description: 'Requests for official transcripts',
    });
    expect(patched.status).toBe(200);
  });

  it('exports ticket data as CSV without student contact details', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    await createTicket(student, fixture);

    const admin = await loginAs(fixture.admin.email);
    const response = await admin.get('/api/v1/admin/reports?type=tickets&format=csv');

    expect(response.status).toBe(200);
    const csv = response.body.csv as string;
    expect(csv).toContain('reference,subject');
    expect(csv).toContain('My examination results are missing from the portal');
    expect(csv).toContain('Missing results');
    expect(csv).not.toContain(fixture.student.email);
    expect(csv).toContain('10234567');
  });

  it('stores and returns system settings', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const before = await admin.get('/api/v1/admin/settings');
    expect(before.status).toBe(200);
    expect(before.body.settings.institutionName).toBe('Campus Resolve');

    const update = await admin.patch('/api/v1/admin/settings', {
      institutionName: 'GCTU Campus Resolve',
      remindersPaused: true,
    });
    expect(update.status).toBe(200);
    expect(update.body.settings.institutionName).toBe('GCTU Campus Resolve');
    expect(update.body.settings.remindersPaused).toBe(true);

    const after = await admin.get('/api/v1/admin/settings');
    expect(after.body.settings.remindersPaused).toBe(true);
  });

  it('reports background job and notification health', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.get('/api/v1/admin/system/health');
    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveProperty('pending');
    expect(response.body.notifications).toHaveProperty('failed');
    expect(typeof response.body.emailProvider).toBe('string');
  });

  it('queues a retry for every failed notification', async () => {
    const fixture = await setupFixture();
    const admin = await loginAs(fixture.admin.email);

    const student = await prisma.user.findUniqueOrThrow({ where: { id: fixture.student.id } });
    await prisma.notification.create({
      data: {
        recipientId: student.id,
        type: 'TICKET_SUBMITTED',
        status: 'FAILED',
        payload: {},
        idempotencyKey: 'failed-notification-1',
      },
    });

    const response = await admin.post('/api/v1/admin/system/retry-failed-notifications');
    expect(response.status).toBe(200);
    expect(response.body.queued).toBe(1);

    const jobs = await prisma.job.findMany({ where: { type: 'NOTIFICATION_DELIVERY' } });
    expect(jobs).toHaveLength(1);
  });
});

describe('department operations', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
  });

  it('lists departments and categories with their counts', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const departments = await student.get('/api/v1/departments');
    expect(departments.status).toBe(200);
    expect(departments.body.items).toHaveLength(2);

    const examinations = departments.body.items.find(
      (item: { id: string }) => item.id === fixture.department.id,
    );
    expect(examinations.staffCount).toBe(2);
    expect(examinations.categoryCount).toBe(1);

    const categories = await student.get('/api/v1/departments/categories');
    expect(categories.status).toBe(200);
    expect(categories.body.items).toHaveLength(1);
    expect(categories.body.items[0].departmentName).toBe('Examinations Office');
  });

  it('lists the officers a student may nominate', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const response = await student.get(`/api/v1/departments/${fixture.department.id}/officers`);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(
      response.body.items.some(
        (item: { fullName: string }) => item.fullName === 'Test officer@live.gctu.edu.gh',
      ),
    ).toBe(true);
  });

  it('keeps department analytics inside the department scope', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    await createTicket(student, fixture);

    const officer = await loginAs(fixture.officer.email);
    const allowed = await officer.get(`/api/v1/departments/${fixture.department.id}/analytics`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.metrics.total).toBe(1);
    expect(allowed.body.metrics.unassigned).toBe(1);

    const denied = await officer.get(`/api/v1/departments/${fixture.otherDepartment.id}/analytics`);
    expect(denied.status).toBe(403);
  });

  it('reports the workload of each officer in a department', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    await createTicket(student, fixture, { assignedToId: fixture.officer.id });

    const head = await loginAs(fixture.head.email);
    const response = await head.get(`/api/v1/departments/${fixture.department.id}/workload`);
    expect(response.status).toBe(200);

    const officerRow = response.body.items.find(
      (item: { userId: string }) => item.userId === fixture.officer.id,
    );
    expect(officerRow.assigned).toBe(1);
  });

  it('lets a department head manage staff inside their own department only', async () => {
    const fixture = await setupFixture();
    const head = await loginAs(fixture.head.email);

    const allowed = await head.patch(`/api/v1/admin/users/${fixture.officer.id}/role`, {
      role: 'OFFICER',
      departmentId: fixture.department.id,
      departmentRole: 'OFFICER',
    });
    expect(allowed.status).toBe(200);

    const denied = await head.patch(`/api/v1/admin/users/${fixture.student.id}/role`, {
      role: 'OFFICER',
      departmentId: fixture.otherDepartment.id,
      departmentRole: 'OFFICER',
    });
    expect(denied.status).toBe(403);
  });
});

describe('notifications', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
  });

  it('only returns the notifications addressed to the caller', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const otherStudent = await createUser({
      email: '10234568@live.gctu.edu.gh',
      studentId: '10234568',
    });

    await createTicket(student, fixture);

    const mine = await student.get('/api/v1/notifications');
    expect(mine.status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThan(0);

    const theirs = await loginAs(otherStudent.email);
    const other = await theirs.get('/api/v1/notifications');
    expect(other.body.items).toHaveLength(0);
  });

  it('queues a delivery job and records a notification attempt when it is sent', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    await createTicket(student, fixture);

    const notification = await prisma.notification.findFirstOrThrow({
      where: { recipientId: fixture.student.id },
    });
    expect(notification.status).toBe('PENDING');

    const job = await prisma.job.findFirstOrThrow({
      where: { type: 'NOTIFICATION_DELIVERY' },
    });
    expect(job.status).toBe('PENDING');
    expect(job.payload).toMatchObject({ notificationId: notification.id });

    const result = await runJob(job);
    expect(result.sent).toBe(true);

    const delivered = await prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
    });
    expect(delivered.status).toBe('SENT');
    expect(delivered.sentAt).not.toBeNull();

    const attempts = await prisma.notificationAttempt.findMany({
      where: { notificationId: notification.id },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.attemptNumber).toBe(1);
    expect(attempts[0]!.status).toBe('SENT');
  });
});

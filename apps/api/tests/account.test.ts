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
import { ACCOUNT_DELETION_CONFIRMATION } from '@campus-resolve/shared';

const app = buildApp();

async function loginAs(email: string): Promise<ApiClient> {
  const client = new ApiClient(app);
  await client.login(email, TEST_PASSWORD);
  return client;
}

async function seedFixture() {
  const department = await createDepartment({ name: 'Examinations Office' });
  const category = await createCategory({ name: 'Missing results', departmentId: department.id });
  const student = await createUser({
    email: '10234567@live.gctu.edu.gh',
    studentId: '10234567',
  });
  const admin = await createUser({ email: 'admin@live.gctu.edu.gh', roles: ['ADMIN'] });
  const superAdmin = await createUser({ email: 'root@live.gctu.edu.gh', roles: ['SUPER_ADMIN'] });
  return { department, category, student, admin, superAdmin };
}

async function createTicket(studentId: string, categoryId: string, departmentId: string) {
  return prisma.ticket.create({
    data: {
      referenceNumber: `ACCT-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      studentId,
      categoryId,
      departmentId,
      subject: 'My examination results are missing from the portal',
      description: 'My semester results were never uploaded to the student portal.',
      contactPhone: '+233200000000',
    },
  });
}

describe('account erasure (danger zone)', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
  });

  it('erases the account but keeps the tickets, replies and audit trail', async () => {
    const fixture = await seedFixture();
    const ticket = await createTicket(fixture.student.id, fixture.category.id, fixture.department.id);

    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: fixture.student.id,
        messageBody: 'My results are still missing.',
        visibility: 'PUBLIC',
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: fixture.student.id,
        action: 'TICKET_CREATED',
        entityType: 'Ticket',
        entityId: ticket.id,
      },
    });

    const client = await loginAs(fixture.student.email);
    const response = await client.delete('/api/v1/auth/account', {
      currentPassword: TEST_PASSWORD,
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    expect(response.status).toBe(200);
    expect(response.body.retainedRecords.tickets).toBe(1);
    expect(response.body.retainedRecords.messages).toBe(1);
    expect(response.body.retainedRecords.auditLogs).toBeGreaterThanOrEqual(1);

    // The identity is gone.
    const erased = await prisma.user.findUnique({ where: { id: fixture.student.id } });
    expect(erased).not.toBeNull();
    expect(erased!.email).toBe(`deleted-${fixture.student.id}@deleted.invalid`);
    expect(erased!.fullName).toBe('Deleted account');
    expect(erased!.passwordHash).toBeNull();
    expect(erased!.studentId).toBeNull();
    expect(erased!.accountStatus).toBe('DEACTIVATED');
    expect(erased!.emailVerifiedAt).toBeNull();

    // The institutional record survives untouched.
    const keptTicket = await prisma.ticket.findUnique({ where: { id: ticket.id } });
    expect(keptTicket).not.toBeNull();
    expect(keptTicket!.studentId).toBe(fixture.student.id);
    expect(keptTicket!.contactPhone).toBeNull();

    const keptMessages = await prisma.ticketMessage.findMany({ where: { ticketId: ticket.id } });
    expect(keptMessages).toHaveLength(1);

    const keptAudit = await prisma.auditLog.findMany({ where: { actorId: fixture.student.id } });
    expect(keptAudit.length).toBeGreaterThanOrEqual(1);

    // The deletion itself is audited.
    const deletion = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_DELETED' } });
    expect(deletion).not.toBeNull();
    expect(deletion!.entityId).toBe(fixture.student.id);

    // Sessions are gone and the account can no longer sign in.
    expect(await prisma.session.count({ where: { userId: fixture.student.id } })).toBe(0);
    const login = await new ApiClient(app).post('/api/v1/auth/login', {
      email: fixture.student.email,
      password: TEST_PASSWORD,
    });
    expect(login.status).not.toBe(200);
  });

  it('refuses to delete an account without the correct password', async () => {
    const fixture = await seedFixture();
    const client = await loginAs(fixture.student.email);

    const response = await client.delete('/api/v1/auth/account', {
      currentPassword: 'TheWrongPassword1',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    expect(response.status).toBe(400);
    const user = await prisma.user.findUnique({ where: { id: fixture.student.id } });
    expect(user!.email).toBe(fixture.student.email);
  });

  it('requires the confirmation phrase', async () => {
    const fixture = await seedFixture();
    const client = await loginAs(fixture.student.email);

    const response = await client.delete('/api/v1/auth/account', {
      currentPassword: TEST_PASSWORD,
      confirmation: 'delete my account',
    });

    expect(response.status).toBe(422);
    const user = await prisma.user.findUnique({ where: { id: fixture.student.id } });
    expect(user!.email).toBe(fixture.student.email);
  });

  it('lets an administrator delete somebody else and records the reason', async () => {
    const fixture = await seedFixture();
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.delete(`/api/v1/admin/users/${fixture.student.id}`, {
      reason: 'The student asked for their account to be removed.',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    expect(response.status).toBe(200);
    const erased = await prisma.user.findUnique({ where: { id: fixture.student.id } });
    expect(erased!.accountStatus).toBe('DEACTIVATED');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_DELETED' } });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(fixture.admin.id);
    expect((audit!.metadata as { scope: string }).scope).toBe('admin');
    expect((audit!.metadata as { reason: string }).reason).toContain('asked');
  });

  it('stops an administrator from deleting a super administrator', async () => {
    const fixture = await seedFixture();
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.delete(`/api/v1/admin/users/${fixture.superAdmin.id}`, {
      reason: 'Not allowed to do this.',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    expect(response.status).toBe(403);
    const user = await prisma.user.findUnique({ where: { id: fixture.superAdmin.id } });
    expect(user!.accountStatus).toBe('ACTIVE');
  });

  it('protects the last super administrator account', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const response = await superAdmin.delete(`/api/v1/admin/users/${fixture.superAdmin.id}`, {
      reason: 'Trying to remove the last administrator.',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    // The route refuses a self-delete outright.
    expect(response.status).toBe(400);

    // And the danger zone refuses it as well, because no super administrator
    // would be left.
    const self = await superAdmin.delete('/api/v1/auth/account', {
      currentPassword: TEST_PASSWORD,
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });
    expect(self.status).toBe(409);

    const user = await prisma.user.findUnique({ where: { id: fixture.superAdmin.id } });
    expect(user!.accountStatus).toBe('ACTIVE');
  });

  it('allows the last super administrator to be removed once another one exists', async () => {
    const fixture = await seedFixture();
    const second = await createUser({ email: 'root2@live.gctu.edu.gh', roles: ['SUPER_ADMIN'] });
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const response = await superAdmin.delete(`/api/v1/admin/users/${second.id}`, {
      reason: 'Replacing the second super administrator account.',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    expect(response.status).toBe(200);
    const erased = await prisma.user.findUnique({ where: { id: second.id } });
    expect(erased!.accountStatus).toBe('DEACTIVATED');
  });

  it('does not let a student delete somebody else', async () => {
    const fixture = await seedFixture();
    const student = await loginAs(fixture.student.email);

    const response = await student.delete(`/api/v1/admin/users/${fixture.admin.id}`, {
      reason: 'Trying to remove an administrator.',
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
    });

    expect(response.status).toBe(403);
  });
});

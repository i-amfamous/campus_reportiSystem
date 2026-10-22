import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import {
  ApiClient,
  buildApp,
  clock,
  createCategory,
  createDepartment,
  createUser,
  prisma,
  resetDatabase,
  TEST_PASSWORD,
} from './helpers/test-app';

const app: Express = buildApp();

async function loginAs(email: string): Promise<ApiClient> {
  const client = new ApiClient(app);
  await client.login(email, TEST_PASSWORD);
  return client;
}

describe('authorization boundaries', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
  });

  it("prevents a student from reading another student's ticket", async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const category = await createCategory({ name: 'Missing Results', departmentId: department.id });
    const owner = await createUser({ email: '10231001@live.gctu.edu.gh', roles: ['STUDENT'] });
    const intruder = await createUser({ email: '10231002@live.gctu.edu.gh', roles: ['STUDENT'] });

    const ownerClient = await loginAs(owner.email);
    const created = await ownerClient.post('/api/v1/tickets', {
      categoryId: category.id,
      departmentId: department.id,
      studentEmail: owner.email,
      subject: 'Private academic issue that must stay private',
      description: 'This description contains personal academic information about my record.',
    });
    expect(created.status).toBe(201);

    const intruderClient = await loginAs(intruder.email);
    const response = await intruderClient.get(`/api/v1/tickets/${created.body.id}`);
    expect(response.status).toBe(403);

    const list = await intruderClient.get('/api/v1/tickets');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('prevents a student from changing their own role', async () => {
    const student = await createUser({ email: '10231003@live.gctu.edu.gh', roles: ['STUDENT'] });
    const client = await loginAs(student.email);

    const response = await client.patch(`/api/v1/admin/users/${student.id}/role`, {
      role: 'SUPER_ADMIN',
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');

    const roles = await prisma.userRole.findMany({
      where: { userId: student.id },
      include: { role: true },
    });
    expect(roles.map((role) => role.role.name)).toEqual(['STUDENT']);
  });

  it('prevents a student from granting themselves a staff role through the invite endpoint', async () => {
    const student = await createUser({ email: '10231004@live.gctu.edu.gh', roles: ['STUDENT'] });
    const client = await loginAs(student.email);

    const response = await client.post('/api/v1/admin/users/invite', {
      email: 'sneaky@live.gctu.edu.gh',
      fullName: 'Sneaky Attacker',
      role: 'ADMIN',
    });
    expect(response.status).toBe(403);
    expect(await prisma.user.count({ where: { email: 'sneaky@live.gctu.edu.gh' } })).toBe(0);
  });

  it("prevents an officer from accessing another department's ticket", async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const finance = await createDepartment({ name: 'Student Finance Office' });
    const category = await createCategory({ name: 'Missing Results', departmentId: department.id });
    const student = await createUser({ email: '10231005@live.gctu.edu.gh', roles: ['STUDENT'] });
    const foreignOfficer = await createUser({
      email: 'finance.officer@live.gctu.edu.gh',
      roles: ['OFFICER'],
      departmentId: finance.id,
    });

    const studentClient = await loginAs(student.email);
    const created = await studentClient.post('/api/v1/tickets', {
      categoryId: category.id,
      departmentId: department.id,
      studentEmail: student.email,
      subject: 'Academic record problem',
      description: 'My grades are not correctly reflected in the academic records system.',
    });

    const officerClient = await loginAs(foreignOfficer.email);
    const response = await officerClient.get(`/api/v1/tickets/${created.body.id}`);
    expect(response.status).toBe(403);

    const list = await officerClient.get('/api/v1/staff/tickets');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('prevents an officer from creating an internal note through the public message endpoint', async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const category = await createCategory({ name: 'Missing Results', departmentId: department.id });
    const student = await createUser({ email: '10231006@live.gctu.edu.gh', roles: ['STUDENT'] });
    const officer = await createUser({
      email: 'officer@live.gctu.edu.gh',
      roles: ['OFFICER'],
      departmentId: department.id,
    });

    const studentClient = await loginAs(student.email);
    const created = await studentClient.post('/api/v1/tickets', {
      categoryId: category.id,
      departmentId: department.id,
      studentEmail: student.email,
      subject: 'Academic record problem',
      description: 'My grades are not correctly reflected in the academic records system.',
    });

    const officerClient = await loginAs(officer.email);
    const response = await officerClient.post(`/api/v1/tickets/${created.body.id}/messages`, {
      body: 'Trying to hide this note from the student',
      visibility: 'INTERNAL',
    });
    expect(response.status).toBe(201);

    const message = await prisma.ticketMessage.findFirst({
      where: { ticketId: created.body.id },
    });
    expect(message!.visibility).toBe('PUBLIC');
  });

  it('prevents a department head from granting system-wide roles', async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const head = await createUser({
      email: 'head@live.gctu.edu.gh',
      roles: ['DEPARTMENT_HEAD'],
      departmentId: department.id,
      departmentRole: 'HEAD',
    });
    const target = await createUser({ email: '10231007@live.gctu.edu.gh', roles: ['STUDENT'] });

    const client = await loginAs(head.email);
    const response = await client.patch(`/api/v1/admin/users/${target.id}/role`, {
      role: 'ADMIN',
    });
    expect(response.status).toBe(403);
  });

  it('prevents an administrator from granting the super administrator role', async () => {
    const admin = await createUser({ email: 'admin@live.gctu.edu.gh', roles: ['ADMIN'] });
    const target = await createUser({ email: '10231008@live.gctu.edu.gh', roles: ['STUDENT'] });

    const client = await loginAs(admin.email);
    const response = await client.patch(`/api/v1/admin/users/${target.id}/role`, {
      role: 'SUPER_ADMIN',
    });
    expect(response.status).toBe(403);
  });

  it('allows a super administrator to grant the super administrator role', async () => {
    const superAdmin = await createUser({ email: 'root@live.gctu.edu.gh', roles: ['SUPER_ADMIN'] });
    const target = await createUser({ email: '10231009@live.gctu.edu.gh', roles: ['STUDENT'] });

    const client = await loginAs(superAdmin.email);
    const response = await client.patch(`/api/v1/admin/users/${target.id}/role`, {
      role: 'SUPER_ADMIN',
    });
    expect(response.status).toBe(200);

    const roles = await prisma.userRole.findMany({
      where: { userId: target.id },
      include: { role: true },
    });
    expect(roles.map((role) => role.role.name)).toEqual(['SUPER_ADMIN']);
  });

  it('prevents an unauthorised user from downloading a private attachment', async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const category = await createCategory({ name: 'Missing Results', departmentId: department.id });
    const owner = await createUser({ email: '10231010@live.gctu.edu.gh', roles: ['STUDENT'] });
    const intruder = await createUser({ email: '10231011@live.gctu.edu.gh', roles: ['STUDENT'] });

    const ownerClient = await loginAs(owner.email);
    const created = await ownerClient.post('/api/v1/tickets', {
      categoryId: category.id,
      departmentId: department.id,
      studentEmail: owner.email,
      subject: 'Academic record problem with evidence',
      description: 'Attaching a screenshot of the portal showing the missing result.',
    });

    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
    const upload = await ownerClient.postFile(
      `/api/v1/tickets/${created.body.id}/attachments`,
      'file',
      { buffer: pdf, filename: 'evidence.pdf', contentType: 'application/pdf' },
    );
    expect(upload.status).toBe(201);

    const attachmentId = upload.body.attachment.id;

    const intruderClient = await loginAs(intruder.email);
    const denied = await intruderClient.get(
      `/api/v1/tickets/${created.body.id}/attachments/${attachmentId}/download`,
    );
    expect(denied.status).toBe(403);

    const allowed = await ownerClient.get(
      `/api/v1/tickets/${created.body.id}/attachments/${attachmentId}/download`,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers['content-type']).toContain('application/pdf');
  });

  it('rejects an attachment whose content does not match its declared type', async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const category = await createCategory({ name: 'Missing Results', departmentId: department.id });
    const owner = await createUser({ email: '10231012@live.gctu.edu.gh', roles: ['STUDENT'] });

    const ownerClient = await loginAs(owner.email);
    const created = await ownerClient.post('/api/v1/tickets', {
      categoryId: category.id,
      departmentId: department.id,
      studentEmail: owner.email,
      subject: 'Academic record problem with a suspicious file',
      description: 'Attaching a file that claims to be a PDF but is not.',
    });

    const fake = Buffer.from('MZ\x90\x00this is an executable pretending to be a pdf');
    const upload = await ownerClient.postFile(
      `/api/v1/tickets/${created.body.id}/attachments`,
      'file',
      { buffer: fake, filename: 'evidence.pdf', contentType: 'application/pdf' },
    );

    expect(upload.status).toBe(415);
    expect(upload.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('writes an audit record for a privileged action', async () => {
    const admin = await createUser({ email: 'admin@live.gctu.edu.gh', roles: ['ADMIN'] });
    const client = await loginAs(admin.email);

    const created = await client.post('/api/v1/admin/departments', {
      name: 'Quality Assurance Unit',
      description: 'Handles quality assurance complaints.',
    });
    expect(created.status).toBe(201);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DEPARTMENT_CREATED', entityId: created.body.department.id },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(admin.id);
  });

  it('keeps administrative endpoints out of reach for students and officers', async () => {
    const student = await createUser({ email: '10231013@live.gctu.edu.gh', roles: ['STUDENT'] });
    const officer = await createUser({ email: 'officer@live.gctu.edu.gh', roles: ['OFFICER'] });

    for (const user of [student, officer]) {
      const client = await loginAs(user.email);
      expect((await client.get('/api/v1/admin/dashboard')).status).toBe(403);
      expect((await client.get('/api/v1/admin/users')).status).toBe(403);
      expect((await client.get('/api/v1/admin/audit-logs')).status).toBe(403);
      expect((await client.get('/api/v1/admin/settings')).status).toBe(403);
    }
  });

  it('restricts department analytics to the department scope', async () => {
    const department = await createDepartment({ name: 'Academic Affairs' });
    const finance = await createDepartment({ name: 'Student Finance Office' });
    const financeHead = await createUser({
      email: 'finance.head@live.gctu.edu.gh',
      roles: ['DEPARTMENT_HEAD'],
      departmentId: finance.id,
      departmentRole: 'HEAD',
    });

    const client = await loginAs(financeHead.email);
    expect((await client.get(`/api/v1/departments/${department.id}/analytics`)).status).toBe(403);
    expect((await client.get(`/api/v1/departments/${finance.id}/analytics`)).status).toBe(200);
  });
});

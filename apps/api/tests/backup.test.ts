import { readFile, rm } from 'node:fs/promises';
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
import { backupRoot } from '../src/config/env';
import { storageProvider } from '../src/services/storage.service';

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

describe('backup and restore', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
    // The archives live on disk, so they have to be cleared between tests.
    await rm(backupRoot(), { recursive: true, force: true });
  });

  it('lets a super administrator create and list a backup', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const created = await superAdmin.post('/api/v1/admin/backups');
    expect(created.status).toBe(201);
    expect(created.body.backup.filename).toMatch(/\.tar\.gz$/);
    expect(created.body.backup.rows).toBeGreaterThan(0);
    expect(created.body.backup.tables).toBe(27);

    const listed = await superAdmin.get('/api/v1/admin/backups');
    expect(listed.status).toBe(200);
    expect(listed.body.backups).toHaveLength(1);
    expect(listed.body.backups[0].id).toBe(created.body.backup.id);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'BACKUP_CREATED' } });
    expect(audit).not.toBeNull();

    await superAdmin.delete(`/api/v1/admin/backups/${created.body.backup.id}`);
  });

  it('refuses backup operations to a regular administrator', async () => {
    const fixture = await seedFixture();
    const admin = await loginAs(fixture.admin.email);

    const response = await admin.post('/api/v1/admin/backups');
    expect(response.status).toBe(403);

    const listed = await admin.get('/api/v1/admin/backups');
    expect(listed.status).toBe(403);
  });

  it('serves the archive for download', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const created = await superAdmin.post('/api/v1/admin/backups');
    const id = created.body.backup.id;

    const download = await superAdmin.get(`/api/v1/admin/backups/${id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain(`${id}.tar.gz`);

    await superAdmin.delete(`/api/v1/admin/backups/${id}`);
  });

  it('restores the platform from an archive', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const ticket = await prisma.ticket.create({
      data: {
        referenceNumber: 'BKUP-RESTORE-1',
        studentId: fixture.student.id,
        categoryId: fixture.category.id,
        departmentId: fixture.department.id,
        subject: 'My examination results are missing from the portal',
        description: 'My semester results were never uploaded to the student portal.',
      },
    });
    await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: fixture.student.id,
        messageBody: 'My results are still missing.',
        visibility: 'PUBLIC',
      },
    });

    const created = await superAdmin.post('/api/v1/admin/backups');
    const id = created.body.backup.id;

    // Wreck the data the way a bad migration would.
    await prisma.ticketMessage.deleteMany({});
    await prisma.ticket.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.department.deleteMany({});
    await prisma.user.update({
      where: { id: fixture.student.id },
      data: { fullName: 'Changed Name' },
    });
    expect(await prisma.ticket.count()).toBe(0);

    const archive = await readFile(`${backupRoot()}/${id}.tar.gz`);

    const restored = await superAdmin.postFile('/api/v1/admin/backups/restore', 'archive', {
      buffer: archive,
      filename: `${id}.tar.gz`,
      contentType: 'application/gzip',
    });
    expect(restored.status).toBe(200);
    expect(restored.body.restore.rows).toBeGreaterThan(0);

    // Everything is back, exactly as it was.
    const restoredTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: { messages: true },
    });
    expect(restoredTicket).not.toBeNull();
    expect(restoredTicket!.messages).toHaveLength(1);
    expect(restoredTicket!.messages[0]!.messageBody).toBe('My results are still missing.');

    const restoredUser = await prisma.user.findUnique({ where: { id: fixture.student.id } });
    expect(restoredUser!.fullName).toBe(fixture.student.fullName);

    const restoredDepartment = await prisma.department.findUnique({
      where: { id: fixture.department.id },
    });
    expect(restoredDepartment).not.toBeNull();

    // The restore leaves no lock behind.
    const status = await superAdmin.get('/api/v1/admin/backups/status');
    expect(status.body.restoreInProgress).toBe(false);
  });

  it('rejects an archive that is not a Campus Resolve backup', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const response = await superAdmin.postFile('/api/v1/admin/backups/restore', 'archive', {
      buffer: Buffer.from('this is not an archive'),
      filename: 'broken.tar.gz',
      contentType: 'application/gzip',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/not a readable/i);
  });

  it('requires an archive to be uploaded', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const response = await superAdmin.post('/api/v1/admin/backups/restore');
    expect(response.status).toBe(400);
  });

  it('keeps the attachment files with the backup', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const ticket = await prisma.ticket.create({
      data: {
        referenceNumber: 'BKUP-ATTACH-1',
        studentId: fixture.student.id,
        categoryId: fixture.category.id,
        departmentId: fixture.department.id,
        subject: 'My examination results are missing from the portal',
        description: 'My semester results were never uploaded to the student portal.',
      },
    });
    const contents = Buffer.from('%PDF-1.4 test attachment contents', 'utf8');
    const stored = await storageProvider.save(contents, 'results.pdf', 'application/pdf');
    await prisma.ticketAttachment.create({
      data: {
        ticketId: ticket.id,
        uploadedById: fixture.student.id,
        storageKey: stored.storageKey,
        originalFilename: 'results.pdf',
        mimeType: 'application/pdf',
        fileSize: contents.byteLength,
        checksum: stored.checksum,
      },
    });

    const created = await superAdmin.post('/api/v1/admin/backups');
    const id = created.body.backup.id;
    expect(created.body.backup.attachments).toBe(1);
    expect(created.body.backup.missingAttachments).toBe(0);

    const archive = await readFile(`${backupRoot()}/${id}.tar.gz`);
    // The archive carries the attachment itself, not just a reference.
    expect(archive.byteLength).toBeGreaterThan(contents.byteLength);

    const restored = await superAdmin.postFile('/api/v1/admin/backups/restore', 'archive', {
      buffer: archive,
      filename: `${id}.tar.gz`,
      contentType: 'application/gzip',
    });
    expect(restored.status).toBe(200);
    expect(restored.body.restore.attachments).toBe(1);

    // The attachment is on disk again after the restore.
    const reread = await storageProvider.read(stored.storageKey);
    expect(reread.toString('utf8')).toBe(contents.toString('utf8'));

    await rm(`${backupRoot()}/${id}.tar.gz`, { force: true });
    await rm(`${backupRoot()}/${id}.json`, { force: true });
  });

  it('deletes a backup on request', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const created = await superAdmin.post('/api/v1/admin/backups');
    const id = created.body.backup.id;

    const deleted = await superAdmin.delete(`/api/v1/admin/backups/${id}`);
    expect(deleted.status).toBe(200);

    const listed = await superAdmin.get('/api/v1/admin/backups');
    expect(listed.body.backups).toHaveLength(0);
  });

  it('refuses a backup identifier that tries to escape the backup directory', async () => {
    const fixture = await seedFixture();
    const superAdmin = await loginAs(fixture.superAdmin.email);

    const response = await superAdmin.get('/api/v1/admin/backups/..%2F..%2Fetc%2Fpasswd/download');
    expect(response.status).toBe(400);
  });
});

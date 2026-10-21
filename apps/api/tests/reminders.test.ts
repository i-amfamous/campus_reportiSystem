import { beforeEach, afterEach, describe, expect, it } from 'vitest';
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
import { Worker } from '../src/jobs/worker';
import { setEmailProvider, type EmailProvider } from '../src/modules/notifications/email.provider';

const app: Express = buildApp();
const HOUR = 3_600_000;
const T0 = new Date('2026-03-02T08:00:00.000Z');

async function loginAs(email: string): Promise<ApiClient> {
  const client = new ApiClient(app);
  await client.login(email, TEST_PASSWORD);
  return client;
}

interface Fixture {
  department: { id: string; name: string };
  category: { id: string; name: string };
  student: { id: string; email: string };
  officer: { id: string; email: string };
  head: { id: string; email: string };
}

async function setupFixture(): Promise<Fixture> {
  const department = await createDepartment({ name: 'Academic Affairs' });
  const category = await createCategory({
    name: 'Missing Examination Results',
    departmentId: department.id,
  });
  const student = await createUser({ email: '10240001@live.gctu.edu.gh', roles: ['STUDENT'] });
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
  return { department, category, student, officer, head };
}

async function createAssignedTicket(fixture: Fixture): Promise<string> {
  const client = await loginAs(fixture.student.email);
  const response = await client.post('/api/v1/tickets', {
    categoryId: fixture.category.id,
    departmentId: fixture.department.id,
    assignedToId: fixture.officer.id,
    subject: 'Examination results missing from the portal',
    description: 'My semester results were never uploaded to the student portal.',
  });
  expect(response.status).toBe(201);
  return response.body.id;
}

function reminderNotifications() {
  return prisma.notification.findMany({
    where: { type: 'STAFF_REMINDER_DUE' },
  });
}

describe('two-hour reminder system', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.set(T0);
    setEmailProvider(null);
  });

  afterEach(() => {
    clock.reset();
    setEmailProvider(null);
  });

  it('sends a reminder to the responsible officer two hours after assignment', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const worker = new Worker({ workerId: 'test-worker' });

    // Nothing is due yet.
    await worker.tick();
    expect(await reminderNotifications()).toHaveLength(0);

    // Two hours and one minute later the reminder is due.
    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await worker.drain();

    const notifications = await reminderNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.recipientId).toBe(fixture.officer.id);
    expect(notifications[0]!.status).toBe('SENT');

    const payload = notifications[0]!.payload as {
      reminderKind?: string;
      referenceNumber?: string;
    };
    expect(payload.reminderKind).toBe('UNTOUCHED');
    expect(payload.referenceNumber).toMatch(/^CR-\d{4}-\d{6}$/);

    // The email body matches the documented reminder format.
    const rendered = (notifications[0]!.payload as { rendered?: { subject: string; text: string } })
      .rendered;
    expect(rendered!.subject).toContain('Action required: Untouched student ticket');
    expect(rendered!.text).toContain('has not received a meaningful update');
    expect(rendered!.text).toContain('Current status: Assigned');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.remindersSentInCycle).toBe(1);
    expect(ticket.lastReminderSentAt).not.toBeNull();
  });

  it('measures the interval from the last meaningful action, not from the poll', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const officer = await loginAs(fixture.officer.email);
    const worker = new Worker({ workerId: 'test-worker' });

    // The officer acknowledges at T0 + 30 minutes.
    clock.set(new Date(T0.getTime() + 30 * 60_000));
    const acknowledged = await officer.post(`/api/v1/staff/tickets/${ticketId}/acknowledge`);
    expect(acknowledged.status).toBe(200);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.nextReminderAt!.getTime()).toBe(T0.getTime() + 30 * 60_000 + 120 * 60_000);

    // The original deadline (T0 + 2h) passes with no reminder for the untouched
    // cycle, because the ticket was handled.
    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await worker.drain();

    const reminders = await reminderNotifications();
    expect(reminders).toHaveLength(0);

    // The next-action deadline, measured from the acknowledgement, fires.
    clock.set(new Date(T0.getTime() + 151 * 60_000));
    await worker.drain();

    const afterDeadline = await reminderNotifications();
    expect(afterDeadline).toHaveLength(1);
    expect((afterDeadline[0]!.payload as { reminderKind?: string }).reminderKind).toBe(
      'NEXT_ACTION',
    );
  });

  it('does not reset the reminder timer when an officer only views a ticket', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const officer = await loginAs(fixture.officer.email);
    const worker = new Worker({ workerId: 'test-worker' });

    // Viewing the ticket at T0 + 90 minutes.
    clock.set(new Date(T0.getTime() + 90 * 60_000));
    const view = await officer.get(`/api/v1/tickets/${ticketId}`);
    expect(view.status).toBe(200);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.nextReminderAt!.getTime()).toBe(T0.getTime() + 120 * 60_000);

    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await worker.drain();

    const reminders = await reminderNotifications();
    expect(reminders).toHaveLength(1);
    expect((reminders[0]!.payload as { reminderKind?: string }).reminderKind).toBe('UNTOUCHED');
  });

  it('stops untouched reminders once the ticket is acknowledged', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const officer = await loginAs(fixture.officer.email);
    const worker = new Worker({ workerId: 'test-worker' });

    clock.set(new Date(T0.getTime() + 15 * 60_000));
    await officer.post(`/api/v1/staff/tickets/${ticketId}/acknowledge`);

    clock.set(new Date(T0.getTime() + 200 * 60_000));
    await worker.drain();

    const untouched = (await reminderNotifications()).filter(
      (notification) =>
        (notification.payload as { reminderKind?: string }).reminderKind === 'UNTOUCHED',
    );
    expect(untouched).toHaveLength(0);
  });

  it('sends the reminder to the current assignee after a reassignment', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const head = await loginAs(fixture.head.email);
    const newOfficer = await createUser({
      email: 'officer2@live.gctu.edu.gh',
      roles: ['OFFICER'],
      departmentId: fixture.department.id,
    });

    // Reassign one hour after the original assignment.
    clock.set(new Date(T0.getTime() + 60 * 60_000));
    const reassigned = await head.patch(`/api/v1/staff/tickets/${ticketId}/assign`, {
      assignedToId: newOfficer.id,
      reason: 'The original officer is unavailable.',
    });
    expect(reassigned.status).toBe(200);

    const worker = new Worker({ workerId: 'test-worker' });
    clock.set(new Date(T0.getTime() + 181 * 60_000));
    await worker.drain();

    const reminders = await reminderNotifications();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.recipientId).toBe(newOfficer.id);
    expect(reminders[0]!.recipientId).not.toBe(fixture.officer.id);
  });

  it('excludes resolved and closed tickets', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const officer = await loginAs(fixture.officer.email);
    clock.set(new Date(T0.getTime() + 10 * 60_000));
    await officer.post(`/api/v1/staff/tickets/${ticketId}/resolve`, {
      resolutionSummary: 'The results have been uploaded to the student portal.',
    });

    const worker = new Worker({ workerId: 'test-worker' });
    clock.set(new Date(T0.getTime() + 400 * 60_000));
    await worker.drain();

    expect(await reminderNotifications()).toHaveLength(0);
  });

  it('does not send duplicate reminders when the worker runs twice', async () => {
    const fixture = await setupFixture();
    await createAssignedTicket(fixture);

    const workerA = new Worker({ workerId: 'worker-a' });
    const workerB = new Worker({ workerId: 'worker-b' });

    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await workerA.tick();
    await workerB.tick();
    await workerA.drain();
    await workerB.drain();

    const reminders = await reminderNotifications();
    expect(reminders).toHaveLength(1);

    const occurrences = await prisma.reminderOccurrence.count();
    expect(occurrences).toBe(1);
  });

  it('records a failed email and retries the delivery without losing the ticket', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    let attempts = 0;
    const failingProvider: EmailProvider = {
      name: 'failing',
      async send() {
        attempts += 1;
        throw new Error('Provider temporarily unavailable');
      },
    };
    setEmailProvider(failingProvider);

    const worker = new Worker({ workerId: 'test-worker' });
    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await worker.drain();

    const notifications = await reminderNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.status).toBe('FAILED');
    expect(notifications[0]!.attemptCount).toBeGreaterThanOrEqual(1);
    expect(notifications[0]!.lastError).toContain('Provider temporarily unavailable');

    // The ticket itself is untouched by the email failure.
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.referenceNumber).toMatch(/^CR-\d{4}-\d{6}$/);

    // The delivery job is rescheduled for a retry.
    const pendingDelivery = await prisma.job.findFirst({
      where: { type: 'NOTIFICATION_DELIVERY', status: 'PENDING' },
    });
    expect(pendingDelivery).not.toBeNull();

    // Once the provider recovers, the retry delivers the reminder exactly once.
    setEmailProvider(null);
    clock.set(new Date(T0.getTime() + 200 * 60_000));
    await worker.drain();

    const recovered = await prisma.notification.findUniqueOrThrow({
      where: { id: notifications[0]!.id },
    });
    expect(recovered.status).toBe('SENT');
    expect(attempts).toBeGreaterThanOrEqual(1);
  });

  it('escalates to the department head after the configured number of reminders', async () => {
    const fixture = await setupFixture();
    await createAssignedTicket(fixture);

    const worker = new Worker({ workerId: 'test-worker' });

    // Three reminders without any action (escalation threshold is 3).
    for (const hours of [121, 241, 361]) {
      clock.set(new Date(T0.getTime() + hours * 60_000));
      await worker.drain();
    }

    const reminders = await reminderNotifications();
    expect(reminders.length).toBeGreaterThanOrEqual(3);

    const escalation = await prisma.escalationEvent.findFirst({
      where: { ticketId: (await prisma.ticket.findFirstOrThrow()).id },
    });
    expect(escalation).not.toBeNull();
    expect(escalation!.level).toBe(1);

    const headNotification = await prisma.notification.findFirst({
      where: { type: 'STAFF_TICKET_ESCALATED', recipientId: fixture.head.id },
    });
    expect(headNotification).not.toBeNull();
  });

  it('flags a ticket as overdue when the first-response target is missed', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const worker = new Worker({ workerId: 'test-worker' });

    // The default first-response target is 8 hours.
    clock.set(new Date(T0.getTime() + 8 * HOUR + 60_000));
    await worker.drain();

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.firstResponseOverdue).toBe(true);

    const breach = await prisma.ticketHistory.findFirst({
      where: { ticketId, actionType: 'SLA_BREACHED' },
    });
    expect(breach).not.toBeNull();
  });

  it('keeps an acknowledged ticket under service-target monitoring', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const officer = await loginAs(fixture.officer.email);
    clock.set(new Date(T0.getTime() + 20 * 60_000));
    await officer.post(`/api/v1/staff/tickets/${ticketId}/acknowledge`);

    const worker = new Worker({ workerId: 'test-worker' });

    // Move past the resolution target (72 hours).
    clock.set(new Date(T0.getTime() + 73 * HOUR));
    await worker.drain();

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.resolutionOverdue).toBe(true);

    const escalation = await prisma.escalationEvent.findFirst({ where: { ticketId } });
    expect(escalation).not.toBeNull();
    expect(escalation!.source).toBe('SLA');
  });

  it('recovers jobs that were left running by a crashed worker', async () => {
    const fixture = await setupFixture();
    await createAssignedTicket(fixture);

    // Simulate a worker that claimed the job and then died.
    const job = await prisma.job.findFirstOrThrow({ where: { type: 'TICKET_REMINDER' } });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        lockedBy: 'dead-worker',
        lockedAt: new Date(T0.getTime() - 30 * 60_000),
      },
    });

    const worker = new Worker({ workerId: 'recovery-worker' });
    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await worker.drain();

    const reminders = await reminderNotifications();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.status).toBe('SENT');
  });

  it('never sends a reminder to a ticket without an active responsible officer', async () => {
    const fixture = await setupFixture();
    const client = await loginAs(fixture.student.email);
    const response = await client.post('/api/v1/tickets', {
      categoryId: fixture.category.id,
      departmentId: fixture.department.id,
      subject: 'Queued report without an assigned officer',
      description: 'This report goes to the department queue and has no owner yet.',
    });
    expect(response.status).toBe(201);

    const worker = new Worker({ workerId: 'test-worker' });
    clock.set(new Date(T0.getTime() + 5 * HOUR));
    await worker.drain();

    expect(await reminderNotifications()).toHaveLength(0);
  });

  it('does not send internal notes or student data in the reminder email', async () => {
    const fixture = await setupFixture();
    const ticketId = await createAssignedTicket(fixture);

    const officer = await loginAs(fixture.officer.email);
    await officer.post(`/api/v1/staff/tickets/${ticketId}/notes`, {
      body: 'Internal: the student record number is 10240001 and the fee balance is unpaid.',
    });

    const worker = new Worker({ workerId: 'test-worker' });
    clock.set(new Date(T0.getTime() + 121 * 60_000));
    await worker.drain();

    const reminders = await reminderNotifications();
    const rendered = (reminders[0]!.payload as { rendered: { text: string } }).rendered;
    expect(rendered.text).not.toContain('10240001');
    expect(rendered.text).not.toContain('Internal:');
    expect(rendered.text).not.toContain('10240001@live.gctu.edu.gh');
  });
});

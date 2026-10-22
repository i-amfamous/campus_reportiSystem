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
import { resetEmailProvider, setEmailProvider } from '../src/modules/notifications/email.provider';
import { runJob } from '../src/jobs/handlers';

const app: Express = buildApp();

interface Fixture {
  department: { id: string; name: string };
  otherDepartment: { id: string; name: string };
  category: { id: string; name: string };
  student: { id: string; email: string };
  otherStudent: { id: string; email: string };
  officer: { id: string; email: string };
  head: { id: string; email: string };
  admin: { id: string; email: string };
}

async function setupFixture(): Promise<Fixture> {
  const department = await createDepartment({ name: 'Academic Affairs' });
  const otherDepartment = await createDepartment({ name: 'Student Finance Office' });
  const category = await createCategory({
    name: 'Missing Examination Results',
    departmentId: department.id,
  });

  const student = await createUser({
    email: '10230001@live.gctu.edu.gh',
    roles: ['STUDENT'],
    studentId: '10230001',
  });
  const otherStudent = await createUser({
    email: '10230002@live.gctu.edu.gh',
    roles: ['STUDENT'],
    studentId: '10230002',
  });
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

  return { department, otherDepartment, category, student, otherStudent, officer, head, admin };
}

async function loginAs(email: string): Promise<ApiClient> {
  const client = new ApiClient(app);
  await client.login(email, TEST_PASSWORD);
  return client;
}

async function createTicketAsStudent(
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

describe('ticket lifecycle', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
  });

  it('creates a ticket with a unique reference and a status history', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const created = await createTicketAsStudent(student, fixture);

    expect(created.referenceNumber).toMatch(/^CR-\d{4}-\d{6}$/);
    expect(created.status).toBe('AWAITING_ASSIGNMENT');

    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: created.id },
      include: { history: true },
    });
    expect(ticket.history).toHaveLength(1);
    expect(ticket.history[0]!.actionType).toBe('CREATED');
    expect(ticket.history[0]!.actorId).toBe(fixture.student.id);

    // A second ticket receives a different reference.
    const second = await createTicketAsStudent(student, fixture, {
      subject: 'Another issue that needs attention',
    });
    expect(second.referenceNumber).not.toBe(created.referenceNumber);
  });

  it('routes a category-bound report to the responsible department even when another is chosen', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const created = await createTicketAsStudent(student, fixture, {
      departmentId: fixture.otherDepartment.id,
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(ticket.departmentId).toBe(fixture.department.id);
  });

  it('assigns a ticket directly when the student selects an eligible officer', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(ticket.assignedToId).toBe(fixture.officer.id);
    expect(ticket.status).toBe('ASSIGNED');
    expect(ticket.assignedAt).not.toBeNull();
    // The untouched-reminder deadline is two hours after the assignment.
    expect(ticket.nextReminderAt!.getTime() - ticket.assignedAt!.getTime()).toBe(120 * 60_000);
  });

  it('routes to the department queue when the student does not choose an officer', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const created = await createTicketAsStudent(student, fixture);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(ticket.assignedToId).toBeNull();
    expect(ticket.status).toBe('AWAITING_ASSIGNMENT');
  });

  it('routes to the fallback queue when a department has no active officers', async () => {
    const fixture = await setupFixture();
    const fallback = await createDepartment({
      name: 'General Administration',
      isFallbackQueue: true,
    });
    const emptyDepartment = await createDepartment({ name: 'Empty Office' });
    const emptyCategory = await createCategory({
      name: 'Unknown Issue',
      departmentId: emptyDepartment.id,
    });

    const student = await loginAs(fixture.student.email);
    const response = await student.post('/api/v1/tickets', {
      categoryId: emptyCategory.id,
      departmentId: emptyDepartment.id,
      studentEmail: fixture.student.email,
      subject: 'I do not know who handles this problem',
      description: 'This report has been sent because I could not find the correct office for it.',
    });

    expect(response.status).toBe(201);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(ticket.departmentId).toBe(fallback.id);
  });

  it('assigns and reassigns a ticket, recording both events in the history', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture);

    const head = await loginAs(fixture.head.email);

    const assigned = await head.patch(`/api/v1/staff/tickets/${created.id}/assign`, {
      assignedToId: fixture.officer.id,
      reason: 'Routed to the examination records officer.',
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.ticket.status).toBe('ASSIGNED');

    const secondOfficer = await createUser({
      email: 'officer2@live.gctu.edu.gh',
      roles: ['OFFICER'],
      departmentId: fixture.department.id,
    });
    const reassigned = await head.patch(`/api/v1/staff/tickets/${created.id}/assign`, {
      assignedToId: secondOfficer.id,
      reason: 'The original officer is on leave.',
    });
    expect(reassigned.status).toBe(200);

    const history = await prisma.ticketHistory.findMany({
      where: { ticketId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = history.map((entry) => entry.actionType);
    expect(actions).toContain('ASSIGNED');
    expect(actions).toContain('REASSIGNED');
  });

  it('lets an officer claim an unassigned ticket but never take one from a colleague', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture);

    const officer = await loginAs(fixture.officer.email);

    // An officer picks the ticket up from the department queue.
    const claimed = await officer.patch(`/api/v1/staff/tickets/${created.id}/assign`, {
      assignedToId: fixture.officer.id,
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body.ticket.assignedTo?.id).toBe(fixture.officer.id);

    // A colleague may not take the ticket over.
    const secondOfficer = await createUser({
      email: 'officer3@live.gctu.edu.gh',
      roles: ['OFFICER'],
      departmentId: fixture.department.id,
    });
    const colleague = await loginAs(secondOfficer.email);
    const stolen = await colleague.patch(`/api/v1/staff/tickets/${created.id}/assign`, {
      assignedToId: secondOfficer.id,
    });
    expect(stolen.status).toBe(403);

    // The current owner may hand the ticket to a colleague in the department.
    const pushed = await officer.patch(`/api/v1/staff/tickets/${created.id}/assign`, {
      assignedToId: secondOfficer.id,
    });
    expect(pushed.status).toBe(200);

    const history = await prisma.ticketHistory.findMany({
      where: { ticketId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((entry) => entry.actionType)).toContain('REASSIGNED');

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(ticket.assignedToId).toBe(secondOfficer.id);
  });

  it('does not let an officer from another department claim the ticket', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture);

    const outsider = await createUser({
      email: 'outsider@live.gctu.edu.gh',
      roles: ['OFFICER'],
      departmentId: fixture.otherDepartment.id,
    });
    const officer = await loginAs(outsider.email);
    const response = await officer.patch(`/api/v1/staff/tickets/${created.id}/assign`, {
      assignedToId: outsider.id,
    });
    expect(response.status).toBe(403);
  });

  it('rejects an invalid status transition', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    const response = await officer.patch(`/api/v1/staff/tickets/${created.id}/status`, {
      status: 'CLOSED',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('accepts a valid status transition and notifies the student', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    const acknowledged = await officer.post(`/api/v1/staff/tickets/${created.id}/acknowledge`);
    expect(acknowledged.status).toBe(200);
    expect(acknowledged.body.ticket.status).toBe('ACKNOWLEDGED');
    expect(acknowledged.body.ticket.firstResponseAt).not.toBeNull();

    const notification = await prisma.notification.findFirst({
      where: { ticketId: created.id, type: 'TICKET_ACKNOWLEDGED' },
    });
    expect(notification).not.toBeNull();
  });

  it('records public replies and internal notes separately', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    await officer.post(`/api/v1/staff/tickets/${created.id}/notes`, {
      body: 'Internal: confirm with the examination office before responding.',
    });
    await officer.post(`/api/v1/tickets/${created.id}/messages`, {
      body: 'Hello, we are checking with the examinations office.',
    });

    const messages = await prisma.ticketMessage.findMany({ where: { ticketId: created.id } });
    expect(messages).toHaveLength(2);
    expect(messages.filter((message) => message.visibility === 'INTERNAL')).toHaveLength(1);
    expect(messages.filter((message) => message.visibility === 'PUBLIC')).toHaveLength(1);
  });

  it('never returns internal notes to the student', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    await officer.post(`/api/v1/staff/tickets/${created.id}/notes`, {
      body: 'Internal: the student record number is 10230001.',
    });

    const studentView = await student.get(`/api/v1/tickets/${created.id}`);
    expect(studentView.status).toBe(200);
    expect(JSON.stringify(studentView.body.ticket.messages)).not.toContain('Internal:');
    expect(studentView.body.ticket.messages).toHaveLength(0);

    const officerView = await officer.get(`/api/v1/tickets/${created.id}`);
    expect(officerView.body.ticket.messages).toHaveLength(1);
    expect(officerView.body.ticket.messages[0].visibility).toBe('INTERNAL');
  });

  it('requires a resolution summary before a ticket can be resolved', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    const missing = await officer.post(`/api/v1/staff/tickets/${created.id}/resolve`, {
      resolutionSummary: 'done',
    });
    expect(missing.status).toBe(422);

    const resolved = await officer.post(`/api/v1/staff/tickets/${created.id}/resolve`, {
      resolutionSummary: 'The results have been uploaded to the student portal.',
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body.ticket.status).toBe('RESOLVED');
    expect(resolved.body.ticket.resolvedAt).not.toBeNull();
  });

  it('allows a student to reopen a resolved ticket and issues a new action deadline', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    await officer.post(`/api/v1/staff/tickets/${created.id}/resolve`, {
      resolutionSummary: 'The results have been uploaded to the student portal.',
    });

    const reopened = await student.post(`/api/v1/tickets/${created.id}/reopen`, {
      reason: 'Only one course was updated; the second course is still missing.',
    });
    expect(reopened.status).toBe(200);
    expect(reopened.body.ticket.status).toBe('REOPENED');
    expect(reopened.body.ticket.reopenedCount).toBe(1);
    expect(reopened.body.ticket.nextReminderAt).not.toBeNull();

    const messages = await prisma.ticketMessage.count({ where: { ticketId: created.id } });
    expect(messages).toBe(0);
  });

  it('escalates a ticket and notifies the department head', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    const escalated = await officer.post(`/api/v1/tickets/${created.id}/escalate`, {
      reason: 'The examination office has not responded for three weeks.',
    });

    expect(escalated.status).toBe(200);
    expect(escalated.body.ticket.status).toBe('ESCALATED');
    expect(escalated.body.ticket.escalationLevel).toBe(1);

    const event = await prisma.escalationEvent.findFirst({ where: { ticketId: created.id } });
    expect(event).not.toBeNull();

    const headNotification = await prisma.notification.findFirst({
      where: { ticketId: created.id, type: 'STAFF_TICKET_ESCALATED', recipientId: fixture.head.id },
    });
    expect(headNotification).not.toBeNull();
  });

  it('records student feedback on a resolved ticket', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture, {
      assignedToId: fixture.officer.id,
    });

    const officer = await loginAs(fixture.officer.email);
    await officer.post(`/api/v1/staff/tickets/${created.id}/resolve`, {
      resolutionSummary: 'The results have been uploaded to the student portal.',
    });

    const feedback = await student.post(`/api/v1/tickets/${created.id}/feedback`, {
      rating: 5,
      comment: 'Very helpful, thank you.',
    });
    expect(feedback.status).toBe(201);

    const duplicate = await student.post(`/api/v1/tickets/${created.id}/feedback`, { rating: 3 });
    expect(duplicate.status).toBe(409);
  });

  it('allows a student to withdraw a ticket that no officer has started', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);
    const created = await createTicketAsStudent(student, fixture);

    const response = await student.post(`/api/v1/tickets/${created.id}/withdraw`, {
      reason: 'I solved the problem myself.',
    });
    expect(response.status).toBe(200);
    expect(response.body.ticket.status).toBe('WITHDRAWN');

    const history = await prisma.ticketHistory.findFirst({
      where: { ticketId: created.id, actionType: 'WITHDRAWN' },
    });
    expect(history).not.toBeNull();
  });

  it('keeps the ticket when the notification cannot be delivered', async () => {
    const fixture = await setupFixture();
    const student = await loginAs(fixture.student.email);

    const created = await createTicketAsStudent(student, fixture);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
    expect(ticket.referenceNumber).toMatch(/^CR-\d{4}-\d{6}$/);

    // Simulate an email provider outage and run the queued delivery job.
    setEmailProvider({
      name: 'failing',
      send: async () => {
        throw new Error('Provider unavailable');
      },
    });

    try {
      const job = await prisma.job.findFirstOrThrow({ where: { type: 'NOTIFICATION_DELIVERY' } });

      // The job runner surfaces the failure so the queue retries the delivery.
      await expect(runJob(job)).rejects.toThrow('Provider unavailable');

      const notification = await prisma.notification.findFirstOrThrow({
        where: { recipientId: fixture.student.id },
      });
      expect(notification.status).toBe('FAILED');
      expect(notification.lastError).toContain('Provider unavailable');

      // The report itself is untouched by the delivery failure.
      const stillThere = await prisma.ticket.findUniqueOrThrow({ where: { id: created.id } });
      expect(stillThere.status).toBe('AWAITING_ASSIGNMENT');
      expect(stillThere.referenceNumber).toBe(created.referenceNumber);
    } finally {
      resetEmailProvider();
    }
  });
});

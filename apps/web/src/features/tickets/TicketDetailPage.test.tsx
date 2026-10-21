import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TicketDetailPage } from './TicketDetailPage';
import { AuthProvider } from '../../lib/auth';
import { ToastProvider } from '../../components/ui';
import type { SessionUser, TicketDetail } from '../../types';

const STUDENT_ID = '11111111-1111-4111-8111-111111111111';
const OFFICER_ID = '22222222-2222-4222-8222-222222222222';
const DEPARTMENT_ID = '33333333-3333-4333-8333-333333333333';

const STUDENT: SessionUser = {
  id: STUDENT_ID,
  email: '10234567@live.gctu.edu.gh',
  fullName: 'Ama Mensah',
  studentId: '10234567',
  emailVerified: true,
  accountStatus: 'ACTIVE',
  roles: ['STUDENT'],
  permissions: ['ticket:create', 'ticket:read:own'],
  departments: [],
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const OFFICER: SessionUser = {
  ...STUDENT,
  id: OFFICER_ID,
  email: 'officer@live.gctu.edu.gh',
  fullName: 'Kofi Asante',
  roles: ['OFFICER'],
  permissions: ['ticket:read:department', 'ticket:note:internal', 'ticket:status:update'],
  departments: [
    {
      departmentId: DEPARTMENT_ID,
      departmentName: 'Examinations Office',
      departmentRole: 'OFFICER',
    },
  ],
};

function ticketFixture(visibility: 'PUBLIC' | 'INTERNAL'): TicketDetail {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    referenceNumber: 'CR-2026-000123',
    subject: 'Missing examination result',
    description: 'My result for CS201 was never uploaded to the portal.',
    status: 'IN_PROGRESS',
    statusLabel: 'In progress',
    priority: 'HIGH',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
    assignedAt: '2026-10-01T12:00:00.000Z',
    firstResponseAt: '2026-10-01T14:00:00.000Z',
    resolvedAt: null,
    closedAt: null,
    escalatedAt: null,
    resolutionSummary: null,
    reopenedCount: 0,
    remindersSentInCycle: 1,
    nextReminderAt: null,
    lastReminderSentAt: null,
    lastMeaningfulStaffActionAt: null,
    firstResponseDueAt: null,
    resolutionDueAt: null,
    firstResponseOverdue: false,
    resolutionOverdue: false,
    escalationLevel: 0,
    courseCode: 'CS201',
    courseTitle: 'Data Structures',
    semester: '2025/2026',
    assessmentReference: null,
    transactionReference: null,
    preferredContactMethod: 'EMAIL',
    student: {
      id: STUDENT_ID,
      fullName: 'Ama Mensah',
      studentId: '10234567',
      email: '10234567@live.gctu.edu.gh',
    },
    category: { id: '44444444-4444-4444-8444-444444444444', name: 'Missing examination results' },
    department: { id: DEPARTMENT_ID, name: 'Examinations Office' },
    assignedTo: { id: OFFICER_ID, fullName: 'Kofi Asante' },
    messages: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        body:
          visibility === 'PUBLIC'
            ? 'We have requested the results sheet from the examination office.'
            : 'Internal: escalated to the head of examinations.',
        visibility,
        createdAt: '2026-10-01T14:00:00.000Z',
        sender: { id: OFFICER_ID, fullName: 'Kofi Asante', isStaff: true },
      },
    ],
    attachments: [],
    history: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        actionType: 'CREATED',
        previousValue: null,
        newValue: null,
        reason: null,
        createdAt: '2026-10-01T09:00:00.000Z',
        actor: { id: STUDENT_ID, fullName: 'Ama Mensah' },
      },
    ],
    feedback: null,
  };
}

function renderPage(user: SessionUser, visibility: 'PUBLIC' | 'INTERNAL') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  queryClient.setQueryData(['session', 'me'], user);

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/auth/me')) {
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/v1/tickets/')) {
      return new Response(JSON.stringify({ ticket: ticketFixture(visibility) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/tickets/55555555-5555-4555-8555-555555555555']}>
            <Routes>
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TicketDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('hides staff controls and internal notes from the student who filed the report', async () => {
    renderPage(STUDENT, 'PUBLIC');

    expect((await screen.findAllByText('CR-2026-000123')).length).toBeGreaterThan(0);
    expect(screen.getByText('Reported issue')).toBeInTheDocument();
    expect(screen.queryByText('Staff actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal note')).not.toBeInTheDocument();
    expect(screen.queryByText('Save internal note')).not.toBeInTheDocument();
  });

  test('shows the staff console to a department officer', async () => {
    renderPage(OFFICER, 'INTERNAL');

    expect(await screen.findByText('Staff actions')).toBeInTheDocument();
    expect(screen.getByText('Internal note')).toBeInTheDocument();
    expect(screen.getByText('Save internal note')).toBeInTheDocument();
    expect(screen.getByText('Assign officer')).toBeInTheDocument();
  });
});

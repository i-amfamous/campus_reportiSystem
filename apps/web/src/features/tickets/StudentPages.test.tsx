import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui';
import { NewTicketPage } from './StudentPages';

const DEPARTMENTS = {
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Examinations Office',
      code: 'EXAM',
      description: null,
      contactEmail: null,
      isActive: true,
      isFallbackQueue: false,
      sortOrder: 1,
      staffCount: 2,
      categoryCount: 3,
      serviceTarget: null,
    },
  ],
};

const CATEGORIES = {
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Missing examination results',
      description: null,
      departmentId: '33333333-3333-4333-8333-333333333333',
      departmentName: 'Examinations Office',
      defaultPriority: 'HIGH' as const,
      isActive: true,
      isSensitive: false,
      sortOrder: 1,
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/departments/categories')) return jsonResponse(CATEGORIES);
    if (url.includes('/api/v1/departments')) return jsonResponse(DEPARTMENTS);
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <NewTicketPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { queryClient, fetchMock };
}

describe('NewTicketPage', () => {
  beforeEach(() => {
    document.cookie = 'campus_csrf=test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('blocks submission until the required fields are valid', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText(/Issue category/);

    await user.click(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => {
      expect(screen.getByText('Select a valid issue category')).toBeInTheDocument();
    });
    expect(screen.getByText('Subject must be at least 6 characters')).toBeInTheDocument();
    expect(screen.getByText('Describe the issue in at least 20 characters')).toBeInTheDocument();
  });

  test('submits the report and shows the issued reference number', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderPage();

    await screen.findByLabelText(/Issue category/);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/v1/tickets') && init?.method === 'POST') {
        return jsonResponse(
          { id: 'ticket-1', referenceNumber: 'CR-2026-000123', status: 'SUBMITTED' },
          201,
        );
      }
      if (url.includes('/api/v1/departments/categories')) return jsonResponse(CATEGORIES);
      if (url.includes('/api/v1/departments')) return jsonResponse(DEPARTMENTS);
      return jsonResponse({});
    });

    await user.selectOptions(
      screen.getByLabelText(/Issue category/),
      '44444444-4444-4444-8444-444444444444',
    );
    await user.type(screen.getByLabelText(/Student email \(mandatory\)/), 'student@example.com');
    await user.type(screen.getByLabelText(/Subject/), 'Missing examination result for CS201');
    await user.type(
      screen.getByLabelText(/Detailed description/),
      'My result for CS201 was not uploaded to the portal two weeks after the results were published.',
    );

    await user.click(screen.getByRole('button', { name: 'Submit report' }));

    expect(await screen.findByText('CR-2026-000123')).toBeInTheDocument();
  });
});

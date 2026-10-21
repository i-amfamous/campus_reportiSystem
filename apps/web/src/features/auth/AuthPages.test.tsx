import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AcceptInvitationPage } from './AuthPages';

const TOKEN = 'invitation-token-value-1234567890';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(route = `/staff-invitation?token=${TOKEN}`) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    jsonResponse({}),
  );
  vi.stubGlobal('fetch', fetchMock);

  render(
    <MemoryRouter initialEntries={[route]}>
      <AcceptInvitationPage />
    </MemoryRouter>,
  );

  return { fetchMock };
}

describe('AcceptInvitationPage', () => {
  beforeEach(() => {
    document.cookie = 'campus_csrf=test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('activates the account with the chosen password', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderPage();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth/accept-invitation') && init?.method === 'POST') {
        return jsonResponse({
          email: 'officer@live.gctu.edu.gh',
          fullName: 'Kofi Asante',
          message: 'Your staff account is active. You can sign in now.',
        });
      }
      return jsonResponse({});
    });

    await user.type(screen.getByLabelText(/New password/), 'Ch00se!StrongPassword');
    await user.click(screen.getByRole('button', { name: 'Activate my account' }));

    expect(await screen.findByText(/Your staff account is active/)).toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/v1/auth/accept-invitation'),
    );
    expect(call).toBeDefined();
    const body = JSON.parse(String((call![1] as RequestInit).body));
    expect(body.token).toBe(TOKEN);
    expect(body.password).toBe('Ch00se!StrongPassword');
  });

  test('shows the server error when the invitation is not valid', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderPage();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth/accept-invitation') && init?.method === 'POST') {
        return jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'This invitation link is invalid or has expired.',
            },
          },
          400,
        );
      }
      return jsonResponse({});
    });

    await user.type(screen.getByLabelText(/New password/), 'Ch00se!StrongPassword');
    await user.click(screen.getByRole('button', { name: 'Activate my account' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/);
    });
  });

  test('refuses a weak password before calling the API', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderPage();

    await user.type(screen.getByLabelText(/New password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Activate my account' }));

    await waitFor(() => {
      expect(screen.getByText('Password must be at least 10 characters')).toBeInTheDocument();
    });
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/v1/auth/accept-invitation')),
    ).toBe(false);
  });
});

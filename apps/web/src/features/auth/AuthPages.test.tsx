import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AcceptInvitationPage, LoginPage, VerifyOtpPage } from './AuthPages';
import { renderWithProviders, STUDENT_USER } from '../../test/utils';

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

describe('unverified sign-in', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderAuthFlow() {
    return renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/home" element={<div>Home</div>} />
      </Routes>,
      { user: null, route: '/login' },
    );
  }

  test('sends the user to the verification page when the email is unverified', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderAuthFlow();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth/me')) return jsonResponse({ user: null });
      if (url.includes('/api/v1/auth/login') && init?.method === 'POST') {
        return jsonResponse(
          {
            error: {
              code: 'EMAIL_NOT_VERIFIED',
              message:
                'We sent a new verification code to your email address. Enter it to activate your account.',
            },
          },
          403,
        );
      }
      return jsonResponse({});
    });

    await user.type(screen.getByLabelText(/Email/), '10234567@live.gctu.edu.gh');
    await user.type(screen.getByLabelText(/Password/), 'Str0ng!Password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        /Enter the 6-digit code sent to 10234567@live.gctu.edu.gh/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify & sign in' })).toBeInTheDocument();
  });

  test('verifies the code and signs the user in with the password they just entered', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderAuthFlow();
    let loginAttempts = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth/me')) return jsonResponse({ user: STUDENT_USER });
      if (url.includes('/api/v1/auth/verify-otp')) return jsonResponse({ verified: true });
      if (url.includes('/api/v1/auth/login') && init?.method === 'POST') {
        loginAttempts += 1;
        if (loginAttempts === 1) {
          return jsonResponse(
            {
              error: {
                code: 'EMAIL_NOT_VERIFIED',
                message:
                  'We sent a new verification code to your email address. Enter it to activate your account.',
              },
            },
            403,
          );
        }
        return jsonResponse({ user: STUDENT_USER });
      }
      return jsonResponse({});
    });

    await user.type(screen.getByLabelText(/Email/), '10234567@live.gctu.edu.gh');
    await user.type(screen.getByLabelText(/Password/), 'Str0ng!Password1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByText(/Enter the 6-digit code sent to 10234567@live.gctu.edu.gh/);

    for (const [index, digit] of '123456'.split('').entries()) {
      const input = document.getElementById(`otp-${index}`);
      expect(input).not.toBeNull();
      await user.type(input!, digit);
    }

    await user.click(screen.getByRole('button', { name: 'Verify & sign in' }));

    expect(await screen.findByText('Home')).toBeInTheDocument();
    expect(loginAttempts).toBe(2);
  });

  test('shakes and clears the digits when the verification code is rejected', async () => {
    const user = userEvent.setup();
    const { fetchMock } = renderWithProviders(
      <Routes>
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
      </Routes>,
      { user: null, route: '/verify-otp?email=10234567@live.gctu.edu.gh' },
    );

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/auth/verify-otp') && init?.method === 'POST') {
        return jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'The verification code is incorrect or has expired.',
            },
          },
          400,
        );
      }
      return jsonResponse({});
    });

    for (const [index, digit] of '123456'.split('').entries()) {
      await user.type(document.getElementById(`otp-${index}`)!, digit);
    }
    await user.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(
      await screen.findByText('The verification code is incorrect or has expired.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('otp-group')).toHaveClass('animate-otp-shake');

    for (let index = 0; index < 6; index += 1) {
      expect((document.getElementById(`otp-${index}`) as HTMLInputElement).value).toBe('');
    }
  });
});

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

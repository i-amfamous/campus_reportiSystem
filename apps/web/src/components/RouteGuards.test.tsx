import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './RouteGuards';
import { useAuth } from '../lib/auth';
import { OFFICER_USER, renderWithProviders } from '../test/utils';

describe('authentication guards', () => {
  test('redirects signed-out visitors from a protected page to the login page', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/staff" element={<div>Staff overview</div>} />
        </Route>
        <Route path="/login" element={<div>Sign in page</div>} />
      </Routes>,
      { user: null, route: '/staff' },
    );

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(screen.queryByText('Staff overview')).not.toBeInTheDocument();
  });

  test('clears the cached session on sign out', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<SignOutProbe />, {
      user: OFFICER_USER,
      route: '/staff',
    });

    expect(await screen.findByText('signed in')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('signed out')).toBeInTheDocument();
    expect(queryClient.getQueryData(['session', 'me'])).toBeNull();
  });
});

function SignOutProbe() {
  const auth = useAuth();
  return (
    <div>
      <p>{auth.isAuthenticated ? 'signed in' : 'signed out'}</p>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}

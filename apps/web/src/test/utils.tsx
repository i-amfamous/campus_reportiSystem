import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../lib/auth';
import { ToastProvider } from '../components/ui';
import type { SessionUser } from '../types';

export const STUDENT_USER: SessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
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

export const OFFICER_USER: SessionUser = {
  ...STUDENT_USER,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'officer@live.gctu.edu.gh',
  fullName: 'Kofi Asante',
  roles: ['OFFICER'],
  permissions: ['ticket:read:department', 'ticket:note:internal', 'ticket:status:update'],
  departments: [
    {
      departmentId: '33333333-3333-4333-8333-333333333333',
      departmentName: 'Examinations Office',
      departmentRole: 'OFFICER',
    },
  ],
};

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export interface ProviderOptions {
  user?: SessionUser | null;
  route?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & Omit<RenderOptions, 'wrapper'> = {},
): ReturnType<typeof render> & { queryClient: QueryClient } {
  const {
    user = STUDENT_USER,
    route = '/',
    queryClient = createTestQueryClient(),
    ...rest
  } = options;

  if (user) {
    queryClient.setQueryData(['session', 'me'], user);
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/v1/auth/me')) {
      return new Response(JSON.stringify({ user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );

  return { ...render(ui, { wrapper, ...rest }), queryClient };
}

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { SessionUser } from '../types';

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (...roles: string[]) => boolean;
  hasPermission: (permission: string) => boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const SESSION_QUERY_KEY = ['session', 'me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await api.get<{ user: SessionUser }>('/api/v1/auth/me');
        return response.user;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }, [queryClient]);

  const clearSession = useCallback(() => {
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0],
    });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore logout errors; we still clear the local session.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    window.addEventListener('campus:unauthorized', clearSession);
    return () => window.removeEventListener('campus:unauthorized', clearSession);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(() => {
    const roles = data?.roles ?? [];
    const permissions = data?.permissions ?? [];
    return {
      user: data ?? null,
      isLoading,
      isAuthenticated: Boolean(data),
      hasRole: (...candidate: string[]) => candidate.some((role) => roles.includes(role)),
      hasPermission: (permission: string) => permissions.includes(permission),
      isStaff: roles.some((role) =>
        ['OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN'].includes(role),
      ),
      isAdmin: roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role)),
      isSuperAdmin: roles.includes('SUPER_ADMIN'),
      refresh,
      signOut,
    };
  }, [data, isLoading, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.');
  return context;
}

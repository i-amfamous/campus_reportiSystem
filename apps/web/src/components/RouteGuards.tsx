import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LoadingState } from './ui';

/** Requires an authenticated session. */
export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) return <LoadingState label="Checking your session…" />;
  if (!auth.isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}

/** Requires a verified email address. */
export function VerifiedEmailRoute() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading) return <LoadingState />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (auth.user && !auth.user.emailVerified) {
    if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) {
      return <Navigate to="/admin/dashboard" replace state={{ from: location.pathname + location.search }} />;
    }
    if (auth.isStaff) {
      return <Navigate to="/staff" replace state={{ from: location.pathname + location.search }} />;
    }
    return <Navigate to="/dashboard" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Requires one of the given roles. */
export function RoleRoute({ roles }: { roles: string[] }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading) return <LoadingState />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.hasRole(...roles)) {
    // Administrators can fall back to their dashboard instead of being blocked.
    if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) {
      return <Navigate to="/admin/dashboard" replace state={{ from: location.pathname + location.search }} />;
    }
    if (auth.isStaff) {
      return <Navigate to="/staff" replace state={{ from: location.pathname + location.search }} />;
    }
    return <Navigate to="/dashboard" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Requires a permission key. */
export function PermissionRoute({ permission }: { permission: string }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading) return <LoadingState />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.hasPermission(permission)) {
    if (auth.hasRole('SUPER_ADMIN') || auth.hasRole('ADMIN')) {
      return <Navigate to="/admin/dashboard" replace state={{ from: location.pathname + location.search }} />;
    }
    if (auth.isStaff) {
      return <Navigate to="/staff" replace state={{ from: location.pathname + location.search }} />;
    }
    return <Navigate to="/dashboard" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

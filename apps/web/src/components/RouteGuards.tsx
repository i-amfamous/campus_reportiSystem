import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LoadingState, ErrorState } from './ui';

/** Requires an authenticated session. */
export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) return <LoadingState label="Checking your session…" />;
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Requires a verified institutional email address. */
export function VerifiedEmailRoute() {
  const auth = useAuth();
  if (auth.isLoading) return <LoadingState />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (auth.user && !auth.user.emailVerified) {
    return (
      <ErrorState
        title="Verify your institutional email address"
        description="Your account must be verified before you can submit or manage reports."
      />
    );
  }
  return <Outlet />;
}

/** Requires one of the given roles. */
export function RoleRoute({ roles }: { roles: string[] }) {
  const auth = useAuth();
  if (auth.isLoading) return <LoadingState />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.hasRole(...roles)) {
    return (
      <ErrorState
        title="You do not have access to this area"
        description="Your account does not hold the role required for this page. Ask an administrator if you believe this is wrong."
      />
    );
  }
  return <Outlet />;
}

/** Requires a permission key. */
export function PermissionRoute({ permission }: { permission: string }) {
  const auth = useAuth();
  if (auth.isLoading) return <LoadingState />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  if (!auth.hasPermission(permission)) {
    return (
      <ErrorState
        title="You do not have access to this area"
        description="Your account does not hold the permission required for this page."
      />
    );
  }
  return <Outlet />;
}

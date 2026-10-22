import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, PublicLayout } from './layouts/AppLayout';
import {
  PermissionRoute,
  ProtectedRoute,
  RoleRoute,
  VerifiedEmailRoute,
} from './components/RouteGuards';
import { useAuth } from './lib/auth';
import {
  AcceptInvitationPage,
  ForgotPasswordPage,
  LoginPage,
  ProfilePage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './features/auth/AuthPages';
import {
  NewTicketPage,
  StudentDashboardPage,
  TicketListPage,
} from './features/tickets/StudentPages';
import { TicketDetailPage } from './features/tickets/TicketDetailPage';
import {
  DepartmentMetricsPage,
  StaffDashboardPage,
  StaffQueuePage,
} from './features/staff/StaffPages';
import {
  AdminAuditPage,
  AdminCategoriesPage,
  AdminDashboardPage,
  AdminDepartmentsPage,
  AdminHomeRedirect,
  AdminReportsPage,
  AdminSettingsPage,
  AdminUsersPage,
} from './features/admin/AdminPages';
import { AdminBackupsPage } from './features/admin/AdminBackupsPage';
import { HelpPage, NotFoundPage } from './pages/PublicPages';
import { LoadingState } from './components/ui';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route element={<PublicLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/staff-invitation" element={<AcceptInvitationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Route>

      {/* Authenticated routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/profile" element={<ProfilePage />} />

          {/* Student area */}
          <Route element={<RoleRoute roles={['STUDENT']} />}>
            <Route path="/dashboard" element={<StudentDashboardPage />} />
            <Route path="/tickets" element={<TicketListPage />} />
          </Route>

          <Route element={<VerifiedEmailRoute />}>
            <Route path="/tickets/new" element={<NewTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
          </Route>

          {/* Staff area */}
          <Route
            element={<RoleRoute roles={['OFFICER', 'DEPARTMENT_HEAD', 'ADMIN', 'SUPER_ADMIN']} />}
          >
            <Route path="/staff" element={<StaffDashboardPage />} />
            <Route path="/staff/queue" element={<StaffQueuePage />} />
            <Route path="/staff/departments/:departmentId" element={<DepartmentMetricsPage />} />
          </Route>

          {/* Administration */}
          <Route element={<RoleRoute roles={['ADMIN', 'SUPER_ADMIN']} />}>
            <Route path="/admin" element={<AdminHomeRedirect />} />
            <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="/admin/departments" element={<AdminDepartmentsPage />} />
            <Route path="/admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
            <Route path="/admin/reports" element={<AdminReportsPage />} />
            <Route path="/admin/settings" element={<AdminSettingsPage />} />
          </Route>

          <Route element={<PermissionRoute permission="system:backup" />}>
            <Route path="/admin/backups" element={<AdminBackupsPage />} />
          </Route>

          <Route element={<PermissionRoute permission="analytics:global" />}>
            <Route path="/analytics" element={<AdminDashboardPage />} />
          </Route>

          <Route path="/" element={<HomeRedirect />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/** Sends the caller to the area that matches their role. */
function HomeRedirect() {
  const auth = useAuth();
  if (auth.isLoading) return <LoadingState label="Checking your session…" />;
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={auth.isStaff ? '/staff' : '/dashboard'} replace />;
}

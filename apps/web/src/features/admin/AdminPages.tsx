import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ASSIGNABLE_ROLES, ROLES, ROLE_LABELS, type RoleName } from '@campus-resolve/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Pagination,
  Select,
  StatCard,
  Table,
  Td,
  Textarea,
  Th,
  Tr,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';
import { formatDateTime, formatMinutesAsDuration } from '../../lib/format';
import {
  errorMessage,
  useAuditLogs,
  useCategories,
  useDepartments,
  useSettings,
  useSystemDashboard,
  useSystemHealth,
  useUsers,
} from '../tickets/api';
import type { Department } from '../../types';

/* -------------------------------------------------------------------------- */
/* Operations dashboard                                                       */
/* -------------------------------------------------------------------------- */

export function AdminDashboardPage() {
  const dashboard = useSystemDashboard();
  const health = useSystemHealth();

  if (dashboard.isLoading) return <LoadingState label="Loading the operations dashboard…" />;
  if (dashboard.isError) {
    return <ErrorState description={errorMessage(dashboard.error)} />;
  }

  const data = dashboard.data!.dashboard;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Operations</h1>
        <p className="text-sm text-slate-500">
          Institution-wide report volume, timeliness and delivery health.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total reports" value={data.totals.total} />
        <StatCard label="Open" value={data.totals.open} />
        <StatCard
          label="Overdue"
          value={data.totals.overdue}
          tone={data.totals.overdue > 0 ? 'danger' : 'success'}
        />
        <StatCard label="Unassigned" value={data.totals.unassigned} tone="warning" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Escalated" value={data.totals.escalated} tone="warning" />
        <StatCard label="Awaiting students" value={data.totals.awaitingStudent} />
        <StatCard label="Reopened" value={data.totals.reopened} />
        <StatCard
          label="Resolution rate"
          value={`${Math.round(data.totals.resolutionRate)}%`}
          tone="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Department performance" />
          {data.departments.length === 0 ? (
            <EmptyState title="No departments configured" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Department</Th>
                  <Th>Total</Th>
                  <Th>Open</Th>
                  <Th>Overdue</Th>
                  <Th>Target</Th>
                </tr>
              </thead>
              <tbody>
                {data.departments.map((department) => (
                  <Tr key={department.id}>
                    <Td className="text-sm font-medium text-slate-800">{department.name}</Td>
                    <Td>{department.total}</Td>
                    <Td>{department.open}</Td>
                    <Td>
                      {department.overdue > 0 ? (
                        <Badge tone="danger">{department.overdue}</Badge>
                      ) : (
                        '0'
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {department.resolutionTargetMinutes
                        ? formatMinutesAsDuration(department.resolutionTargetMinutes)
                        : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Delivery and job health"
            description="Background worker and email provider status."
          />
          <CardBody className="space-y-3">
            {health.isLoading ? (
              <LoadingState />
            ) : health.isError ? (
              <ErrorState description={errorMessage(health.error)} />
            ) : (
              <>
                <HealthRow label="Email provider" value={health.data!.emailProvider} />
                <HealthRow label="Pending jobs" value={String(health.data!.jobs.pending)} />
                <HealthRow label="Running jobs" value={String(health.data!.jobs.running)} />
                <HealthRow
                  label="Failed jobs"
                  value={String(health.data!.jobs.failed)}
                  tone={health.data!.jobs.failed > 0 ? 'danger' : 'default'}
                />
                <HealthRow
                  label="Notifications sent"
                  value={String(health.data!.notifications.sent)}
                />
                <HealthRow
                  label="Failed notifications"
                  value={String(health.data!.notifications.failed)}
                  tone={health.data!.notifications.failed > 0 ? 'danger' : 'default'}
                />
                <RetryFailedNotifications />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Timeliness" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Average first response"
            value={
              data.timings.averageFirstResponseMinutes === null
                ? '—'
                : formatMinutesAsDuration(data.timings.averageFirstResponseMinutes)
            }
          />
          <StatCard
            label="Average resolution"
            value={
              data.timings.averageResolutionMinutes === null
                ? '—'
                : formatMinutesAsDuration(data.timings.averageResolutionMinutes)
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span
        className={tone === 'danger' ? 'font-semibold text-rose-600' : 'font-medium text-slate-900'}
      >
        {value}
      </span>
    </div>
  );
}

function RetryFailedNotifications() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () =>
      api.post<{ queued: number }>('/api/v1/admin/system/retry-failed-notifications'),
    onSuccess: (result) => {
      toast.push({ tone: 'success', title: `Queued ${result.queued} notification(s) for retry` });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'health'] });
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Retry failed', description: errorMessage(error) });
    },
  });

  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={retry.isPending}
      onClick={() => retry.mutate()}
    >
      Retry failed notifications
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export function AdminUsersPage() {
  const auth = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const users = useUsers({
    page,
    pageSize: 20,
    search: search || undefined,
    role: role || undefined,
  });
  const departments = useDepartments();

  const invite = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/v1/admin/users/invite', body),
    onSuccess: () => {
      setInviteOpen(false);
      toast.push({ tone: 'success', title: 'Invitation sent' });
      void users.refetch();
    },
  });

  const updateRole = useMutation({
    mutationFn: (input: { userId: string; role: RoleName; departmentId?: string | null }) =>
      api.patch(`/api/v1/admin/users/${input.userId}/role`, {
        role: input.role,
        departmentId: input.departmentId ?? null,
        departmentRole: 'OFFICER',
      }),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Role updated' });
      void users.refetch();
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Role update failed', description: errorMessage(error) });
    },
  });

  const updateStatus = useMutation({
    mutationFn: (input: { userId: string; accountStatus: string }) =>
      api.patch(`/api/v1/admin/users/${input.userId}/status`, {
        accountStatus: input.accountStatus,
        reason: 'Changed by an administrator',
      }),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Account updated' });
      void users.refetch();
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Update failed', description: errorMessage(error) });
    },
  });

  const grantableRoles = useMemo<RoleName[]>(() => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'DEPARTMENT_HEAD', 'OFFICER'] as RoleName[]) {
      if (auth.hasRole(role)) return [...ASSIGNABLE_ROLES[role]];
    }
    return ['STUDENT'];
  }, [auth]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Staff &amp; users</h1>
          <p className="text-sm text-slate-500">
            Roles are scoped to departments. A staff role always replaces the student role.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>Invite staff member</Button>
      </header>

      <Card>
        <CardBody className="grid gap-3 p-4 sm:grid-cols-2">
          <FormField label="Search" htmlFor="user-search">
            <Input
              id="user-search"
              placeholder="Name, email or student ID"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Role" htmlFor="user-role">
            <Select
              id="user-role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
        </CardBody>
      </Card>

      <Card>
        {users.isLoading ? (
          <LoadingState />
        ) : users.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(users.error)} />
          </CardBody>
        ) : (users.data?.items ?? []).length === 0 ? (
          <EmptyState title="No accounts match these filters" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Department</Th>
                  <Th>Status</Th>
                  <Th>Last login</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {(users.data?.items ?? []).map((user) => (
                  <Tr key={user.id}>
                    <Td className="text-sm font-medium text-slate-800">{user.fullName}</Td>
                    <Td className="text-xs text-slate-600">{user.email}</Td>
                    <Td>
                      <Badge tone={user.roles.includes('STUDENT') ? 'default' : 'info'}>
                        {user.roles
                          .map((value) => ROLE_LABELS[value as RoleName] ?? value)
                          .join(', ')}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {user.departments.length > 0
                        ? user.departments.map((entry) => entry.name).join(', ')
                        : '—'}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          user.accountStatus === 'ACTIVE'
                            ? 'success'
                            : user.accountStatus === 'SUSPENDED'
                              ? 'danger'
                              : 'default'
                        }
                      >
                        {user.accountStatus.replace(/_/g, ' ').toLowerCase()}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Select
                          aria-label={`Change role for ${user.fullName}`}
                          value={user.roles[0] ?? 'STUDENT'}
                          onChange={(event) =>
                            updateRole.mutate({
                              userId: user.id,
                              role: event.target.value as RoleName,
                              departmentId: user.departments[0]?.id ?? null,
                            })
                          }
                          className="h-8 w-40 py-1 text-xs"
                        >
                          {grantableRoles.map((value) => (
                            <option key={value} value={value}>
                              {ROLE_LABELS[value]}
                            </option>
                          ))}
                        </Select>
                        {user.accountStatus === 'ACTIVE' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateStatus.mutate({ userId: user.id, accountStatus: 'SUSPENDED' })
                            }
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateStatus.mutate({ userId: user.id, accountStatus: 'ACTIVE' })
                            }
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={users.data?.page ?? 1}
              totalPages={users.data?.totalPages ?? 1}
              total={users.data?.total ?? 0}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <InviteStaffDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={(body) => invite.mutate(body)}
        pending={invite.isPending}
        error={invite.isError ? errorMessage(invite.error) : null}
        departments={departments.data?.items ?? []}
        grantableRoles={grantableRoles}
      />
    </div>
  );
}

function InviteStaffDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
  departments,
  grantableRoles,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
  pending: boolean;
  error: string | null;
  departments: Department[];
  grantableRoles: RoleName[];
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<RoleName>('OFFICER');
  const [departmentId, setDepartmentId] = useState('');

  const submit = () => {
    onSubmit({
      email,
      fullName,
      role,
      departmentId: departmentId || null,
      departmentRole: 'OFFICER',
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Invite a staff member"
      description="They receive an email with a link to activate their staff account."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={submit} disabled={!email || !fullName}>
            Send invitation
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <FormField label="Full name" htmlFor="invite-name" required>
          <Input
            id="invite-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </FormField>
        <FormField label="Email" htmlFor="invite-email" required>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField label="Role" htmlFor="invite-role" required>
          <Select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as RoleName)}
          >
            {grantableRoles
              .filter((value) => value !== 'STUDENT')
              .map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField
          label="Department"
          htmlFor="invite-department"
          hint="Staff roles are scoped to a department."
        >
          <Select
            id="invite-department"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Departments                                                                */
/* -------------------------------------------------------------------------- */

export function AdminDepartmentsPage() {
  const toast = useToast();
  const departments = useDepartments();
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const save = useMutation({
    mutationFn: async (input: { id?: string; body: Record<string, unknown> }) => {
      if (input.id) return api.patch(`/api/v1/admin/departments/${input.id}`, input.body);
      return api.post('/api/v1/admin/departments', input.body);
    },
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Department saved' });
      setEditing(null);
      setCreating(false);
      setName('');
      setDescription('');
      setContactEmail('');
      void departments.refetch();
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Save failed', description: errorMessage(error) });
    },
  });

  const saveTarget = useMutation({
    mutationFn: (input: { departmentId: string; body: Record<string, unknown> }) =>
      api.put(`/api/v1/admin/departments/${input.departmentId}/service-target`, input.body),
    onSuccess: () => toast.push({ tone: 'success', title: 'Service target updated' }),
    onError: (error) =>
      toast.push({ tone: 'error', title: 'Update failed', description: errorMessage(error) }),
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Departments</h1>
          <p className="text-sm text-slate-500">
            Each department owns a queue, a service target and its category list.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
        >
          New department
        </Button>
      </header>

      <Card>
        {departments.isLoading ? (
          <LoadingState />
        ) : departments.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(departments.error)} />
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Staff</Th>
                <Th>Categories</Th>
                <Th>Service target</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(departments.data?.items ?? []).map((department) => (
                <Tr key={department.id}>
                  <Td className="text-sm font-medium text-slate-800">{department.name}</Td>
                  <Td className="text-xs text-slate-500">{department.code ?? '—'}</Td>
                  <Td>{department.staffCount}</Td>
                  <Td>{department.categoryCount}</Td>
                  <Td className="text-xs text-slate-600">
                    {department.serviceTarget
                      ? `${formatMinutesAsDuration(department.serviceTarget.firstResponseMinutes)} response · ${formatMinutesAsDuration(department.serviceTarget.resolutionMinutes)} resolution`
                      : 'Default'}
                  </Td>
                  <Td>
                    <Badge tone={department.isActive ? 'success' : 'default'}>
                      {department.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(department);
                          setCreating(false);
                          setName(department.name);
                          setDescription(department.description ?? '');
                          setContactEmail(department.contactEmail ?? '');
                        }}
                      >
                        Edit
                      </Button>
                      <ServiceTargetDialog
                        department={department}
                        onSave={(body) => saveTarget.mutate({ departmentId: department.id, body })}
                        pending={saveTarget.isPending}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={editing ? 'Edit department' : 'New department'}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={name.trim().length < 2}
              onClick={() =>
                save.mutate({
                  id: editing?.id,
                  body: {
                    name,
                    description: description || undefined,
                    contactEmail: contactEmail || undefined,
                  },
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Name" htmlFor="department-name" required>
            <Input
              id="department-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label="Description" htmlFor="department-description">
            <Textarea
              id="department-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <FormField label="Contact email" htmlFor="department-email">
            <Input
              id="department-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}

function ServiceTargetDialog({
  department,
  onSave,
  pending,
}: {
  department: Department;
  onSave: (body: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const target = department.serviceTarget;
  const [firstResponse, setFirstResponse] = useState(String(target?.firstResponseMinutes ?? 480));
  const [resolution, setResolution] = useState(String(target?.resolutionMinutes ?? 4320));
  const [reminderInterval, setReminderInterval] = useState(
    String(target?.reminderIntervalMinutes ?? 120),
  );
  const [maxReminders, setMaxReminders] = useState(String(target?.maxReminders ?? 8));
  const [escalationAfter, setEscalationAfter] = useState(
    String(target?.escalationAfterReminders ?? 3),
  );

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Service target
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Service target — ${department.name}`}
        description="Targets drive reminders, escalation and the overdue indicators."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                onSave({
                  firstResponseMinutes: Number(firstResponse),
                  resolutionMinutes: Number(resolution),
                  reminderIntervalMinutes: Number(reminderInterval),
                  maxReminders: Number(maxReminders),
                  escalationAfterReminders: Number(escalationAfter),
                  businessHoursOnly: false,
                });
                setOpen(false);
              }}
            >
              Save target
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="First response (minutes)" htmlFor="target-first-response" required>
            <Input
              id="target-first-response"
              type="number"
              min={5}
              value={firstResponse}
              onChange={(event) => setFirstResponse(event.target.value)}
            />
          </FormField>
          <FormField label="Resolution (minutes)" htmlFor="target-resolution" required>
            <Input
              id="target-resolution"
              type="number"
              min={30}
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
            />
          </FormField>
          <FormField label="Reminder interval (minutes)" htmlFor="target-reminder">
            <Input
              id="target-reminder"
              type="number"
              min={15}
              value={reminderInterval}
              onChange={(event) => setReminderInterval(event.target.value)}
            />
          </FormField>
          <FormField label="Maximum reminders" htmlFor="target-max-reminders">
            <Input
              id="target-max-reminders"
              type="number"
              min={0}
              value={maxReminders}
              onChange={(event) => setMaxReminders(event.target.value)}
            />
          </FormField>
          <FormField label="Escalate after reminders" htmlFor="target-escalation">
            <Input
              id="target-escalation"
              type="number"
              min={0}
              value={escalationAfter}
              onChange={(event) => setEscalationAfter(event.target.value)}
            />
          </FormField>
        </div>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export function AdminCategoriesPage() {
  const toast = useToast();
  const categories = useCategories();
  const departments = useDepartments();
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    departmentId: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const save = useMutation({
    mutationFn: async (input: { id?: string; body: Record<string, unknown> }) => {
      if (input.id) return api.patch(`/api/v1/admin/categories/${input.id}`, input.body);
      return api.post('/api/v1/admin/categories', input.body);
    },
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Category saved' });
      setEditing(null);
      setName('');
      setDepartmentId('');
      void categories.refetch();
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Save failed', description: errorMessage(error) });
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Categories</h1>
          <p className="text-sm text-slate-500">
            Categories drive routing and the options students see when reporting.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing({ name: '', departmentId: '' });
          }}
        >
          New category
        </Button>
      </header>

      <Card>
        {categories.isLoading ? (
          <LoadingState />
        ) : categories.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(categories.error)} />
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Department</Th>
                <Th>Default priority</Th>
                <Th>Sensitive</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {(categories.data?.items ?? []).map((category) => (
                <Tr key={category.id}>
                  <Td className="text-sm font-medium text-slate-800">{category.name}</Td>
                  <Td className="text-sm">{category.departmentName ?? '—'}</Td>
                  <Td>
                    <Badge tone="default">{category.defaultPriority}</Badge>
                  </Td>
                  <Td>{category.isSensitive ? 'Yes' : 'No'}</Td>
                  <Td>
                    <Badge tone={category.isActive ? 'success' : 'default'}>
                      {category.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditing({
                          id: category.id,
                          name: category.name,
                          departmentId: category.departmentId ?? '',
                        });
                        setName(category.name);
                        setDepartmentId(category.departmentId ?? '');
                      }}
                    >
                      Edit
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'New category'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={save.isPending}
              disabled={name.trim().length < 2}
              onClick={() =>
                save.mutate({
                  id: editing?.id,
                  body: { name, departmentId: departmentId || null },
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Name" htmlFor="category-name" required>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label="Department" htmlFor="category-department">
            <Select
              id="category-department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">No department</option>
              {(departments.data?.items ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const logs = useAuditLogs({ page, pageSize: 25, action: action || undefined });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Audit trail</h1>
        <p className="text-sm text-slate-500">
          Every privileged action is recorded with the actor, the target and the request metadata.
        </p>
      </header>

      <Card>
        <CardBody className="p-4">
          <FormField label="Filter by action" htmlFor="audit-action">
            <Input
              id="audit-action"
              placeholder="e.g. TICKET_ASSIGNED"
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            />
          </FormField>
        </CardBody>
      </Card>

      <Card>
        {logs.isLoading ? (
          <LoadingState />
        ) : logs.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(logs.error)} />
          </CardBody>
        ) : (logs.data?.items ?? []).length === 0 ? (
          <EmptyState title="No audit entries match" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {(logs.data?.items ?? []).map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="text-xs text-slate-500">{formatDateTime(entry.createdAt)}</Td>
                    <Td className="text-sm">{entry.actor?.fullName ?? 'System'}</Td>
                    <Td>
                      <Badge tone="info">{entry.action}</Badge>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {entry.entityType}
                      {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ''}
                    </Td>
                    <Td className="max-w-md truncate text-xs text-slate-500">
                      {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={logs.data?.page ?? 1}
              totalPages={logs.data?.totalPages ?? 1}
              total={logs.data?.total ?? 0}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

export function AdminReportsPage() {
  const toast = useToast();
  const departments = useDepartments();
  const [type, setType] = useState<'tickets' | 'analytics' | 'notifications' | 'audit'>('tickets');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [departmentId, setDepartmentId] = useState('');

  const runExport = async () => {
    try {
      const params = new URLSearchParams({ type, format });
      if (departmentId) params.set('departmentId', departmentId);
      const payload = await api.get<{ csv?: string; rows?: Record<string, unknown>[] }>(
        `/api/v1/admin/reports?${params.toString()}`,
      );
      const csv = payload.csv ?? toCsv(payload.rows ?? []);
      downloadCsv(csv, `campus-resolve-${type}-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.push({ tone: 'success', title: 'Export downloaded' });
    } catch (error) {
      toast.push({ tone: 'error', title: 'Export failed', description: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Reports &amp; exports
        </h1>
        <p className="text-sm text-slate-500">
          Exports contain ticket metadata only. Student contact details are never included.
        </p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader title="Build an export" />
        <CardBody className="space-y-4">
          <FormField label="Dataset" htmlFor="export-type">
            <Select
              id="export-type"
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <option value="tickets">Tickets</option>
              <option value="analytics">Analytics</option>
              <option value="notifications">Notifications</option>
              <option value="audit">Audit trail</option>
            </Select>
          </FormField>
          <FormField label="Format" htmlFor="export-format">
            <Select
              id="export-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as typeof format)}
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </Select>
          </FormField>
          <FormField label="Department" htmlFor="export-department" hint="Optional">
            <Select
              id="export-department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">All departments</option>
              {(departments.data?.items ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </FormField>
          <Button onClick={() => void runExport()}>Generate export</Button>
        </CardBody>
      </Card>
    </div>
  );
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export function AdminSettingsPage() {
  const toast = useToast();
  const settings = useSettings();
  const [institutionName, setInstitutionName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [remindersPaused, setRemindersPaused] = useState(false);
  const [allowOfficerSelection, setAllowOfficerSelection] = useState(true);

  const current = settings.data?.settings;

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/api/v1/admin/settings', body),
    onSuccess: () => {
      toast.push({ tone: 'success', title: 'Settings saved' });
      void settings.refetch();
    },
    onError: (error) => {
      toast.push({ tone: 'error', title: 'Save failed', description: errorMessage(error) });
    },
  });

  if (settings.isLoading) return <LoadingState label="Loading settings…" />;
  if (settings.isError) return <ErrorState description={errorMessage(settings.error)} />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">System settings</h1>
        <p className="text-sm text-slate-500">
          Institution-wide defaults for routing, reminders and retention.
        </p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader title="General" />
        <CardBody className="space-y-4">
          <FormField label="Institution name" htmlFor="setting-name">
            <Input
              id="setting-name"
              defaultValue={current?.institutionName ?? ''}
              onChange={(event) => setInstitutionName(event.target.value)}
            />
          </FormField>
          <FormField label="Support email" htmlFor="setting-support">
            <Input
              id="setting-support"
              type="email"
              defaultValue={current?.supportEmail ?? ''}
              onChange={(event) => setSupportEmail(event.target.value)}
            />
          </FormField>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              defaultChecked={current?.remindersPaused ?? false}
              onChange={(event) => setRemindersPaused(event.target.checked)}
            />
            <span>
              Pause all reminders and escalation emails. Reports keep their state, but no reminder
              is sent until this is turned off.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              defaultChecked={current?.allowStudentOfficerSelection ?? true}
              onChange={(event) => setAllowOfficerSelection(event.target.checked)}
            />
            <span>Allow students to nominate a specific responsible officer.</span>
          </label>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                ...(institutionName ? { institutionName } : {}),
                ...(supportEmail ? { supportEmail } : {}),
                remindersPaused,
                allowStudentOfficerSelection: allowOfficerSelection,
              })
            }
          >
            Save settings
          </Button>
        </CardBody>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader
          title="Current configuration"
          description="Read-only view of the stored values."
        />
        <CardBody>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(current ?? {}).map(([key, value]) => (
              <div key={key} className="flex justify-between border-b border-slate-100 pb-1">
                <dt className="text-slate-500">{key}</dt>
                <dd className="max-w-[60%] truncate text-right text-slate-800">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

export function AdminHomeRedirect() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Choose an area from the sidebar, or open the{' '}
        <Link to="/admin/dashboard" className="font-semibold text-indigo-700 hover:underline">
          operations dashboard
        </Link>
        .
      </p>
    </div>
  );
}

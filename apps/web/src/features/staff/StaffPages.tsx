import { lazy, Suspense, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { STATUS_LABELS, TICKET_STATUSES, type TicketStatus } from '@campus-resolve/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Pagination,
  PriorityBadge,
  Select,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDuration, formatDateTime, formatMinutesAsDuration, relativeTime } from '../../lib/format';
import {
  errorMessage,
  useAcademicPeriods,
  useDepartmentAnalytics,
  useDepartmentWorkload,
  useDepartments,
  useRoleDashboard,
  useStaffTickets,
} from '../tickets/api';

// Charts are loaded only when a dashboard is opened.
const RoleDashboardCharts = lazy(() =>
  import('../admin/charts').then((module) => ({ default: module.RoleDashboardCharts })),
);

export function StaffDashboardPage() {
  const auth = useAuth();
  const dashboard = useRoleDashboard();
  const queue = useStaffTickets({ pageSize: 100 });
  const items = queue.data?.items ?? [];

  const attentionItems = useMemo(
    () => items.filter((ticket) => ticket.overdue || ticket.assignedTo === null).slice(0, 8),
    [items],
  );

  if (queue.isLoading || dashboard.isLoading) {
    return <LoadingState label="Loading your dashboard…" />;
  }
  if (queue.isError || dashboard.isError) {
    return (
      <ErrorState
        description={errorMessage(queue.error ?? dashboard.error)}
        action={
          <Button
            onClick={() => {
              void queue.refetch();
              void dashboard.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  const data = dashboard.data!.dashboard;
  const totals = data.totals;
  const roleLabel = data.role === 'DEPARTMENT_HEAD' ? 'Department head' : 'Staff';
  const departmentNames = data.identity.departmentNames;
  const hasReports = totals.total > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Staff overview
            </h1>
            <Badge tone={data.role === 'DEPARTMENT_HEAD' ? 'info' : 'default'}>{roleLabel}</Badge>
            {data.period ? <Badge>{data.period.label}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {departmentNames.length > 0
              ? `Reports across ${departmentNames.join(', ')}.`
              : 'Reports across the departments you are assigned to.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/staff/queue"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
          >
            Open work queue
          </Link>
          <Link
            to="/staff/queue?scope=mine"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            My assignments
          </Link>
        </div>
      </header>

      {totals.newSinceLastLogin > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/40">
          <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
            {totals.newSinceLastLogin} new report{totals.newSinceLastLogin === 1 ? '' : 's'} since
            your last visit
          </p>
          <Link
            to="/staff/queue?scope=open"
            className="text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
          >
            Review open reports
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open reports"
          value={totals.open}
          hint={hasReports ? `${totals.total} in your scope` : 'No reports in scope yet'}
          to="/staff/queue?scope=open"
        />
        <StatCard
          label="Assigned to you"
          value={totals.assignedToMe}
          hint={totals.assignedToMe > 0 ? 'In your personal queue' : 'Nothing assigned right now'}
          to="/staff/queue?scope=mine"
        />
        <StatCard
          label="Unassigned"
          value={totals.unassigned}
          tone={totals.unassigned > 0 ? 'warning' : 'default'}
          hint={totals.unassigned > 0 ? 'Waiting for an owner' : 'Everything assigned'}
          to="/staff/queue?scope=unassigned"
        />
        <StatCard
          label="Overdue"
          value={totals.overdue}
          tone={totals.overdue > 0 ? 'danger' : 'success'}
          hint={totals.overdue > 0 ? 'Past the response or resolution target' : 'All within target'}
          to="/staff/queue?scope=overdue"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Average first response
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                {data.timings.averageFirstResponseMinutes === null
                  ? 'No data'
                  : formatMinutesAsDuration(data.timings.averageFirstResponseMinutes)}
              </p>
            </div>
            <p className="max-w-[12rem] text-xs text-slate-500 dark:text-slate-400">
              Time from submission to the first staff response in your scope.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Average resolution
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                {data.timings.averageResolutionMinutes === null
                  ? 'No data'
                  : formatMinutesAsDuration(data.timings.averageResolutionMinutes)}
              </p>
            </div>
            <p className="max-w-[12rem] text-xs text-slate-500 dark:text-slate-400">
              Time from submission to resolution for reports in your scope.
            </p>
          </CardBody>
        </Card>
      </div>

      {hasReports ? (
        <Suspense
          fallback={
            <Card>
              <CardBody>
                <LoadingState label="Loading your charts…" />
              </CardBody>
            </Card>
          }
        >
          <RoleDashboardCharts dashboard={data} audience="staff" />
        </Suspense>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs attention first"
            description="Overdue and unassigned reports, oldest first."
            action={
              <Link
                to="/staff/queue?scope=overdue"
                className="text-xs font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
              >
                Open the queue
              </Link>
            }
          />
          {attentionItems.length === 0 ? (
            <EmptyState
              title="Nothing needs attention"
              description="Every report is assigned and within target."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th>Age</Th>
                </tr>
              </thead>
              <tbody>
                {attentionItems.map((ticket) => (
                  <Tr key={ticket.id}>
                    <Td className="font-mono text-xs">{ticket.referenceNumber}</Td>
                    <Td>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                      >
                        {ticket.subject}
                      </Link>
                      {ticket.overdue ? (
                        <Badge tone="danger" className="mt-1">
                          Overdue
                        </Badge>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusBadge status={ticket.status} label={ticket.statusLabel} />
                    </Td>
                    <Td className="text-xs text-slate-500 dark:text-slate-400">
                      {relativeTime(ticket.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Your departments"
            description="Select a department to see its performance."
          />
          <CardBody className="space-y-2">
            {(auth.user?.departments ?? []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You are not assigned to a department yet. Ask an administrator to add you.
              </p>
            ) : (
              (auth.user?.departments ?? []).map((department) => {
                const metrics = data.departments.find(
                  (item) => item.id === department.departmentId,
                );
                return (
                  <Link
                    key={department.departmentId}
                    to={`/staff/departments/${department.departmentId}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {department.departmentName}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {department.departmentRole === 'HEAD' ? 'Head' : 'Officer'}
                        {metrics ? ` · ${metrics.open} open` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                      View metrics
                    </span>
                  </Link>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Work queue                                                                 */
/* -------------------------------------------------------------------------- */

const QUEUE_SCOPES = [
  { value: 'all', label: 'All reports' },
  { value: 'open', label: 'Open reports' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'reopened', label: 'Reopened' },
  { value: 'awaiting', label: 'Awaiting students' },
  { value: 'resolved', label: 'Resolved or closed' },
] as const;

type QueueScope = (typeof QUEUE_SCOPES)[number]['value'];

function isQueueScope(value: string | null): value is QueueScope {
  return QUEUE_SCOPES.some((option) => option.value === value);
}

export function StaffQueuePage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const departments = useDepartments();
  const periods = useAcademicPeriods();

  // Filters live in the URL so dashboard cards can open a pre-filtered view
  // and the browser back button restores the previous view.
  const status = searchParams.get('status') ?? '';
  const search = searchParams.get('search') ?? '';
  const scopeParam = searchParams.get('scope');
  const scope: QueueScope = isQueueScope(scopeParam) ? scopeParam : 'all';
  const departmentId = searchParams.get('departmentId') ?? '';
  const academicPeriodId = searchParams.get('academicPeriodId') ?? '';
  const pageParam = Number.parseInt(searchParams.get('page') ?? '', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const updateQuery = (updates: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in updates)) next.delete('page');
    setSearchParams(next, { replace });
  };

  const filters = {
    page,
    pageSize: 20,
    status: status || undefined,
    search: search || undefined,
    departmentId: departmentId || undefined,
    academicPeriodId: academicPeriodId || undefined,
    assignedToId: scope === 'mine' ? auth.user?.id : undefined,
    unassigned: scope === 'unassigned' ? true : undefined,
    overdue: scope === 'overdue' ? true : undefined,
    open: scope === 'open' ? true : undefined,
    escalated: scope === 'escalated' ? true : undefined,
    reopened: scope === 'reopened' ? true : undefined,
    resolved: scope === 'resolved' ? true : undefined,
    awaitingStudent: scope === 'awaiting' ? true : undefined,
  };

  const queue = useStaffTickets(filters);
  const items = queue.data?.items ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Work queue</h1>
          <p className="text-sm text-slate-500">
            Reports you are responsible for, scoped to your departments.
          </p>
        </div>
      </header>

      <Card>
        <CardBody className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="Search" htmlFor="queue-search">
            <Input
              id="queue-search"
              placeholder="Reference, subject or keyword"
              value={search}
              onChange={(event) => updateQuery({ search: event.target.value }, true)}
            />
          </FormField>
          <FormField label="Status" htmlFor="queue-status">
            <Select
              id="queue-status"
              value={status}
              onChange={(event) => updateQuery({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Scope" htmlFor="queue-scope">
            <Select
              id="queue-scope"
              value={scope}
              onChange={(event) =>
                updateQuery({ scope: event.target.value === 'all' ? null : event.target.value })
              }
            >
              {QUEUE_SCOPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Academic period" htmlFor="queue-period">
            <Select
              id="queue-period"
              value={academicPeriodId}
              onChange={(event) => updateQuery({ academicPeriodId: event.target.value })}
            >
              <option value="">All periods</option>
              {(periods.data?.items ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                  {period.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Department" htmlFor="queue-department">
            <Select
              id="queue-department"
              value={departmentId}
              onChange={(event) => updateQuery({ departmentId: event.target.value })}
            >
              <option value="">All my departments</option>
              {(departments.data?.items ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </FormField>
        </CardBody>
      </Card>

      <Card>
        {queue.isLoading ? (
          <LoadingState />
        ) : queue.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(queue.error)} />
          </CardBody>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reports match these filters"
            description="Try a different status, scope or department."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Subject</Th>
                  <Th>Category</Th>
                  <Th>Officer</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
                  <Tr key={ticket.id}>
                    <Td className="font-mono text-xs">{ticket.referenceNumber}</Td>
                    <Td>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      {ticket.overdue ? (
                        <Badge tone="danger" className="mt-1">
                          Overdue
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-sm">{ticket.category?.name ?? 'Not set'}</Td>
                    <Td className="text-sm">{ticket.assignedTo?.fullName ?? 'Unassigned'}</Td>
                    <Td>
                      <PriorityBadge priority={ticket.priority} />
                    </Td>
                    <Td>
                      <StatusBadge status={ticket.status} label={ticket.statusLabel} />
                    </Td>
                    <Td className="text-xs text-slate-500">{relativeTime(ticket.updatedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={queue.data?.page ?? 1}
              totalPages={queue.data?.totalPages ?? 1}
              total={queue.data?.total ?? 0}
              onChange={(nextPage) =>
                updateQuery({ page: nextPage > 1 ? String(nextPage) : null }, true)
              }
            />
          </>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Department metrics                                                         */
/* -------------------------------------------------------------------------- */

export function DepartmentMetricsPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const metrics = useDepartmentAnalytics(departmentId);
  const workload = useDepartmentWorkload(departmentId);

  if (metrics.isLoading) return <LoadingState label="Loading department metrics…" />;
  if (metrics.isError) {
    return <ErrorState description={errorMessage(metrics.error)} />;
  }

  const data = metrics.data!.metrics;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/staff" className="text-xs text-slate-500 hover:text-slate-800">
            ← Work queue
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {data.departmentName}
          </h1>
          <p className="text-sm text-slate-500">
            Volume, timeliness and satisfaction for this department.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total reports" value={data.total} />
        <StatCard label="Open" value={data.open} />
        <StatCard
          label="Overdue"
          value={data.overdue}
          tone={data.overdue > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Escalated"
          value={data.escalated}
          tone={data.escalated > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Average first response"
          value={formatDuration(data.averageFirstResponseMinutes)}
        />
        <StatCard
          label="Average resolution"
          value={formatDuration(data.averageResolutionMinutes)}
        />
        <StatCard label="Resolved within target" value={data.resolvedWithinTarget} />
        <StatCard
          label="Satisfaction"
          value={
            data.satisfactionAverage === null
              ? 'Not set'
              : `${data.satisfactionAverage.toFixed(1)} / 5 (${data.satisfactionCount})`
          }
          tone="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Staff workload" description="Open reports per officer." />
          {workload.isLoading ? (
            <LoadingState />
          ) : (workload.data?.items ?? []).length === 0 ? (
            <EmptyState title="No staff assigned" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Officer</Th>
                  <Th>Assigned</Th>
                  <Th>Overdue</Th>
                  <Th>Resolved</Th>
                </tr>
              </thead>
              <tbody>
                {(workload.data?.items ?? []).map((entry) => (
                  <Tr key={entry.userId}>
                    <Td className="text-sm font-medium text-slate-800">{entry.fullName}</Td>
                    <Td>{entry.assigned}</Td>
                    <Td>
                      {entry.overdue > 0 ? <Badge tone="danger">{entry.overdue}</Badge> : '0'}
                    </Td>
                    <Td>{entry.resolved}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Volume by status" />
          <CardBody className="space-y-2">
            {Object.entries(data.volumeByStatus).length === 0 ? (
              <p className="text-sm text-slate-500">No data yet.</p>
            ) : (
              Object.entries(data.volumeByStatus).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{key.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="font-medium tabular-nums text-slate-900">{value}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function staffStatusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status];
}

export function staffTimestamp(value: string | null): string {
  return value ? formatDateTime(value) : 'Not set';
}

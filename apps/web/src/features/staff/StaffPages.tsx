import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { formatDuration, formatDateTime, relativeTime } from '../../lib/format';
import {
  errorMessage,
  useDepartmentAnalytics,
  useDepartmentWorkload,
  useDepartments,
  useStaffTickets,
} from '../tickets/api';

export function StaffDashboardPage() {
  const auth = useAuth();
  const queue = useStaffTickets({ pageSize: 100 });
  const items = queue.data?.items ?? [];

  const counts = useMemo(
    () => ({
      open: items.filter((ticket) => !['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(ticket.status))
        .length,
      unassigned: items.filter((ticket) => ticket.assignedTo === null).length,
      overdue: items.filter((ticket) => ticket.overdue).length,
      mine: items.filter((ticket) => ticket.assignedTo?.id === auth.user?.id).length,
    }),
    [items, auth.user?.id],
  );

  if (queue.isLoading) return <LoadingState label="Loading your queue…" />;
  if (queue.isError) {
    return (
      <ErrorState
        description={errorMessage(queue.error)}
        action={<Button onClick={() => void queue.refetch()}>Try again</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Staff overview</h1>
        <p className="text-sm text-slate-500">
          Reports across the departments you are assigned to.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open reports" value={counts.open} />
        <StatCard label="Assigned to you" value={counts.mine} />
        <StatCard
          label="Unassigned"
          value={counts.unassigned}
          tone={counts.unassigned > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Overdue"
          value={counts.overdue}
          tone={counts.overdue > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs attention first"
            description="Overdue and unassigned reports, oldest first."
            action={
              <Link to="/staff" className="text-xs font-semibold text-indigo-700 hover:underline">
                Open the queue
              </Link>
            }
          />
          {items.filter((ticket) => ticket.overdue || ticket.assignedTo === null).length === 0 ? (
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
                {items
                  .filter((ticket) => ticket.overdue || ticket.assignedTo === null)
                  .slice(0, 8)
                  .map((ticket) => (
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
                      <Td>
                        <StatusBadge status={ticket.status} label={ticket.statusLabel} />
                      </Td>
                      <Td className="text-xs text-slate-500">{relativeTime(ticket.createdAt)}</Td>
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
              <p className="text-sm text-slate-500">
                You are not assigned to a department yet. Ask an administrator to add you.
              </p>
            ) : (
              (auth.user?.departments ?? []).map((department) => (
                <Link
                  key={department.departmentId}
                  to={`/staff/departments/${department.departmentId}`}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 hover:bg-slate-100"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {department.departmentName}
                  </span>
                  <span className="text-xs text-slate-500">View metrics</span>
                </Link>
              ))
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

export function StaffQueuePage() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'mine' | 'unassigned' | 'overdue'>('all');
  const [departmentId, setDepartmentId] = useState('');
  const departments = useDepartments();

  const filters = {
    page,
    pageSize: 20,
    status: status || undefined,
    search: search || undefined,
    departmentId: departmentId || undefined,
    assignedToId: scope === 'mine' ? auth.user?.id : undefined,
    unassigned: scope === 'unassigned' ? true : undefined,
    overdue: scope === 'overdue' ? true : undefined,
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
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Status" htmlFor="queue-status">
            <Select
              id="queue-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
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
              onChange={(event) => {
                setScope(event.target.value as typeof scope);
                setPage(1);
              }}
            >
              <option value="all">All reports</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              <option value="overdue">Overdue</option>
            </Select>
          </FormField>
          <FormField label="Department" htmlFor="queue-department">
            <Select
              id="queue-department"
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value);
                setPage(1);
              }}
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
                    <Td className="text-sm">{ticket.category?.name ?? '—'}</Td>
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
              onChange={setPage}
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
              ? '—'
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
  return value ? formatDateTime(value) : '—';
}

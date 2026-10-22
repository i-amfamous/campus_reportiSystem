import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createTicketSchema,
  STATUS_LABELS,
  TICKET_STATUSES,
  type CreateTicketInput,
} from '@campus-resolve/shared';
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
  Textarea,
  Th,
  Tr,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatDateTime, relativeTime } from '../../lib/format';
import {
  errorMessage,
  useCategories,
  useCreateTicket,
  useDepartments,
  useDepartmentOfficers,
  useMyTickets,
  useNotifications,
} from './api';

const OPEN_STATUSES = ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'AWAITING_EXTERNAL', 'ESCALATED'];

/* -------------------------------------------------------------------------- */
/* Student dashboard                                                          */
/* -------------------------------------------------------------------------- */

export function StudentDashboardPage() {
  const auth = useAuth();
  const tickets = useMyTickets({ pageSize: 100 });
  const notifications = useNotifications();

  const items = tickets.data?.items ?? [];
  const counts = useMemo(
    () => ({
      total: items.length,
      inProgress: items.filter((ticket) => OPEN_STATUSES.includes(ticket.status)).length,
      awaitingStudent: items.filter((ticket) => ticket.status === 'AWAITING_STUDENT').length,
      resolved: items.filter((ticket) => ['RESOLVED', 'CLOSED'].includes(ticket.status)).length,
    }),
    [items],
  );

  const needsAttention = items.filter((ticket) => ticket.status === 'AWAITING_STUDENT');
  const recent = [...items]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  if (tickets.isLoading) return <LoadingState label="Loading your reports…" />;
  if (tickets.isError) {
    return (
      <ErrorState
        description={errorMessage(tickets.error)}
        action={<Button onClick={() => void tickets.refetch()}>Try again</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Welcome back{auth.user?.fullName ? `, ${auth.user.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-slate-500">
            Here is where your reports stand and what needs your attention.
          </p>
        </div>
        <Link to="/tickets/new">
          <Button>Create new report</Button>
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Reports submitted" value={counts.total} />
        <StatCard label="In progress" value={counts.inProgress} />
        <StatCard
          label="Awaiting your response"
          value={counts.awaitingStudent}
          tone={counts.awaitingStudent > 0 ? 'warning' : 'default'}
          hint={
            counts.awaitingStudent > 0 ? 'Please open these reports' : 'Nothing needs you right now'
          }
        />
        <StatCard label="Resolved" value={counts.resolved} tone="success" />
      </div>

      {needsAttention.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader
            title="Reports waiting for you"
            description="A department officer has asked for more information."
          />
          <CardBody className="space-y-2">
            {needsAttention.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-4 py-3 ring-1 ring-amber-200 hover:ring-amber-400"
              >
                <span className="font-medium text-slate-900">{ticket.subject}</span>
                <span className="font-mono text-xs text-slate-500">{ticket.referenceNumber}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recently updated reports"
            action={
              <Link to="/tickets" className="text-xs font-semibold text-indigo-700 hover:underline">
                View all
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState
              title="No reports yet"
              description="Submit your first report and you will be able to follow every update here."
              action={
                <Link to="/tickets/new">
                  <Button>Create new report</Button>
                </Link>
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((ticket) => (
                  <Tr key={ticket.id}>
                    <Td className="font-mono text-xs">{ticket.referenceNumber}</Td>
                    <Td>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                    </Td>
                    <Td>
                      <StatusBadge status={ticket.status} label={ticket.statusLabel} />
                    </Td>
                    <Td className="text-xs text-slate-500">{relativeTime(ticket.updatedAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Notifications" description="Recent messages about your reports." />
          <CardBody className="space-y-2">
            {(notifications.data?.items ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No notifications yet.</p>
            ) : (
              (notifications.data?.items ?? []).slice(0, 8).map((notification) => (
                <div key={notification.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs font-medium text-slate-800">
                    {notification.type.replace(/_/g, ' ').toLowerCase()}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ticket list                                                                */
/* -------------------------------------------------------------------------- */

export function TicketListPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const tickets = useMyTickets({
    page,
    pageSize: 20,
    status: status || undefined,
    search: search || undefined,
  });

  const items = tickets.data?.items ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">My reports</h1>
          <p className="text-sm text-slate-500">
            Every report you have submitted, with its current status.
          </p>
        </div>
        <Link to="/tickets/new">
          <Button>Create new report</Button>
        </Link>
      </header>

      <Card>
        <CardBody className="grid gap-3 p-4 sm:grid-cols-3">
          <FormField label="Search" htmlFor="search">
            <Input
              id="search"
              placeholder="Reference, subject or keyword"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </FormField>
          <FormField label="Status" htmlFor="status">
            <Select
              id="status"
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
        </CardBody>
      </Card>

      <Card>
        {tickets.isLoading ? (
          <LoadingState />
        ) : tickets.isError ? (
          <CardBody>
            <ErrorState description={errorMessage(tickets.error)} />
          </CardBody>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reports match your filters"
            description="Adjust the filters or submit a new report."
            action={
              <Link to="/tickets/new">
                <Button>Create new report</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Subject</Th>
                  <Th>Department</Th>
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
                      <p className="text-xs text-slate-500">{ticket.category?.name}</p>
                    </Td>
                    <Td className="text-sm">{ticket.department?.name ?? '—'}</Td>
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
              page={tickets.data?.page ?? 1}
              totalPages={tickets.data?.totalPages ?? 1}
              total={tickets.data?.total ?? 0}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* New report                                                                 */
/* -------------------------------------------------------------------------- */

export function NewTicketPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const departments = useDepartments();
  const categories = useCategories();
  const createTicket = useCreateTicket();
  const [submittedReference, setSubmittedReference] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      categoryId: '',
      departmentId: '',
      assignedToId: undefined,
      subject: '',
      description: '',
      courseCode: '',
      courseTitle: '',
      semester: '',
      assessmentReference: '',
      transactionReference: '',
      studentEmail: '',
      preferredContactMethod: 'EMAIL',
    },
  });

  const categoryId = form.watch('categoryId');
  const departmentId = form.watch('departmentId');
  const officers = useDepartmentOfficers(departmentId || undefined);
  const selectedCategory = categories.data?.items.find((category) => category.id === categoryId);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await createTicket.mutateAsync({
        ...values,
        assignedToId: values.assignedToId || null,
        useTriageQueue: !values.assignedToId,
      });
      setSubmittedReference(result.referenceNumber);
      toast.push({
        tone: 'success',
        title: 'Report submitted',
        description: `Reference ${result.referenceNumber}`,
      });
    } catch (caught) {
      setServerError(errorMessage(caught));
    }
  });

  if (submittedReference) {
    return (
      <Card>
        <CardBody className="space-y-4 p-8 text-center">
          <p className="text-sm font-medium text-emerald-700">Report received</p>
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            {submittedReference}
          </p>
          <p className="mx-auto max-w-md text-sm text-slate-600">
            Keep this reference for your records. The relevant department has been notified and you
            will receive email updates as the report progresses.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/tickets">
              <Button variant="secondary">Back to my reports</Button>
            </Link>
            <Button
              onClick={() => {
                setSubmittedReference(null);
                form.reset();
              }}
            >
              Submit another report
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (departments.isLoading || categories.isLoading) return <LoadingState />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Report an issue</h1>
        <p className="text-sm text-slate-500">
          Tell us what happened and we will route your report to the right department.
        </p>
      </header>

      {serverError ? (
        <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {serverError}
        </div>
      ) : null}

      <Card>
        <CardBody className="space-y-5">
          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <FormField
              label="Issue category"
              htmlFor="categoryId"
              required
              error={form.formState.errors.categoryId?.message}
              hint="Choose the option that best describes your problem."
            >
              <Controller
                name="categoryId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    id="categoryId"
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => {
                      field.onChange(event.target.value);
                      const category = categories.data?.items.find(
                        (item) => item.id === event.target.value,
                      );
                      if (category?.departmentId) {
                        form.setValue('departmentId', category.departmentId, {
                          shouldValidate: true,
                        });
                      }
                    }}
                  >
                    <option value="">Select a category</option>
                    {(categories.data?.items ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </FormField>

            <FormField
              label="Department"
              htmlFor="departmentId"
              required
              error={form.formState.errors.departmentId?.message}
              hint={
                selectedCategory?.departmentName
                  ? `Suggested: ${selectedCategory.departmentName}. Change it only if you know a different office handles this.`
                  : 'The department that should receive your report.'
              }
            >
              <Controller
                name="departmentId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    id="departmentId"
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                  >
                    <option value="">Select a department</option>
                    {(departments.data?.items ?? []).map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </Select>
                )}
              />
            </FormField>

            {departmentId ? (
              <FormField
                label="Responsible officer (optional)"
                htmlFor="assignedToId"
                hint="If you do not know who handles this, leave it blank and the department will assign it."
              >
                <Controller
                  name="assignedToId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      id="assignedToId"
                      ref={field.ref}
                      value={field.value ?? ''}
                      onBlur={field.onBlur}
                      onChange={(event) =>
                        field.onChange(event.target.value === '' ? undefined : event.target.value)
                      }
                    >
                      <option value="">Send to the department queue</option>
                      {(officers.data?.items ?? []).map((officer) => (
                        <option key={officer.id} value={officer.id}>
                          {officer.fullName}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </FormField>
            ) : null}

            <FormField
              label="Student email (mandatory)"
              htmlFor="studentEmail"
              required
              error={form.formState.errors.studentEmail?.message}
              hint="Enter your student email address. This will be attached to your report."
            >
              <Input id="studentEmail" type="email" autoComplete="email" {...form.register('studentEmail')} />
            </FormField>

            <FormField
              label="Subject"
              htmlFor="subject"
              required
              error={form.formState.errors.subject?.message}
            >
              <Input
                id="subject"
                placeholder="Short summary of the issue"
                {...form.register('subject')}
              />
            </FormField>

            <FormField
              label="Detailed description"
              htmlFor="description"
              required
              error={form.formState.errors.description?.message}
              hint="Include dates, course codes and what you have already tried. Do not include passwords or PINs."
            >
              <Textarea id="description" rows={7} {...form.register('description')} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Course code" htmlFor="courseCode" hint="Optional">
                <Input id="courseCode" {...form.register('courseCode')} />
              </FormField>
              <FormField label="Course title" htmlFor="courseTitle" hint="Optional">
                <Input id="courseTitle" {...form.register('courseTitle')} />
              </FormField>
              <FormField label="Semester or academic year" htmlFor="semester" hint="Optional">
                <Input id="semester" {...form.register('semester')} />
              </FormField>
              <FormField
                label="Examination reference"
                htmlFor="assessmentReference"
                hint="Optional"
              >
                <Input id="assessmentReference" {...form.register('assessmentReference')} />
              </FormField>
              <FormField
                label="Payment transaction reference"
                htmlFor="transactionReference"
                hint="Optional — use the receipt reference, never your PIN or full card details."
              >
                <Input id="transactionReference" {...form.register('transactionReference')} />
              </FormField>
              <FormField label="Preferred contact method" htmlFor="preferredContactMethod">
                <Select id="preferredContactMethod" {...form.register('preferredContactMethod')}>
                  <option value="EMAIL">Email</option>
                  <option value="PHONE">Phone</option>
                  <option value="IN_PERSON">In person</option>
                </Select>
              </FormField>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => navigate('/tickets')}>
                Cancel
              </Button>
              <Button type="submit" loading={createTicket.isPending}>
                Submit report
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <p className="text-xs text-slate-500">
        <Badge tone="info">Privacy</Badge> Reports are visible to the staff of the department
        handling them. Internal staff notes are never shown to students.
      </p>
    </div>
  );
}

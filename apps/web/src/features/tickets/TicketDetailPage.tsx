import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  TICKET_STATUSES,
  type TicketStatus,
} from '@campus-resolve/shared';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  FormField,
  LoadingState,
  PriorityBadge,
  Select,
  StatusBadge,
  Textarea,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatBytes, formatDateTime, relativeTime } from '../../lib/format';
import type { TicketDetail } from '../../types';
import { errorMessage, useDepartmentOfficers, useTicket, useTicketMutations } from './api';

const INACTIVE_STATUSES: TicketStatus[] = ['RESOLVED', 'CLOSED', 'WITHDRAWN'];

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const toast = useToast();
  const ticketQuery = useTicket(id);
  const mutations = useTicketMutations(id);
  const officers = useDepartmentOfficers(ticketQuery.data?.ticket.department.id);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (ticketQuery.isLoading) return <LoadingState label="Loading report…" />;
  if (ticketQuery.isError) {
    return (
      <ErrorState
        title="Report not available"
        description={errorMessage(ticketQuery.error)}
        action={
          <Link to={auth.isStaff ? '/staff' : '/tickets'}>
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />
    );
  }

  const ticket = ticketQuery.data!.ticket;
  const isOwner = auth.user?.id === ticket.student.id;
  const isStaffViewer = auth.isStaff && !isOwner;

  const run = async (action: () => Promise<unknown>, title: string) => {
    setError(null);
    try {
      await action();
      toast.push({ tone: 'success', title });
      return true;
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      toast.push({ tone: 'error', title: 'Action failed', description: message });
      return false;
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    const ok = await run(() => mutations.postMessage.mutateAsync(reply), 'Reply sent');
    if (ok) setReply('');
  };

  const sendNote = async () => {
    if (!note.trim()) return;
    const ok = await run(() => mutations.postNote.mutateAsync(note), 'Internal note recorded');
    if (ok) setNote('');
  };

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link to={isStaffViewer ? '/staff' : '/tickets'} className="hover:text-slate-800">
          {isStaffViewer ? 'Work queue' : 'My reports'}
        </Link>
        <span className="mx-1">/</span>
        <span className="font-mono">{ticket.referenceNumber}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-slate-500">{ticket.referenceNumber}</p>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ticket.category.name} · {ticket.department.name}
            {ticket.assignedTo
              ? ` · handled by ${ticket.assignedTo.fullName}`
              : ' · awaiting an officer'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} label={ticket.statusLabel} />
          <PriorityBadge priority={ticket.priority} />
          {ticket.firstResponseOverdue || ticket.resolutionOverdue ? (
            <Badge tone="danger">Overdue</Badge>
          ) : null}
          {ticket.escalationLevel > 0 ? (
            <Badge tone="warning">Escalation level {ticket.escalationLevel}</Badge>
          ) : null}
        </div>
      </header>

      {ticket.status === 'AWAITING_STUDENT' ? (
        <Callout tone="warning" title="The department is waiting for your response">
          Open the conversation below and reply with the information they requested.
        </Callout>
      ) : null}

      {ticket.resolutionSummary ? (
        <Callout tone="success" title="Resolution summary">
          {ticket.resolutionSummary}
        </Callout>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Reported issue" />
            <CardBody className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {ticket.description}
              </p>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Detail label="Submitted by" value={ticket.student.fullName} />
                <Detail label="Student ID" value={ticket.student.studentId ?? 'Not recorded'} />
                <Detail label="Submitted" value={formatDateTime(ticket.createdAt)} />
                <Detail label="Last updated" value={relativeTime(ticket.updatedAt)} />
                {ticket.courseCode ? (
                  <Detail label="Course code" value={ticket.courseCode} />
                ) : null}
                {ticket.courseTitle ? (
                  <Detail label="Course title" value={ticket.courseTitle} />
                ) : null}
                {ticket.semester ? <Detail label="Semester" value={ticket.semester} /> : null}
                {ticket.assessmentReference ? (
                  <Detail label="Examination reference" value={ticket.assessmentReference} />
                ) : null}
                {ticket.transactionReference ? (
                  <Detail label="Transaction reference" value={ticket.transactionReference} />
                ) : null}
                {ticket.preferredContactMethod ? (
                  <Detail label="Preferred contact" value={ticket.preferredContactMethod} />
                ) : null}
                {isStaffViewer ? (
                  <Detail label="Student email" value={ticket.student.email} />
                ) : null}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Conversation"
              description={
                isStaffViewer
                  ? 'Public replies are visible to the student. Internal notes are not.'
                  : 'Messages between you and the department.'
              }
            />
            <CardBody className="space-y-4">
              {ticket.messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : (
                ticket.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    body={message.body}
                    author={message.sender.fullName}
                    at={message.createdAt}
                    own={message.sender.id === auth.user?.id}
                    internal={message.visibility === 'INTERNAL'}
                  />
                ))
              )}

              {!INACTIVE_STATUSES.includes(ticket.status) ? (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <Textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder={
                      isStaffViewer ? 'Reply to the student…' : 'Write a reply to the department…'
                    }
                    rows={3}
                    aria-label="Reply"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void sendReply()}
                      loading={mutations.postMessage.isPending}
                      disabled={!reply.trim()}
                    >
                      Send reply
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
                  This report is {STATUS_LABELS[ticket.status].toLowerCase()} and no longer accepts
                  new messages.
                </p>
              )}
            </CardBody>
          </Card>

          <AttachmentsCard ticket={ticket} canUpload={!INACTIVE_STATUSES.includes(ticket.status)} />
        </div>

        <div className="space-y-5">
          {isStaffViewer ? (
            <StaffPanel
              ticket={ticket}
              officers={(officers.data?.items ?? []).map((officer) => ({
                id: officer.id,
                fullName: officer.fullName,
              }))}
              note={note}
              onNoteChange={setNote}
              onSubmitNote={() => void sendNote()}
              notePending={mutations.postNote.isPending}
              onAcknowledge={() =>
                void run(() => mutations.acknowledge.mutateAsync(), 'Report acknowledged')
              }
              acknowledgePending={mutations.acknowledge.isPending}
              onStatus={(status) =>
                void run(() => mutations.changeStatus.mutateAsync({ status }), 'Status updated')
              }
              onAssign={(assignedToId) =>
                void run(() => mutations.assign.mutateAsync({ assignedToId }), 'Assignment updated')
              }
              onResolve={(resolutionSummary) =>
                void run(() => mutations.resolve.mutateAsync(resolutionSummary), 'Report resolved')
              }
            />
          ) : null}

          {isOwner ? <StudentPanel ticket={ticket} run={run} /> : null}

          <Card>
            <CardHeader title="Status history" />
            <CardBody>
              <ol className="space-y-4">
                {ticket.history.map((entry) => (
                  <li key={entry.id} className="relative border-l border-slate-200 pl-4">
                    <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                    <p className="text-sm font-medium text-slate-800">
                      {historyLabel(entry.actionType)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.actor?.fullName ?? 'System'} · {formatDateTime(entry.createdAt)}
                    </p>
                    {entry.reason ? (
                      <p className="mt-1 text-xs text-slate-600">{entry.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Service targets" />
            <CardBody className="space-y-2 text-sm">
              <Detail
                label="First response due"
                value={formatDateTime(ticket.firstResponseDueAt)}
              />
              <Detail label="Resolution due" value={formatDateTime(ticket.resolutionDueAt)} />
              <Detail
                label="First response"
                value={
                  ticket.firstResponseOverdue
                    ? 'Overdue'
                    : ticket.firstResponseAt
                      ? formatDateTime(ticket.firstResponseAt)
                      : 'Not yet answered'
                }
              />
              <Detail
                label="Resolution"
                value={
                  ticket.resolutionOverdue
                    ? 'Overdue'
                    : ticket.resolvedAt
                      ? formatDateTime(ticket.resolvedAt)
                      : 'Open'
                }
              />
              <Detail label="Reminders sent" value={String(ticket.remindersSentInCycle)} />
              <Detail
                label="Reopened"
                value={ticket.reopenedCount > 0 ? `${ticket.reopenedCount} time(s)` : 'No'}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Staff panel                                                                */
/* -------------------------------------------------------------------------- */

function StaffPanel({
  ticket,
  officers,
  note,
  onNoteChange,
  onSubmitNote,
  notePending,
  onAcknowledge,
  acknowledgePending,
  onStatus,
  onAssign,
  onResolve,
}: {
  ticket: TicketDetail;
  officers: Array<{ id: string; fullName: string }>;
  note: string;
  onNoteChange: (value: string) => void;
  onSubmitNote: () => void;
  notePending: boolean;
  onAcknowledge: () => void;
  acknowledgePending: boolean;
  onStatus: (status: TicketStatus) => void;
  onAssign: (assignedToId: string | null) => void;
  onResolve: (summary: string) => void;
}) {
  const [resolution, setResolution] = useState('');
  const allowedNext = STATUS_TRANSITIONS[ticket.status] ?? [];
  const closed = INACTIVE_STATUSES.includes(ticket.status);

  return (
    <Card>
      <CardHeader title="Staff actions" description="Actions are recorded in the audit trail." />
      <CardBody className="space-y-4">
        <Button
          variant="secondary"
          className="w-full"
          onClick={onAcknowledge}
          loading={acknowledgePending}
          disabled={closed || ['ACKNOWLEDGED', 'RESOLVED', 'CLOSED'].includes(ticket.status)}
        >
          Acknowledge receipt
        </Button>

        <FormField label="Assign officer" htmlFor="assignee">
          <Select
            id="assignee"
            value={ticket.assignedTo?.id ?? ''}
            onChange={(event) => onAssign(event.target.value || null)}
            disabled={closed}
          >
            <option value="">Unassigned — return to the department queue</option>
            {officers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.fullName}
              </option>
            ))}
          </Select>
        </FormField>

        {allowedNext.length > 0 ? (
          <FormField label="Change status" htmlFor="status">
            <Select
              id="status"
              value=""
              onChange={(event) => {
                if (event.target.value) onStatus(event.target.value as TicketStatus);
              }}
              disabled={closed}
            >
              <option value="">Select a status…</option>
              {allowedNext.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}

        {!closed ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="resolution" className="block text-sm font-medium text-slate-700">
                Resolution summary
              </label>
              <Textarea
                id="resolution"
                rows={3}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="What was done and what the student should expect."
              />
            </div>
            <Button
              className="w-full"
              disabled={resolution.trim().length < 10}
              onClick={() => onResolve(resolution)}
            >
              Mark as resolved
            </Button>
          </>
        ) : null}

        {!closed ? (
          <div className="space-y-1.5 border-t border-slate-100 pt-4">
            <label htmlFor="note" className="block text-sm font-medium text-slate-700">
              Internal note
            </label>
            <Textarea
              id="note"
              rows={3}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Visible to staff only."
            />
            <Button
              variant="subtle"
              className="w-full"
              disabled={!note.trim()}
              loading={notePending}
              onClick={onSubmitNote}
            >
              Save internal note
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Student panel                                                              */
/* -------------------------------------------------------------------------- */

function StudentPanel({
  ticket,
  run,
}: {
  ticket: TicketDetail;
  run: (action: () => Promise<unknown>, title: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const mutations = useTicketMutations(ticket.id);

  return (
    <Card>
      <CardHeader title="Available actions" />
      <CardBody className="space-y-4">
        {ticket.status === 'RESOLVED' ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="reopen-reason" className="block text-sm font-medium text-slate-700">
                Why is the issue still unresolved?
              </label>
              <Textarea
                id="reopen-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={reason.trim().length < 5}
              onClick={() =>
                void run(() => mutations.reopen.mutateAsync(reason), 'Report reopened')
              }
            >
              Reopen this report
            </Button>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-800">Rate the support you received</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-pressed={rating === value}
                    aria-label={`Rate ${value} out of 5`}
                    className={`h-9 w-9 rounded-md text-sm font-semibold ${
                      rating === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Optional comment"
                rows={2}
                aria-label="Feedback comment"
              />
              <Button
                variant="secondary"
                className="w-full"
                disabled={ticket.feedback !== null}
                onClick={() =>
                  void run(
                    () => mutations.feedback.mutateAsync({ rating, comment }),
                    'Thank you for your feedback',
                  )
                }
              >
                {ticket.feedback ? 'Feedback recorded' : 'Submit feedback'}
              </Button>
            </div>
          </>
        ) : null}

        {['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'AWAITING_EXTERNAL'].includes(
          ticket.status,
        ) ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="escalate-reason" className="block text-sm font-medium text-slate-700">
                Why should this be escalated?
              </label>
              <Textarea
                id="escalate-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={reason.trim().length < 5}
              onClick={() =>
                void run(() => mutations.escalate.mutateAsync(reason), 'Escalation requested')
              }
            >
              Escalate this report
            </Button>
          </>
        ) : null}

        {['SUBMITTED', 'AWAITING_ASSIGNMENT'].includes(ticket.status) ? (
          <Button
            variant="danger"
            className="w-full"
            onClick={() =>
              void run(
                () => mutations.withdraw.mutateAsync('Withdrawn by the student'),
                'Report withdrawn',
              )
            }
          >
            Withdraw this report
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Attachments                                                                */
/* -------------------------------------------------------------------------- */

function AttachmentsCard({ ticket, canUpload }: { ticket: TicketDetail; canUpload: boolean }) {
  const toast = useToast();
  const mutations = useTicketMutations(ticket.id);
  const [file, setFile] = useState<File | null>(null);

  const upload = async () => {
    if (!file) return;
    try {
      await mutations.uploadAttachment.mutateAsync(file);
      setFile(null);
      toast.push({ tone: 'success', title: 'Document attached' });
    } catch (caught) {
      toast.push({ tone: 'error', title: 'Upload failed', description: errorMessage(caught) });
    }
  };

  return (
    <Card>
      <CardHeader
        title="Supporting documents"
        description="Screenshots, receipts and other evidence."
      />
      <CardBody className="space-y-3">
        {ticket.attachments.length === 0 ? (
          <p className="text-sm text-slate-500">No documents attached.</p>
        ) : (
          ticket.attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate-800">
                  {attachment.originalFilename}
                </span>
                <span className="text-xs text-slate-500">
                  {formatBytes(attachment.fileSize)} · {formatDateTime(attachment.createdAt)}
                </span>
              </span>
              <a
                href={`/api/v1/tickets/${ticket.id}/attachments/${attachment.id}/download`}
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                Download
              </a>
            </div>
          ))
        )}

        {canUpload ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <FormField label="Add a document" htmlFor="attachment">
              <input
                id="attachment"
                type="file"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </FormField>
            <Button
              variant="secondary"
              disabled={!file}
              loading={mutations.uploadAttachment.isPending}
              onClick={() => void upload()}
            >
              Upload
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Presentational helpers                                                     */
/* -------------------------------------------------------------------------- */

export function MessageBubble({
  body,
  author,
  at,
  own,
  internal,
}: {
  body: string;
  author: string;
  at: string;
  own: boolean;
  internal: boolean;
}) {
  return (
    <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
          internal
            ? 'border border-amber-200 bg-amber-50 text-amber-900'
            : own
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-800'
        }`}
      >
        {internal ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide">
            Internal note — staff only
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{body}</p>
        <p
          className={`mt-1 text-[11px] ${own && !internal ? 'text-indigo-100' : 'text-slate-500'}`}
        >
          {author} · {formatDateTime(at)}
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

export function historyLabel(actionType: string): string {
  const labels: Record<string, string> = {
    CREATED: 'Report submitted',
    STATUS_CHANGED: 'Status changed',
    ASSIGNED: 'Officer assigned',
    REASSIGNED: 'Reassigned',
    PRIORITY_CHANGED: 'Priority changed',
    ESCALATED: 'Escalated',
    RESOLVED: 'Marked as resolved',
    REOPENED: 'Reopened',
    CLOSED: 'Closed',
    WITHDRAWN: 'Withdrawn',
    MESSAGE_ADDED: 'Message sent',
    NOTE_ADDED: 'Internal note added',
    ATTACHMENT_ADDED: 'Document attached',
    FEEDBACK_ADDED: 'Feedback recorded',
    INFORMATION_REQUESTED: 'More information requested',
    REMINDER_SENT: 'Reminder activity',
    SLA_BREACHED: 'Service target breached',
    TRANSFERRED: 'Transferred',
  };
  return labels[actionType] ?? actionType.replace(/_/g, ' ').toLowerCase();
}

export const ALL_TICKET_STATUSES = TICKET_STATUSES;

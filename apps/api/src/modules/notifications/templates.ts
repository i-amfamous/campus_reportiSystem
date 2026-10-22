import { STATUS_LABELS, type NotificationType, type TicketStatus } from '@campus-resolve/shared';

export interface TemplateTicket {
  referenceNumber: string;
  subject: string;
  status: TicketStatus;
  categoryName?: string | undefined;
  departmentName?: string | undefined;
  submittedAt?: Date | undefined;
  lastActionAt?: Date | undefined;
  nextAction?: string | undefined;
  assignedOfficerName?: string | undefined;
}

export interface TemplateContext {
  appUrl: string;
  institutionName: string;
  recipientName: string;
  ticket?: TemplateTicket | undefined;
  actorName?: string | undefined;
  messageBody?: string | undefined;
  token?: string | undefined;
  actionUrl?: string | undefined;
  actionLabel?: string | undefined;
  note?: string | undefined;
  dueAt?: Date | undefined;
  escalationLevel?: number | undefined;
  detail?: string | undefined;
  /** Sign-in details, used when an administrator sets the initial password. */
  accountEmail?: string | undefined;
  accountPassword?: string | undefined;
  roleLabel?: string | undefined;
  passwordReset?: boolean | undefined;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: Date | undefined): string {
  if (!value) return '—';
  return value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function truncate(value: string, length = 600): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
}

export function ticketLink(appUrl: string, referenceNumber: string, path = '/tickets'): string {
  return `${appUrl}${path}?reference=${encodeURIComponent(referenceNumber)}`;
}

/**
 * Centralised subject lines. Keeping them in one place guarantees the reminder
 * format required by PRD §9.4.
 */
const SUBJECTS: Record<NotificationType, (ctx: TemplateContext) => string> = {
  EMAIL_VERIFICATION: () => 'Verify your Campus Resolve email address',
  REGISTRATION_CONFIRMED: (ctx) => `Welcome to Campus Resolve, ${ctx.recipientName}`,
  PASSWORD_RESET: () => 'Reset your Campus Resolve password',
  STAFF_INVITATION: () => 'Campus Resolve staff invitation',
  ACCOUNT_CREDENTIALS: () => 'Your Campus Resolve sign-in details',
  ACCOUNT_SUSPENDED: () => 'Your Campus Resolve account has been suspended',

  TICKET_SUBMITTED: (ctx) => `Report received: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  TICKET_ACKNOWLEDGED: (ctx) =>
    `${ctx.ticket?.referenceNumber ?? 'Your report'} has been acknowledged`,
  TICKET_ASSIGNED: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been assigned`,
  TICKET_REASSIGNED: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been reassigned`,
  TICKET_STATUS_CHANGED: (ctx) => `Update on ${ctx.ticket?.referenceNumber ?? 'your report'}`,
  TICKET_INFO_REQUESTED: (ctx) =>
    `More information needed for ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  TICKET_REPLY: (ctx) => `New reply on ${ctx.ticket?.referenceNumber ?? 'your report'}`,
  TICKET_ESCALATED: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been escalated`,
  TICKET_RESOLVED: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been resolved`,
  TICKET_REOPENED: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been reopened`,
  TICKET_CLOSED: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been closed`,
  TICKET_WITHDRAWN: (ctx) => `${ctx.ticket?.referenceNumber ?? 'Your report'} has been withdrawn`,
  FEEDBACK_REQUESTED: (ctx) =>
    `Please rate the support you received for ${ctx.ticket?.referenceNumber ?? ''}`.trim(),

  STAFF_TICKET_ASSIGNED: (ctx) =>
    `New ticket assigned to you: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_TICKET_REASSIGNED: (ctx) =>
    `Ticket reassigned to you: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_TICKET_REPLIED: (ctx) => `Student replied on ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_TICKET_ESCALATED: (ctx) => `Escalated: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_TICKET_QUEUED: (ctx) =>
    `Ticket routed to your department queue: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_REMINDER_DUE: (ctx) =>
    `Action required: Untouched student ticket ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_SLA_WARNING: (ctx) =>
    `Service target approaching: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  STAFF_SLA_BREACHED: (ctx) =>
    `Service target breached: ${ctx.ticket?.referenceNumber ?? ''}`.trim(),
  SYSTEM_ADMIN_ALERT: (ctx) => `Campus Resolve alert: ${ctx.detail ?? 'system notification'}`,
};

function layout(ctx: TemplateContext, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <tr><td>
      <p style="margin:0 0 4px;font-size:13px;color:#475569;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(ctx.institutionName)} · Campus Resolve</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(ctx.actionLabel ?? 'Notification')}</h1>
      ${bodyHtml}
      ${buttonHtml(ctx)}
      <p style="margin:28px 0 0;font-size:12px;color:#64748b">This is an automated message from Campus Resolve. Please do not reply to this email.</p>
    </td></tr>
  </table>
</body></html>`;
}

function ticketSummaryHtml(ctx: TemplateContext): string {
  if (!ctx.ticket) return '';
  const rows: Array<[string, string]> = [
    ['Ticket', ctx.ticket.referenceNumber],
    ['Category', ctx.ticket.categoryName ?? '—'],
    ['Department', ctx.ticket.departmentName ?? '—'],
    ['Submitted', formatDate(ctx.ticket.submittedAt)],
    ['Current status', STATUS_LABELS[ctx.ticket.status]],
  ];
  if (ctx.ticket.assignedOfficerName)
    rows.push(['Assigned officer', ctx.ticket.assignedOfficerName]);
  if (ctx.ticket.nextAction) rows.push(['Next action', ctx.ticket.nextAction]);
  if (ctx.dueAt) rows.push(['Due', formatDate(ctx.dueAt)]);

  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
           <td style="padding:6px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`,
      )
      .join('')}
  </table>`;
}

function ticketSummaryText(ctx: TemplateContext): string {
  if (!ctx.ticket) return '';
  const lines = [
    `- Ticket: ${ctx.ticket.referenceNumber}`,
    ctx.ticket.categoryName ? `- Category: ${ctx.ticket.categoryName}` : undefined,
    ctx.ticket.departmentName ? `- Department: ${ctx.ticket.departmentName}` : undefined,
    `- Submitted: ${formatDate(ctx.ticket.submittedAt)}`,
    `- Current status: ${STATUS_LABELS[ctx.ticket.status]}`,
    ctx.ticket.assignedOfficerName
      ? `- Assigned officer: ${ctx.ticket.assignedOfficerName}`
      : undefined,
    ctx.ticket.nextAction ? `- Next action: ${ctx.ticket.nextAction}` : undefined,
    ctx.dueAt ? `- Due: ${formatDate(ctx.dueAt)}` : undefined,
  ].filter(Boolean);
  return lines.join('\n');
}

function buttonHtml(ctx: TemplateContext): string {
  if (!ctx.actionUrl) return '';
  return `<p style="margin:22px 0 0"><a href="${escapeHtml(ctx.actionUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(ctx.actionLabel ?? 'Open Campus Resolve')}</a></p>
  <p style="margin:10px 0 0;font-size:12px;color:#64748b">Or paste this link into your browser: ${escapeHtml(ctx.actionUrl)}</p>`;
}

function buttonText(ctx: TemplateContext): string {
  if (!ctx.actionUrl) return '';
  return `\n${ctx.actionLabel ?? 'Open Campus Resolve'}: ${ctx.actionUrl}\n`;
}

/**
 * Renders an email for a notification type. Staff emails intentionally omit
 * student identity and message content (PRD §9.4, §19).
 */
export function renderEmail(type: NotificationType, ctx: TemplateContext): RenderedEmail {
  const subject = SUBJECTS[type](ctx);
  const textParts: string[] = [];
  const htmlParts: string[] = [];

  switch (type) {
    case 'EMAIL_VERIFICATION': {
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'Confirm your email address to activate your Campus Resolve account.',
        '',
        `Your verification code is: ${ctx.token ?? ''}`,
        '',
        'The code expires in 10 minutes. If you did not request an account, ignore this message.',
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>Confirm your email address to activate your Campus Resolve account.</p>
         <p style="font-size:16px;font-weight:600;letter-spacing:2px;background:#f1f5f9;padding:12px;border-radius:8px;text-align:center">${escapeHtml(ctx.token ?? '')}</p>
         <p style="font-size:12px;color:#64748b">This code expires in 10 minutes.</p>`,
      );
      return {
        subject,
        text: textParts.join('\n'),
        html: layout(ctx, htmlParts.join('')),
      };
    }

    case 'PASSWORD_RESET': {
      const link = `${ctx.appUrl}/reset-password?token=${encodeURIComponent(ctx.token ?? '')}`;
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'A password reset was requested for your Campus Resolve account.',
        '',
        `Reset link: ${link}`,
        '',
        'The link expires in 60 minutes. If you did not request this, no action is required.',
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>A password reset was requested for your Campus Resolve account.</p>
         <p style="font-size:12px;color:#64748b">This link expires in 60 minutes.</p>`,
      );
      return {
        subject,
        text: textParts.join('\n'),
        html: layout(
          { ...ctx, actionUrl: link, actionLabel: 'Reset my password' },
          htmlParts.join(''),
        ),
      };
    }

    case 'STAFF_INVITATION': {
      const link = `${ctx.appUrl}/staff-invitation?token=${encodeURIComponent(ctx.token ?? '')}`;
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'You have been invited to join Campus Resolve as a staff member.',
        '',
        `Accept the invitation: ${link}`,
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>You have been invited to join Campus Resolve as a staff member.</p>`,
      );
      return {
        subject,
        text: textParts.join('\n'),
        html: layout(
          { ...ctx, actionUrl: link, actionLabel: 'Accept your invitation' },
          htmlParts.join(''),
        ),
      };
    }

    case 'ACCOUNT_CREDENTIALS': {
      const signIn = `${ctx.appUrl}/login`;
      const credentials = [
        ['Email address', ctx.accountEmail ?? ''],
        ['Password', ctx.accountPassword ?? ''],
        ['Role', ctx.roleLabel ?? ''],
      ];
      const intro = ctx.passwordReset
        ? 'An administrator has reset the password for your Campus Resolve account. These are your updated sign-in details.'
        : 'An account has been set up for you on Campus Resolve. These are your sign-in details.';
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        intro,
        '',
        ...credentials.map(([label, value]) => `- ${label}: ${value}`),
        '',
        `Sign in: ${signIn}`,
        '',
        'Sign in and change the password from your profile as soon as you can.',
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${escapeHtml(intro)}</p>
         <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
           ${credentials
             .map(
                 (row) => {
                   const label = String(row[0] ?? '');
                   const value = row[1] == null ? '' : String(row[1]);
                   return `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
                  <td style="padding:6px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`;
                 },
             )
             .join('')}
         </table>
         <p style="font-size:12px;color:#64748b">Sign in and change the password from your profile as soon as you can.</p>`,
      );
      return {
        subject,
        text: textParts.join('\n'),
        html: layout(
          { ...ctx, actionUrl: signIn, actionLabel: 'Sign in to Campus Resolve' },
          htmlParts.join(''),
        ),
      };
    }

    case 'REGISTRATION_CONFIRMED':
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'Your Campus Resolve account is ready. You can now report academic and administrative issues online.',
        '',
        'No report should disappear into an office, remain unaccounted for, or be marked resolved without a recorded action.',
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>Your Campus Resolve account is ready. You can now report academic and administrative issues online and follow every update.</p>`,
      );
      break;

    case 'ACCOUNT_SUSPENDED':
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'Your Campus Resolve account has been suspended.',
        ctx.note ? `Reason: ${ctx.note}` : '',
        '',
        'Contact the platform administrator if you believe this is a mistake.',
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>Your Campus Resolve account has been suspended.</p>
         ${ctx.note ? `<p>Reason: ${escapeHtml(ctx.note)}</p>` : ''}
         <p>Contact the platform administrator if you believe this is a mistake.</p>`,
      );
      break;

    case 'STAFF_REMINDER_DUE': {
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'A student report assigned to you has not received a meaningful update.',
        '',
        ticketSummaryText(ctx),
        '',
        'Please review the report and acknowledge it, begin the investigation, or record the appropriate next action.',
        buttonText(ctx),
        '',
        'This is an automated reminder from Campus Resolve.',
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>A student report assigned to you has not received a meaningful update.</p>
         ${ticketSummaryHtml(ctx)}
         <p>Please review the report and acknowledge it, begin the investigation, or record the appropriate next action.</p>`,
      );
      break;
    }

    case 'STAFF_TICKET_ASSIGNED':
    case 'STAFF_TICKET_REASSIGNED':
    case 'STAFF_TICKET_QUEUED':
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        type === 'STAFF_TICKET_REASSIGNED'
          ? 'A ticket has been reassigned to you.'
          : type === 'STAFF_TICKET_QUEUED'
            ? 'A ticket has been routed to your department queue.'
            : 'A ticket has been assigned to you.',
        '',
        ticketSummaryText(ctx),
        buttonText(ctx),
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${
           type === 'STAFF_TICKET_REASSIGNED'
             ? 'A ticket has been reassigned to you.'
             : type === 'STAFF_TICKET_QUEUED'
               ? 'A ticket has been routed to your department queue.'
               : 'A ticket has been assigned to you.'
         }</p>
         ${ticketSummaryHtml(ctx)}`,
      );
      break;

    case 'STAFF_TICKET_REPLIED':
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        'The student has replied on a ticket assigned to you.',
        '',
        ticketSummaryText(ctx),
        buttonText(ctx),
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>The student has replied on a ticket assigned to you.</p>
         ${ticketSummaryHtml(ctx)}`,
      );
      break;

    case 'STAFF_TICKET_ESCALATED':
    case 'STAFF_SLA_BREACHED':
    case 'STAFF_SLA_WARNING':
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        type === 'STAFF_SLA_WARNING'
          ? 'A ticket is approaching its service target.'
          : 'A ticket assigned to your department has been escalated.',
        '',
        ticketSummaryText(ctx),
        ctx.escalationLevel ? `- Escalation level: ${ctx.escalationLevel}` : '',
        buttonText(ctx),
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${
           type === 'STAFF_SLA_WARNING'
             ? 'A ticket is approaching its service target.'
             : 'A ticket assigned to your department has been escalated.'
         }</p>
         ${ticketSummaryHtml(ctx)}`,
      );
      break;

    case 'SYSTEM_ADMIN_ALERT':
      textParts.push(
        `Hello ${ctx.recipientName},`,
        '',
        ctx.detail ?? 'System notification',
        ctx.ticket ? `\n${ticketSummaryText(ctx)}` : '',
        buttonText(ctx),
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${escapeHtml(ctx.detail ?? 'System notification')}</p>
         ${ctx.ticket ? ticketSummaryHtml(ctx) : ''}`,
      );
      break;

    default: {
      // Student-facing ticket events.
      const greeting = `Hello ${ctx.recipientName},`;
      const intro: Record<string, string> = {
        TICKET_SUBMITTED:
          'We have received your report. A reference number has been issued and the relevant department has been notified.',
        TICKET_ACKNOWLEDGED:
          'A department officer has acknowledged your report and will begin working on it.',
        TICKET_ASSIGNED: 'Your report has been assigned to a responsible officer.',
        TICKET_REASSIGNED:
          'Your report has been reassigned to another officer. The full history is preserved.',
        TICKET_STATUS_CHANGED: 'The status of your report has changed.',
        TICKET_INFO_REQUESTED: 'The officer handling your report needs more information from you.',
        TICKET_REPLY: 'There is a new reply on your report.',
        TICKET_ESCALATED: 'Your report has been escalated to a higher authority.',
        TICKET_RESOLVED:
          'Your report has been marked as resolved. Please confirm if the issue is genuinely resolved.',
        TICKET_REOPENED: 'Your report has been reopened and assigned a new action deadline.',
        TICKET_CLOSED: 'Your report has been closed.',
        TICKET_WITHDRAWN: 'Your report has been withdrawn.',
        FEEDBACK_REQUESTED: 'Please rate the support you received so we can improve the service.',
      };
      const conclusion: Record<string, string> = {
        TICKET_RESOLVED:
          'If the issue is still unresolved you can reopen the report or escalate it using the controls on the ticket page.',
        TICKET_INFO_REQUESTED:
          'Please respond on the ticket page so the investigation can continue.',
        FEEDBACK_REQUESTED:
          'Your feedback is anonymous to the department and helps improve the service.',
      };

      textParts.push(greeting, '', intro[type] ?? 'There is an update on your report.', '');
      if (ctx.ticket) textParts.push(ticketSummaryText(ctx), '');
      if (ctx.messageBody) {
        textParts.push('Message:', truncate(ctx.messageBody), '');
      }
      if (ctx.note) textParts.push(`Note: ${ctx.note}`, '');
      if (conclusion[type]) textParts.push(conclusion[type], '');
      textParts.push(buttonText(ctx));

      htmlParts.push(
        `<p>${escapeHtml(greeting)}</p>
         <p>${escapeHtml(intro[type] ?? 'There is an update on your report.')}</p>
         ${ctx.ticket ? ticketSummaryHtml(ctx) : ''}
         ${ctx.messageBody ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;color:#334155">${escapeHtml(truncate(ctx.messageBody))}</blockquote>` : ''}
         ${ctx.note ? `<p>${escapeHtml(ctx.note)}</p>` : ''}
         ${conclusion[type] ? `<p>${escapeHtml(conclusion[type])}</p>` : ''}`,
      );
      break;
    }
  }

  return {
    subject,
    text: textParts.filter((part) => part !== undefined).join('\n'),
    html: layout(ctx, htmlParts.join('\n')),
  };
}

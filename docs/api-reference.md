# Campus Resolve — API reference

Base URL: `http://localhost:4000/api/v1`

All request and response bodies are JSON unless stated otherwise. Every endpoint
below is implemented in `apps/api/src/routes/`.

---

## 1. Conventions

### 1.1 Authentication

Sessions are server-side. After `POST /auth/login` the API sets two cookies:

| Cookie           | Flags                                              | Purpose                   |
| ---------------- | -------------------------------------------------- | ------------------------- |
| `campus_session` | `HttpOnly`, `SameSite=Lax`, `Secure` in production | Opaque session identifier |
| `campus_csrf`    | readable by JavaScript, `SameSite=Lax`             | Double-submit CSRF token  |

Every state-changing request (`POST`, `PATCH`, `PUT`, `DELETE`) must echo the
CSRF token in the `X-CSRF-Token` header, otherwise the API answers
`403 CSRF_FAILED`. `GET` requests never require it. The token is only checked
for requests that carry a session cookie, so unauthenticated calls fail with
the authentication error instead.

### 1.2 Error envelope

Every non-2xx response uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid.",
    "details": { "subject": ["Subject must be at least 6 characters"] },
    "requestId": "5f1c0a5e-2c9d-4d4b-9b2f-1f2b3c4d5e6f"
  }
}
```

| Status | Code                     | Meaning                                                                                      |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | The request body is malformed in a way the schema cannot describe.                           |
| 403    | `FORBIDDEN`              | Authenticated, but not allowed to perform this action on this resource.                      |
| 403    | `CSRF_FAILED`            | The double-submit token is missing or does not match the session.                            |
| 403    | `EMAIL_NOT_VERIFIED`     | The account must verify its institutional email address first.                               |
| 403    | `ACCOUNT_SUSPENDED`      | The account is suspended; an administrator must reinstate it.                                |
| 404    | `NOT_FOUND`              | The resource does not exist, or the caller may not know that it exists.                      |
| 409    | `CONFLICT`               | The request contradicts the current state (for example feedback on an already-rated ticket). |
| 409    | `INVALID_TRANSITION`     | The requested status change is not allowed from the current status.                          |
| 413    | `PAYLOAD_TOO_LARGE`      | The uploaded file exceeds `STORAGE_MAX_FILE_SIZE_MB`.                                        |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | The uploaded file type is not accepted.                                                      |
| 422    | `VALIDATION_ERROR`       | The body or query failed schema validation. `details` maps a field to its messages.          |
| 423    | `ACCOUNT_LOCKED`         | Too many failed sign-ins; the account is temporarily locked.                                 |
| 429    | `RATE_LIMITED`           | Too many requests from this client. `Retry-After` is set.                                    |
| 500    | `INTERNAL_ERROR`         | Unexpected server failure. The request id is included in the log.                            |

### 1.3 Pagination

List endpoints accept `page` (default `1`) and `pageSize` (default `20`, max
`100`) and answer with:

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0, "totalPages": 1 }
```

### 1.4 Ticket statuses

`SUBMITTED`, `AWAITING_ASSIGNMENT`, `ASSIGNED`, `ACKNOWLEDGED`, `IN_PROGRESS`,
`AWAITING_STUDENT`, `AWAITING_EXTERNAL`, `ESCALATED`, `RESOLVED`, `CLOSED`,
`REOPENED`, `WITHDRAWN`.

The authoritative transition table lives in
`packages/shared/src/tickets.ts` (`STATUS_TRANSITIONS`). Any transition that is
not listed there is rejected with `INVALID_TRANSITION`.

---

## 2. Health

| Method | Path       | Auth | Description                                                      |
| ------ | ---------- | ---- | ---------------------------------------------------------------- |
| `GET`  | `/healthz` | none | Liveness probe. Always `200` while the process is up.            |
| `GET`  | `/readyz`  | none | Readiness probe. `200` when PostgreSQL answers, `503` otherwise. |

Both live outside the `/api/v1` prefix.

---

## 3. Authentication — `/api/v1/auth`

### 3.1 `POST /auth/register`

Creates a student account. Requires an institutional email address. The
response never contains a privileged role — a registration can only ever
create a student.

| Field         | Type   | Required | Notes                                                                       |
| ------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `fullName`    | string | yes      | 2–120 characters.                                                           |
| `email`       | string | yes      | Must match one of `INSTITUTION_EMAIL_DOMAINS`.                              |
| `studentId`   | string | no       | Derived from the numeric email local part when omitted.                     |
| `password`    | string | yes      | ≥ 10 characters with a lower case letter, an upper case letter and a digit. |
| `acceptTerms` | `true` | yes      | Must be literally `true`.                                                   |

`201` → `{ id, email, fullName, studentId, emailVerified: false, message }`.
A verification link is emailed; the account stays `PENDING_VERIFICATION` until
it is used.

### 3.2 `POST /auth/verify-email`

Body `{ token }`. `200` → `{ verified: true, email, fullName }`. The token is
single use and expires after 24 hours.

### 3.3 `POST /auth/resend-verification`

Body `{ email }`. Always answers `200` with a neutral message so that the
endpoint cannot be used to discover which addresses exist. Rate limited to 5
requests per hour per client.

### 3.4 `POST /auth/login`

Body `{ email, password }`. `200` → the signed-in user and the session cookies.
`401` for a wrong password or an unknown address, with the same message in
both cases. Unverified accounts answer `403 EMAIL_NOT_VERIFIED`. Suspended
accounts answer `403 ACCOUNT_SUSPENDED`. Rate limited to 10 attempts per 15
minutes per IP.

### 3.5 `POST /auth/logout`

Requires a session. Revokes the session row and clears both cookies.

### 3.6 `GET /auth/me`

Returns the current session user:

```json
{
  "user": {
    "id": "…",
    "email": "…",
    "fullName": "…",
    "studentId": "10234567",
    "emailVerified": true,
    "accountStatus": "ACTIVE",
    "roles": ["STUDENT"],
    "permissions": ["ticket:create", "…"],
    "departments": [{ "departmentId": "…", "departmentName": "…", "departmentRole": "OFFICER" }],
    "lastLoginAt": "…",
    "createdAt": "…"
  }
}
```

### 3.7 `POST /auth/forgot-password`

Body `{ email }`. Always answers `200` with a neutral message. Rate limited to 5
requests per hour per client.

### 3.8 `POST /auth/reset-password`

Body `{ token, password }`. The token expires after 60 minutes and is single
use. All existing sessions for the account are revoked.

### 3.9 `POST /auth/change-password`

Body `{ currentPassword, newPassword }`. Requires a session.

### 3.10 `POST /auth/accept-invitation`

Body `{ token, password }`. Completes a staff invitation: the token from the
invitation email is exchanged for a password of the invitee's own choosing, the
institutional mailbox is confirmed, and the account becomes `ACTIVE` in one
step. `200` → `{ email, fullName, message }`.

The token is single use and expires after 24 hours. A token that belongs to a
student registration is rejected with `400` — a student may never activate a
staff account this way. The web client for this flow is `/staff-invitation`.

---

## 4. Tickets — `/api/v1/tickets`

### 4.1 `POST /tickets`

Requires a session and a verified email address. Creates a report and routes it
to a department.

| Field                                                                                  | Type    | Required | Notes                                                                        |
| -------------------------------------------------------------------------------------- | ------- | -------- | ---------------------------------------------------------------------------- |
| `categoryId`                                                                           | uuid    | yes      | From `GET /departments/categories`.                                          |
| `departmentId`                                                                         | uuid    | yes      | From `GET /departments`.                                                     |
| `assignedToId`                                                                         | uuid    | no       | Optional nominated officer. Must belong to the department.                   |
| `useTriageQueue`                                                                       | boolean | no       | `true` sends the report to the department queue instead of a single officer. |
| `subject`                                                                              | string  | yes      | 6–180 characters.                                                            |
| `description`                                                                          | string  | yes      | 20–8000 characters.                                                          |
| `priority`                                                                             | enum    | no       | `LOW`, `NORMAL`, `HIGH`, `URGENT`. Defaults to the category default.         |
| `courseCode`, `courseTitle`, `semester`, `assessmentReference`, `transactionReference` | string  | no       | Optional context.                                                            |
| `preferredContactMethod`                                                               | enum    | no       | `EMAIL`, `PHONE`, `IN_PERSON`.                                               |

`201` → `{ id, referenceNumber, status, departmentId, assignedToId, message }`.
The reference number has the form `CR-<year>-<6 digits>`.

If the chosen department has no active officer, the report is routed to the
fallback queue instead of failing.

### 4.2 `GET /tickets`

Lists the caller's own reports. Accepts the filters described in
§4.3, plus `from` and `to` (ISO dates) and `sort` / `order`.

### 4.3 `GET /tickets/:id`

Returns `{ ticket }` with the full detail object: description, course context,
student, category, department, assignee, messages, attachments, history and
feedback.

- A student may only read their own ticket.
- Staff may read a ticket in their own department, any ticket with
  `ticket:read:any`, and a ticket assigned to them.
- Internal notes are removed from the response for the student who filed the
  report. The server, not the client, enforces this.

### 4.4 Filter parameters

| Parameter                                    | Type          | Notes                                                                     |
| -------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| `status`                                     | enum or array | One or more ticket statuses.                                              |
| `priority`                                   | enum or array | One or more priorities.                                                   |
| `categoryId`, `departmentId`, `assignedToId` | uuid          | Exact match.                                                              |
| `search`                                     | string        | Matches the subject, reference number or description, case-insensitively. |
| `overdue`                                    | boolean       | First-response or resolution target exceeded, or escalated.               |
| `unassigned`                                 | boolean       | No officer assigned.                                                      |
| `awaitingStudent`                            | boolean       | The ball is in the student's court.                                       |
| `from`, `to`                                 | ISO date      | Created-at window.                                                        |
| `page`, `pageSize`                           | integer       | Pagination.                                                               |
| `sort`                                       | enum          | `createdAt`, `updatedAt`, `referenceNumber`, `priority`.                  |
| `order`                                      | enum          | `asc`, `desc`.                                                            |

### 4.5 `POST /tickets/:id/messages`

Body `{ body }` (1–8000 characters). A staff reply is public and counts as a
meaningful staff action; the student who filed the report can never create an
internal note through this endpoint. Answers `403` when the ticket is closed.

### 4.6 `POST /tickets/:id/attachments`

`multipart/form-data` with a single `file` field. The file is stored in the
private storage directory; it is never served statically. Answers `201` with
`{ attachment }`.

### 4.7 `GET /tickets/:id/attachments/:attachmentId/download`

Streams the file to an authorised caller. The content type is checked against
the file signature before it is stored, and the download is authorised against
the parent ticket.

### 4.8 `POST /tickets/:id/reopen`

Body `{ reason }` (5–1000 characters). Only the student who filed the report,
or staff with `ticket:reopen:manage`, may reopen a resolved ticket. Reopening
resets the service-target clock and re-enters the reminder cycle.

### 4.9 `POST /tickets/:id/escalate`

Body `{ reason, targetUserId? }`. A student may request escalation; staff with
`ticket:escalate:manage` may escalate directly, optionally naming a target
(officer or department head).

### 4.10 `POST /tickets/:id/withdraw`

Body `{ reason? }`. Only the student who filed the report may withdraw, and
only while no officer has started work on it.

### 4.11 `POST /tickets/:id/feedback`

Body `{ rating, comment? }` with `rating` between 1 and 5. Only the student who
filed the report may rate a resolved ticket, and only once. A second attempt
answers `409`.

---

## 5. Staff queue — `/api/v1/staff`

Every endpoint requires a session with a staff role.

| Method  | Path                             | Permission               | Description                                                                                                                                                                                                         |
| ------- | -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/staff/tickets`                 | any staff role           | The department-scoped work queue. Accepts the same filters as §4.3.                                                                                                                                                 |
| `POST`  | `/staff/tickets/:id/acknowledge` | `ticket:status:update`   | Records the first response and stops the untouched-ticket reminders.                                                                                                                                                |
| `PATCH` | `/staff/tickets/:id/status`      | `ticket:status:update`   | Body `{ status, note? }`. Invalid transitions answer `409 INVALID_TRANSITION`.                                                                                                                                      |
| `PATCH` | `/staff/tickets/:id/assign`      | `ticket:assign`          | Body `{ assignedToId, reason? }`. `assignedToId` may be `null` to return the ticket to the queue. An officer may claim an unassigned ticket for themselves, but never take one that already belongs to a colleague. |
| `POST`  | `/staff/tickets/:id/notes`       | `ticket:note:internal`   | Body `{ body }`. Creates an internal note that is never shown to the student.                                                                                                                                       |
| `POST`  | `/staff/tickets/:id/resolve`     | `ticket:resolve`         | Body `{ resolutionSummary }` (≥ 10 characters). The summary is shown to the student.                                                                                                                                |
| `GET`   | `/staff/queue`                   | `ticket:read:department` | Convenience endpoint returning the caller's first department queue.                                                                                                                                                 |

---

## 6. Departments and reference data — `/api/v1/departments`

| Method | Path                         | Description                                                                                                  |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/departments`               | All active departments with `staffCount`, `categoryCount` and the service target.                            |
| `GET`  | `/departments/categories`    | All active categories with their department and default priority.                                            |
| `GET`  | `/departments/:id/staff`     | The staff of a department, with roles and account status.                                                    |
| `GET`  | `/departments/:id/officers`  | The officers a student may nominate for a new report.                                                        |
| `GET`  | `/departments/:id/tickets`   | The tickets of a department, filtered by the caller's scope.                                                 |
| `GET`  | `/departments/:id/analytics` | Volume, timeliness and satisfaction for a department. Requires `analytics:department` (or global analytics). |
| `GET`  | `/departments/:id/workload`  | Open, overdue and resolved counts per officer.                                                               |

---

## 7. Notifications — `/api/v1/notifications`

`GET /notifications` returns the notifications addressed to the caller:

```json
{
  "items": [
    {
      "id": "…",
      "type": "TICKET_SUBMITTED",
      "status": "SENT",
      "ticketId": "…",
      "createdAt": "…",
      "sentAt": "…"
    }
  ]
}
```

Notification types cover the student lifecycle (`TICKET_SUBMITTED`,
`TICKET_ACKNOWLEDGED`, `TICKET_ASSIGNED`, `TICKET_REASSIGNED`,
`TICKET_STATUS_CHANGED`, `TICKET_INFO_REQUESTED`, `TICKET_REPLY`,
`TICKET_ESCALATED`, `TICKET_RESOLVED`, `TICKET_REOPENED`, `TICKET_CLOSED`,
`TICKET_WITHDRAWN`, `FEEDBACK_REQUESTED`), the staff lifecycle
(`STAFF_TICKET_ASSIGNED`, `STAFF_TICKET_REASSIGNED`, `STAFF_TICKET_QUEUED`,
`STAFF_TICKET_REPLIED`, `STAFF_TICKET_ESCALATED`, `STAFF_REMINDER_DUE`,
`STAFF_SLA_WARNING`, `STAFF_SLA_BREACHED`) and the account lifecycle
(`EMAIL_VERIFICATION`, `REGISTRATION_CONFIRMED`, `PASSWORD_RESET`,
`STAFF_INVITATION`, `ACCOUNT_SUSPENDED`, `SYSTEM_ADMIN_ALERT`).

A notification is only marked `SENT` when the provider confirmed delivery. If
the provider fails, the notification becomes `FAILED`, the attempt is logged,
and the report itself is unaffected.

---

## 8. Administration — `/api/v1/admin`

Every endpoint requires a session and a specific permission.

| Method  | Path                                       | Permission               | Description                                                                                                                               |
| ------- | ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/admin/dashboard`                         | `analytics:global`       | Institution-wide totals, timings and per-department performance.                                                                          |
| `GET`   | `/admin/users`                             | `user:manage`            | Paginated user list. Filters: `search`, `role`, `accountStatus`, `departmentId`.                                                          |
| `POST`  | `/admin/users/invite`                      | `user:role:assign`       | Body `{ email, fullName, role, departmentId?, departmentRole? }`. Emails an invitation that the invitee completes at `/staff-invitation`. |
| `PATCH` | `/admin/users/:id/role`                    | `user:manage:department` | Body `{ role, departmentId?, departmentRole? }`. Granting a staff role replaces the student role.                                         |
| `PATCH` | `/admin/users/:id/status`                  | `user:manage`            | Body `{ accountStatus, reason? }`. Suspending revokes every session.                                                                      |
| `POST`  | `/admin/departments`                       | `department:manage`      | Body `{ name, description?, contactEmail?, … }`.                                                                                          |
| `PATCH` | `/admin/departments/:id`                   | `department:manage`      | Partial update of a department.                                                                                                           |
| `PUT`   | `/admin/departments/:id/service-target`    | `department:manage`      | Body `{ firstResponseMinutes, resolutionMinutes, reminderIntervalMinutes, maxReminders, escalationAfterReminders, businessHoursOnly? }`.  |
| `POST`  | `/admin/categories`                        | `category:manage`        | Body `{ name, departmentId?, defaultPriority?, … }`.                                                                                      |
| `PATCH` | `/admin/categories/:id`                    | `category:manage`        | Partial update of a category.                                                                                                             |
| `GET`   | `/admin/audit-logs`                        | `audit:read`             | Paginated audit trail. Filters: `action`, `entityType`.                                                                                   |
| `GET`   | `/admin/reports`                           | `export:create`          | Query `type` (`tickets`, `analytics`, `notifications`, `audit`), `format` (`csv`, `json`), `from`, `to`, `departmentId`.                  |
| `GET`   | `/admin/settings`                          | `settings:manage`        | The current system settings.                                                                                                              |
| `PATCH` | `/admin/settings`                          | `settings:manage`        | Partial update. Unknown keys are rejected.                                                                                                |
| `GET`   | `/admin/system/health`                     | `job:manage`             | Job queue and notification delivery counters.                                                                                             |
| `POST`  | `/admin/system/retry-failed-notifications` | `job:manage`             | Re-queues up to 200 failed notifications. Returns `{ queued }`.                                                                           |

### 8.1 Role-granting rules

- Only a **super administrator** may grant `SUPER_ADMIN`.
- An **administrator** may grant `ADMIN`, `DEPARTMENT_HEAD` and `OFFICER`.
- A **department head** may only grant `OFFICER` and `DEPARTMENT_HEAD`, and
  only for users inside their own department.
- Nobody may change their own role or their own account status.
- Granting a staff role removes the `STUDENT` role: a person is either a
  student or staff, never both.

### 8.2 Exports

Exports contain ticket metadata only. Student names, email addresses and
message bodies are never included. The `studentId` column is included because
the institution needs it for reporting; the `studentId` is the numeric email
local part, which the student already knows.

---

## 9. Background jobs

The worker runs outside the request path. Jobs live in the `jobs` table and are
claimed with `FOR UPDATE SKIP LOCKED`.

| Type                    | Trigger                                           | Effect                                                         |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `NOTIFICATION_DELIVERY` | A notification is queued                          | Renders and sends the email, records the attempt.              |
| `TICKET_REMINDER`       | A reminder cycle becomes due                      | Sends the staff reminder and schedules the next one.           |
| `SLA_FIRST_RESPONSE`    | The first-response target is reached              | Flags the ticket as overdue and escalates.                     |
| `SLA_RESOLUTION`        | The resolution target is reached                  | Flags the ticket as overdue and escalates.                     |
| `ESCALATION`            | A ticket is escalated                             | Notifies the department head and records the escalation event. |
| `TICKET_AUTO_CLOSE`     | A resolved ticket ages past the auto-close window | Closes the ticket.                                             |

Each job has a `dedupeKey`, so the same logical job is never enqueued twice.
Failures are retried with exponential backoff up to `WORKER_MAX_ATTEMPTS`
before the job is marked `FAILED`.

# Campus Resolve — Technical Architecture & Implementation Plan

**Status:** Authoritative implementation contract for all contributors.
**Source of truth:** `docs/product-requirements.md` (PRD). Where this document and the PRD
differ, the PRD wins and this document must be corrected.

---

## 1. Architectural decisions

| Concern               | Decision                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment shape      | Modular monolith (Express API + React SPA + worker process)                                                                                                        | PRD §16 explicitly prefers this over microservices. Jobs, API and web run as separate OS processes but share one codebase and one database.                                                                                                                                                                                                              |
| Repository            | npm workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`)                                                                                                | PRD §24. npm workspaces are already available in the environment (no extra toolchain install).                                                                                                                                                                                                                                                           |
| Language              | TypeScript everywhere, strict mode                                                                                                                                 | PRD §16. `packages/shared` gives one source of truth for statuses, roles, permissions and validation schemas.                                                                                                                                                                                                                                            |
| Database              | PostgreSQL 16 + Prisma 6                                                                                                                                           | PRD §16/§17.                                                                                                                                                                                                                                                                                                                                             |
| Background processing | **Database-backed job queue** (Postgres) with `FOR UPDATE SKIP LOCKED` + advisory-lock scheduler tick                                                              | PRD §16 permits "a reliable database-backed scheduler" if it "still provide[s] reliable job locking, retries, and idempotency". No Redis is required for the first release, which removes an operational dependency and makes the reminder engine deployable anywhere Postgres runs. Redis can be introduced later behind the same `JobQueue` interface. |
| Auth                  | Server-managed sessions in Postgres, opaque token in `HttpOnly` cookie + double-submit CSRF token                                                                  | PRD §5.3 requires secure cookie settings and CSRF protection when cookies are used. Stateless JWTs cannot be revoked instantly, which the PRD requires ("logout and session revocation").                                                                                                                                                                |
| Password hashing      | `scrypt` (Node `crypto`, N=16384, r=8, p=1, 64-byte key, per-user salt)                                                                                            | OWASP-recommended modern KDF, no native build step, no supply-chain risk.                                                                                                                                                                                                                                                                                |
| Email                 | Provider interface with two adapters: `Resend` (HTTP API) and `Console` (development/staging, records the rendered message in the DB so tests can assert on it)    | PRD §11.3. Credentials are environment-only.                                                                                                                                                                                                                                                                                                             |
| File storage          | Private local filesystem store behind a `StorageProvider` interface, served only through an authorized download route; `S3` adapter documented as the swap-in path | PRD §16/§19. Files are never served from a public directory and never expose a public URL.                                                                                                                                                                                                                                                               |
| Real-time             | None in v1. Notifications are polled by the client.                                                                                                                | Not required by the PRD; avoids a websocket dependency.                                                                                                                                                                                                                                                                                                  |
| Testing               | Vitest (unit + Supertest integration against a real Postgres schema), Playwright (E2E)                                                                             | PRD §16/§22. Tests run against real PostgreSQL, never against mocks of the data layer.                                                                                                                                                                                                                                                                   |

### 1.1 Module boundaries (backend)

```
apps/api/src
├── config/          env parsing (zod), clock, logger, constants
├── lib/             prisma client, errors, pagination, crypto, result types
├── middleware/      authenticate, authorize (permission + resource), validate, errorHandler, rateLimit, csrf
├── modules/
│   ├── auth/        register, verify, login, logout, reset, sessions
│   ├── users/       profile, staff invitations, role assignment
│   ├── tickets/     CRUD, lifecycle state machine, routing, assignment, messages,
│   │                attachments, history, feedback, reopen, escalate
│   ├── departments/ departments, categories, routing helpers, service targets
│   ├── notifications/ templates, provider adapters, delivery, preferences
│   ├── reminders/   eligibility rules, reminder cycle state machine, escalation rules
│   ├── analytics/   dashboard aggregations, exports
│   └── admin/       system settings, audit logs
├── services/        shared domain services (reference numbers, sla, storage)
├── jobs/            queue implementation, worker loop, job handlers
├── routes/          /api/v1 route mounting
├── app.ts           express app factory
└── server.ts        http listener
```

Dependency rule: `routes -> modules -> services -> lib`. Modules never import from `routes`.
`jobs` may import services and modules' pure functions, never express handlers.

---

## 2. Shared contracts (`packages/shared`)

Single source of truth consumed by the API, the web app and the tests:

- `TicketStatus`, `TicketPriority`, `MessageVisibility`, `RoleName`, `PermissionKey`
- `STATUS_LABELS` (student-facing wording), `STATUS_TRANSITIONS` (the state machine)
- `ROLE_PERMISSIONS` matrix
- `isStaffRole`, `isTerminalStatus`, `requiresStaffAction`
- Zod schemas for every request body / query string shared between client and server
- API error codes and response envelope shapes

Any change to a status, role, permission or notification type is made here first and then
propagated. Agents must not define these locally in a module.

---

## 3. Ticket lifecycle (canonical)

```
SUBMITTED -> AWAITING_ASSIGNMENT -> ASSIGNED -> ACKNOWLEDGED -> IN_PROGRESS
                                                 |                |
                                                 v                v
                                        AWAITING_STUDENT   AWAITING_EXTERNAL
                                                 |                |
                                                 +------> IN_PROGRESS <---+
                                                                  |
                                                                  v
                                                               RESOLVED
                                                                  |
                                              +-------------------+----------------+
                                              v                                        v
                                           CLOSED                                  REOPENED
                                                                                        |
                                                                                        v
                                                                               ASSIGNED / IN_PROGRESS
```

Terminal states: `CLOSED`, `WITHDRAWN`. `RESOLVED` may be confirmed (closed) or reopened.

### 3.1 Reminder vs. SLA separation (PRD §9.5, §10)

Two independent engines, both server-side:

1. **Untouched-ticket reminder** (`UNTOUCHED_REMINDER`)
   - Measures the 2-hour interval from the _last meaningful staff action_, not from cron time.
   - Applies to tickets awaiting a first meaningful action after assignment.
   - Stops on acknowledge / meaningful reply / substantive internal note / status `IN_PROGRESS`.
2. **Next-action reminder** (`NEXT_ACTION_REMINDER`)
   - Applies to _active_ tickets (post-acknowledgement) so that acknowledging never removes a
     ticket from overdue-work monitoring. Interval = department service target `reminderIntervalMinutes`.
3. **Service targets** (`SLA_FIRST_RESPONSE`, `SLA_RESOLUTION`) — separate jobs that flag
   overdue and escalate. Never share a timer with the 2-hour reminder.
4. **Escalation** (`ESCALATION`) — separate job triggered by repeated reminders or a breached
   resolution target. Escalation retains the original owner unless it explicitly reassigns.

### 3.2 Meaningful staff action

Resetting the untouched-timer: acknowledge, staff public reply, substantive internal note
(≥ 10 characters), transition to `IN_PROGRESS`, resolution, assignment change, investigation note.
**Does not** reset: viewing a ticket, reading attachments, marking read.

---

## 4. Database plan

Full field-level model: `docs/database.md`. Migration ownership: a single person/agent owns
`apps/api/prisma/migrations`; schema changes are communicated in the shared board before dependent
modules are implemented (PRD §26 coordination rule 6).

Key tables (PRD §17):

`User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Session`,
`Department`, `DepartmentMembership`, `Category`, `Ticket`, `TicketMessage`, `TicketAttachment`,
`TicketHistory`, `Notification`, `NotificationAttempt`, `Job`, `ReminderOccurrence`,
`EscalationEvent`, `AuditLog`, `StudentFeedback`, `EmailVerificationToken`, `PasswordResetToken`,
`SystemSetting`, `DepartmentServiceTarget`, `DepartmentBusinessHour`, `DepartmentHoliday`,
`Counter`.

Design notes:

- **Reference numbers** come from a locked `Counter` row inside the ticket creation transaction
  (`CR-<year>-<6 digits>`), so concurrent submissions cannot collide.
- **Unique idempotency keys** on `Notification.idempotency_key` and `Job.dedupe_key` make email
  delivery and job execution retry-safe.
- **Timestamps** for every reminder/SLA decision are persisted on `Ticket` and in
  `ReminderOccurrence` / `Job` rows, so the engine survives restarts.
- **Attachment** rows store a private `storageKey`, never a public URL.
- **Audit trail**: `TicketHistory` (ticket-scoped) and `AuditLog` (privileged/system actions).

---

## 5. API conventions

- Base path `/api/v1`.
- JSON request/response; `multipart/form-data` for attachments.
- Auth: `campus_session` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production) plus
  `X-CSRF-Token` header matching the `campus_csrf` cookie for all unsafe methods.
- Errors: `{ error: { code, message, details? } }` with stable machine codes
  (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `INVALID_TRANSITION`, `RATE_LIMITED`, `INTERNAL_ERROR`).
- List endpoints return `{ items, page, pageSize, total }`.
- Resource-level authorization runs on every ticket/message/attachment read or write.
- Student identity is always derived from the session, never from a request parameter.

---

## 6. Dependency map

```
packages/shared  ──>  apps/api (schemas, statuses, permissions)
      │
      └─────────>  apps/web (forms, labels, permissions)

apps/api/prisma/schema.prisma ──> migrations ──> seed
apps/api/src/jobs ──> notifications service ──> email provider
apps/api/src/modules/tickets ──> reminders service ──> jobs (enqueue)
apps/api (built) ──> apps/web (typecheck + runtime API base URL)
```

Cross-agent contracts to respect:

1. Ticket statuses & transitions — `packages/shared/src/tickets.ts`.
2. Roles & permissions — `packages/shared/src/permissions.ts`.
3. Notification types — `packages/shared/src/notifications.ts`.
4. API response shapes — `packages/shared/src/api.ts`.

---

## 7. Acceptance criteria (Definition of Done, PRD §27)

| #   | Criterion                                                                                               | Verified by                    |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A1  | Student registers with `NNNNNNNN@live.gctu.edu.gh`, verifies email, signs in                            | `apps/api/tests/auth.test.ts`  |
| A2  | Non-institutional / malformed emails rejected with a clear error                                        | `auth.test.ts`                 |
| A3  | Roles cannot be self-assigned via crafted requests                                                      | `authorization.test.ts`        |
| A4  | Student cannot read another student's ticket, message or attachment                                     | `authorization.test.ts`        |
| A5  | Officer cannot access another department's ticket; cannot create internal notes via the public endpoint | `authorization.test.ts`        |
| A6  | Ticket created → unique reference `CR-YYYY-NNNNNN`, status history written                              | `tickets.test.ts`              |
| A7  | Routing places the ticket in the right department or fallback queue                                     | `tickets.test.ts`              |
| A8  | Assignment, reassignment, escalation, reopen, resolve all validated and audited                         | `tickets.test.ts`              |
| A9  | Resolution requires a resolution summary                                                                | `tickets.test.ts`              |
| A10 | Internal notes never returned to students                                                               | `tickets.test.ts`              |
| A11 | Untouched ticket gets a reminder exactly on its 2-hour boundary, measured from the action timestamp     | `reminders.test.ts`            |
| A12 | Acknowledging stops untouched reminders but keeps SLA monitoring                                        | `reminders.test.ts`            |
| A13 | Viewing a ticket does not reset the timer                                                               | `reminders.test.ts`            |
| A14 | Reminders go to the current assignee after reassignment                                                 | `reminders.test.ts`            |
| A15 | Duplicate worker execution sends no duplicate email                                                     | `reminders.test.ts`            |
| A16 | Email failures are retried and recorded; the ticket is never lost                                       | `notifications.test.ts`        |
| A17 | Worker restart resumes pending jobs                                                                     | `jobs.test.ts`                 |
| A18 | SLA breach flags overdue and escalates on configured thresholds                                         | `reminders.test.ts`            |
| A19 | Migrations apply cleanly to an empty database                                                           | `scripts/verify-migrations.sh` |
| A20 | Production build + typecheck + lint pass                                                                | `npm run verify`               |

---

## 8. Assumptions (recorded, not blocking)

1. **Institutional email domain** — `live.gctu.edu.gh`. The student identifier is the numeric part of
   the address (e.g. `12345678@live.gctu.edu.gh`). The domain is configuration
   (`INSTITUTION_EMAIL_DOMAINS`), never hardcoded in business logic.
2. **Student ID** — derived from the email local-part when the local part is numeric; students may
   also state it explicitly. Making the student ID mandatory is an institutional decision.
3. **Student self-registration** creates only the `STUDENT` role. Staff accounts are created by an
   administrator through an invitation flow.
4. **Unverified accounts** cannot sign in and cannot create tickets.
5. **Direct officer selection** is enabled by default but restricted to officers with an active
   membership in the chosen department; a student who does not know the officer selects the
   department queue instead.
6. **Fallback queue** — a department marked `isFallbackQueue` receives tickets from departments
   with no active officers; if none is configured, the platform-wide triage department is used.
7. **Business hours** — business-hour service targets are supported but disabled by default
   (`businessHoursOnly=false`) so the two-hour reminder behaves as a wall-clock interval until the
   institution provides a working calendar.
8. **Two-hour interval** — `REMINDER_INTERVAL_MINUTES` default `120`, configurable per department
   via the service-target table and globally via system settings.
9. **Priority** — students may state urgency; the operational priority is stored on the ticket and
   may be adjusted by authorised staff. Priority never changes an academic outcome.
10. **Retention** — default ticket retention 24 months, attachments 12 months; both configurable in
    system settings. Deletion jobs are a documented extension point (implemented as a manual admin
    action, not an automatic job, to avoid silent data loss).

## 9. Decisions that genuinely require institutional input

These are recorded in `docs/open-decisions.md` with an owner and a default so the build can
proceed:

| ID  | Decision                                                              | Default applied                                                               |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D1  | Mandatory vs optional student ID                                      | Optional; derived from the email local-part when numeric                      |
| D2  | Official institutional email domains                                  | `live.gctu.edu.gh` only, configured through `INSTITUTION_EMAIL_DOMAINS`       |
| D3  | Whether officers may self-select in the student form                  | Enabled, restricted to the chosen department                                  |
| D4  | Service targets per department (first response / resolution)          | 8h / 72h wall-clock, reminder interval 120 min                                |
| D5  | Escalation recipients per department                                  | Department head, then administrator                                           |
| D6  | Closure policy (auto-close after N days, student confirmation window) | Student confirmation required; admin auto-close after 14 days                 |
| D7  | Retention periods                                                     | Tickets 24 months, attachments 12 months                                      |
| D8  | Business hours / holiday calendar source                              | Not supplied → wall-clock mode                                                |
| D9  | Alternative escalation channel for sensitive complaints               | A protected category flagged `isSensitive`, routed to the administrator queue |
| D10 | MFA requirement for privileged roles                                  | Not enforced in v1; hooks and configuration present                           |

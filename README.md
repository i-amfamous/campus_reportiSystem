# Campus Resolve

**Student Academic Issue Reporting and Resolution System**

Campus Resolve lets a student report an academic or administrative problem
once, and then follow it to a recorded outcome — with a reference number, a
service target, a named owner, a full history and an audit trail. It exists so
that no report disappears into an office, sits unacknowledged, or is marked
resolved without anyone recording what was actually done.

The system is a working implementation, not a mock-up: the API, the web client,
the background worker, the database schema, the test suites and the deployment
assets are all in this repository.

---

## Table of contents

- [What it does](#what-it-does)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Running the system](#running-the-system)
- [Roles and permissions](#roles-and-permissions)
- [Ticket lifecycle](#ticket-lifecycle)
- [Reminders and service targets](#reminders-and-service-targets)
- [Security model](#security-model)
- [Testing](#testing)
- [Documentation](#documentation)
- [Deployment](#deployment)

---

## What it does

**For students**

- Register and sign in with an institutional email address
  (`10234567@live.gctu.edu.gh`; the numeric local part is the student ID).
- File a report against a category and a department, with course context,
  receipts and screenshots.
- Receive a reference number (`CR-2026-000123`) immediately.
- See the current status, the responsible officer, the service-target
  deadlines and the complete history of every action.
- Reply to the department, request escalation, reopen a report that was not
  genuinely resolved, or withdraw a report that no officer has started.
- Rate the support received. Internal staff notes are never shown to students.

**For staff**

- A department-scoped work queue filtered by status, scope, department and
  overdue state.
- Acknowledge, assign, reassign, change status, request information, resolve
  and escalate, with a resolution summary that the student actually sees.
- Internal notes that are visible to staff and invisible to students.
- Department analytics: volume, first-response and resolution timeliness,
  overdue counts, workload per officer and satisfaction scores.

**For administrators**

- An operations dashboard with institution-wide totals and per-department
  performance.
- User and role management with department-scoped grants, invitations and
  account suspension.
- Department, category and service-target administration.
- A full audit trail of every privileged action.
- CSV and JSON exports that contain ticket metadata but never student contact
  details.
- Background-job and email-delivery health.

---

## Repository layout

```
campus-resolve/
├── apps/
│   ├── api/            Express + TypeScript API, Prisma schema, background worker
│   └── web/            React + TypeScript client (Vite)
├── packages/
│   └── shared/         Zod schemas, roles, permissions, ticket vocabulary
├── docs/
│   ├── architecture.md  System design, data model, lifecycle and decisions
│   ├── api-reference.md Every endpoint, error code and permission
│   └── operations.md    Local setup, deployment, runbooks and incident playbooks
├── scripts/
│   └── local-postgres.mjs  Development PostgreSQL on port 5433
├── docker-compose.yml
└── package.json        npm workspaces monorepo
```

---

## Quick start

```bash
npm install
node scripts/local-postgres.mjs start
cp .env.example .env            # then set SESSION_SECRET
npm run prisma:generate
npm run prisma:deploy
npm run seed
```

Then, in three terminals:

```bash
npm run dev:api      # API on http://localhost:4000
npm run dev:web      # Web app on http://localhost:5173
npm run dev:worker   # reminders, escalation and email delivery
```

The seed script prints the bootstrap super-administrator credentials. Register
a student at `http://localhost:5173/register` with an institutional address to
try the student flow. Staff accounts are created by an administrator: the
invitation email carries a link to `http://localhost:5173/staff-invitation`,
where the invitee chooses their own password and the account becomes active.

> The worker is not optional. Without it no reminder is sent, no ticket is
> escalated and no email is delivered.

---

## Running the system

| Command                 | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run dev`           | The API and the web app together.                                    |
| `npm run dev:api`       | The API only, with hot reload.                                       |
| `npm run dev:web`       | The web app only, with hot reload.                                   |
| `npm run dev:worker`    | The background worker.                                               |
| `npm run build`         | Builds the shared package, the API and the web app.                  |
| `npm run verify`        | Lint, typecheck, API tests and a production build.                   |
| `npm run test`          | The API and web test suites.                                         |
| `npm run seed`          | Roles, permissions, departments, categories and the bootstrap admin. |
| `npm run prisma:studio` | A browser view of the database.                                      |

Configuration lives in the environment. See [`.env.example`](.env.example) for
every variable with its default, and
[`docs/operations.md`](docs/operations.md) for the values that must change
before a real deployment.

---

## Roles and permissions

| Role              | Scope                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| `STUDENT`         | Own reports only.                                                                   |
| `OFFICER`         | Own reports plus the reports of their department.                                   |
| `DEPARTMENT_HEAD` | Officer rights plus department analytics and department-scoped role grants.         |
| `ADMIN`           | Institution-wide user, department, category, settings, audit and export management. |
| `SUPER_ADMIN`     | Administrator rights plus granting the super-administrator role.                    |

The rules the API enforces, not just documents:

- Granting a staff role **replaces** the `STUDENT` role. A person is either a
  student or staff, never both.
- Only a super administrator may grant `SUPER_ADMIN`.
- A department head may only grant `OFFICER` or `DEPARTMENT_HEAD`, and only for
  users inside their own department.
- Nobody may change their own role or their own account status.
- Registration can never create a privileged account.
- A staff account is created by an administrator's invitation. The invitee
  chooses their own password at `/staff-invitation`, and a student token can
  never be used to activate a staff account.

---

## Ticket lifecycle

```
SUBMITTED → AWAITING_ASSIGNMENT → ASSIGNED → ACKNOWLEDGED → IN_PROGRESS
                                                       ↘ AWAITING_STUDENT
                                                       ↘ AWAITING_EXTERNAL
          IN_PROGRESS → RESOLVED → CLOSED
                             ↘ REOPENED → (back into the queue)
          (student may WITHDRAW while no officer has started)
```

`ESCALATED` can be reached from any open state and always returns to
`IN_PROGRESS`. The authoritative transition table is
`STATUS_TRANSITIONS` in `packages/shared/src/tickets.ts`; the server rejects
anything that is not in it with `409 INVALID_TRANSITION`.

---

## Reminders and service targets

Each department publishes a service target: a first-response window, a
resolution window, a reminder interval, a reminder cap and an escalation
threshold. The defaults are 8 hours to a first response and 72 hours to
resolution.

The reminder state is deliberately explicit, because "the ticket is old" and
"the ticket is late" are different things:

| State                | Meaning                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `UNTOUCHED`          | Assigned but no meaningful staff action yet. Reminders fire.           |
| `NEXT_ACTION`        | A meaningful action happened; the next deadline is set.                |
| `SLA_FIRST_RESPONSE` | The first-response target was exceeded. The ticket is flagged overdue. |
| `SLA_RESOLUTION`     | The resolution target was exceeded. The ticket is flagged overdue.     |
| `ESCALATION`         | The reminder cap was reached and the department head was notified.     |

A reminder is only a nudge. The report is never auto-resolved, and the student
is never told that a report is finished unless a member of staff recorded it.

---

## Security model

- **Sessions** live in PostgreSQL. The cookie holds an opaque identifier, is
  `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- **CSRF** uses the double-submit pattern: the readable `campus_csrf` cookie
  must be echoed in the `X-CSRF-Token` header on every state-changing request.
- **Passwords** are hashed with Node's `scrypt`
  (`scrypt$N$r$p$salt$hash`). The comparison is timing-safe.
- **Account lockout** and per-IP rate limits protect sign-in, password reset
  and verification.
- **Authorisation** is enforced per resource, not per route: a student cannot
  read another student's report, an officer cannot read another department's
  report, and internal notes are stripped from the response for the student
  who filed the report.
- **Attachments** are stored in a private directory and are only reachable
  through an authorised download route. The declared content type is checked
  against the file signature.
- **Audit logging** records every privileged action with the actor, the
  target and the request metadata.
- **Exports** contain ticket metadata only. Student email addresses and
  message bodies are never exported.

---

## Testing

```bash
npm run test:api    # 78 API tests: auth, tickets, authorisation, reminders, admin
npm run test:web    # 7 web tests: forms, privacy, UI primitives
npm run verify      # lint + typecheck + API tests + production build
```

The API suite runs against a dedicated `campus_resolve_test` database and
truncates every table between tests. It covers the behaviours that matter:
role boundaries, the internal-note firewall, transition validity, provider
failure handling, reminder and escalation timing, and the audit trail.

---

## Documentation

| Document                                         | Contents                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)   | System design, data model, lifecycle, acceptance criteria and the decisions taken with their reasons.                             |
| [`docs/api-reference.md`](docs/api-reference.md) | Every endpoint, the error envelope, error codes, filters, permissions and the job types.                                          |
| [`docs/operations.md`](docs/operations.md)       | Local setup, configuration, deployment, the background worker, backups, incident playbooks and the pre-launch security checklist. |

---

## Deployment

```bash
cp .env.example .env     # set SESSION_SECRET, DATABASE_URL, APP_URL, CORS_ORIGINS
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed:prod
```

`docker-compose.yml` starts PostgreSQL, the API, the worker and the web
application. The attachment storage is a named volume so documents survive a
rebuild. Full instructions, the release order and the rollback notes are in
[`docs/operations.md`](docs/operations.md).

---

## Scope

Campus Resolve records and tracks the handling of an issue. It does not make
academic decisions, and it does not change grades. Academic outcomes remain
the responsibility of authorised institutional decision-makers.

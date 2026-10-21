# Campus Resolve — operations and deployment runbook

This runbook covers running Campus Resolve locally, deploying it, and the
day-to-day operations that keep the service trustworthy. It assumes the
architecture described in [`architecture.md`](./architecture.md) and the
endpoints described in [`api-reference.md`](./api-reference.md).

---

## 1. Local development

### 1.1 Prerequisites

| Requirement | Version                                          |
| ----------- | ------------------------------------------------ |
| Node.js     | ≥ 20.11.0                                        |
| npm         | ≥ 10                                             |
| PostgreSQL  | 15+ (a bundled copy is provided for development) |

No system-wide PostgreSQL installation is needed for development. The
`embedded-postgres` package ships the official PostgreSQL binaries, and
`scripts/local-postgres.mjs` manages a local cluster.

### 1.2 First run

```bash
npm install
node scripts/local-postgres.mjs start     # starts PostgreSQL on port 5433
cp .env.example .env                     # then edit SESSION_SECRET
npm run prisma:generate
npm run prisma:deploy                    # applies the migrations
npm run seed                             # roles, departments, categories, super admin
```

The seed script prints the bootstrap super-administrator credentials. Change
`BOOTSTRAP_ADMIN_PASSWORD` in `.env` before seeding anything you intend to
keep.

### 1.3 Running the three processes

```bash
npm run dev:api      # Express API on http://localhost:4000
npm run dev:web      # Vite dev server on http://localhost:5173
npm run dev:worker   # background worker for reminders, escalation and email
```

The web development server proxies `/api` to `http://localhost:4000`, so the
browser only ever talks to one origin during development.

> The worker is not optional. Without it, no reminder is sent, no ticket is
> escalated and no email is delivered. Ticket creation and staff actions still
> work, but students would never hear about progress.

### 1.4 Local PostgreSQL management

```bash
node scripts/local-postgres.mjs status
node scripts/local-postgres.mjs start
node scripts/local-postgres.mjs stop
node scripts/local-postgres.mjs url
```

The cluster stores its data in `.local-postgres/data` and listens on port
`5433`. Two databases are used: `campus_resolve` for development and
`campus_resolve_test` for the automated test suite.

### 1.5 Tests

```bash
npm run test:api     # Vitest against campus_resolve_test
npm run test:web     # Vitest + Testing Library
npm run verify       # lint + typecheck + API tests + production build
```

The API suite truncates every table before each test, so never point
`TEST_DATABASE_URL` at a database that holds real data.

---

## 2. Configuration

Every setting is read from the environment. `apps/api/.env` is used when it
exists, otherwise the root `.env` is used. See
[`.env.example`](../.env.example) for the full list with defaults.

### 2.1 Settings that must be changed before any real deployment

| Variable                            | Why it matters                                                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                    | Derives the session and CSRF token hashes. A shared or default value lets an attacker forge sessions. Use at least 32 random characters.                                                                       |
| `DATABASE_URL`                      | Must point at the managed database, with TLS enabled.                                                                                                                                                          |
| `APP_URL`                           | The public web URL. Every email link is built from it.                                                                                                                                                         |
| `CORS_ORIGINS`                      | The exact public origin of the web app. Never use `*`.                                                                                                                                                         |
| `INSTITUTION_EMAIL_DOMAINS`         | The domains a student may register with.                                                                                                                                                                       |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` | `console` never sends real email.                                                                                                                                                                              |
| `STORAGE_DIR`                       | The private attachment directory. It must not be web-accessible.                                                                                                                                               |
| `TRUST_PROXY`                       | Set to `true` only when the API really is behind a proxy.                                                                                                                                                      |
| `COOKIE_SECURE`                     | The `Secure` flag on the session cookies. Leave it on for any HTTPS deployment. Set it to `false` only for a plain-HTTP installation, because a browser refuses a `Secure` cookie that arrives over `http://`. |

### 2.2 Environment-specific defaults

| Setting          | Development             | Staging        | Production        |
| ---------------- | ----------------------- | -------------- | ----------------- |
| `NODE_ENV`       | `development`           | `staging`      | `production`      |
| `EMAIL_PROVIDER` | `console`               | `resend`       | `resend`          |
| `TRUST_PROXY`    | `false`                 | `true`         | `true`            |
| `LOG_LEVEL`      | `debug`                 | `info`         | `info`            |
| `CORS_ORIGINS`   | `http://localhost:5173` | staging origin | production origin |

In production the session cookie is marked `Secure`, so the API must be served
over HTTPS. The bundled `docker-compose.yml` serves the site on plain HTTP at
`http://localhost:8080` and therefore sets `COOKIE_SECURE=false`; turn it back
on as soon as the site is reachable over HTTPS.

---

## 3. Deployment

### 3.1 Docker Compose (single host)

`docker-compose.yml` in the repository root starts PostgreSQL, the API, the
worker and the web application:

```bash
cp .env.example .env      # set SESSION_SECRET, DATABASE_URL, APP_URL, CORS_ORIGINS
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed:prod
docker compose ps
```

The compose file mounts the attachment storage as a named volume so that
attachments survive a container rebuild.

`npm run seed:prod` runs the compiled seed (`dist/seed.js`). In a checkout
without a build, `npm run seed` runs the same seed through `tsx`.

### 3.2 Managed database

```bash
npm run prisma:deploy     # applies every pending migration
npm run seed              # idempotent: safe to run on every deploy
```

`prisma migrate deploy` never drops data. Migrations are forward-only; a
rollback is a new migration.

In a container, the Prisma CLI and the compiled seed are both part of the
runtime image:

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed:prod
```

### 3.3 Release order

1. Apply the database migration (`prisma migrate deploy`).
2. Deploy the API. It is backwards compatible with the previous web build.
3. Deploy the web application.
4. Restart the worker so it picks up the new job handlers.
5. Verify `GET /readyz` and `GET /api/v1/admin/system/health`.

### 3.4 Reverse proxy

Terminate TLS at the proxy and forward to the API. The API trusts one proxy
hop when `TRUST_PROXY=true`, which is what the per-IP rate limiters rely on.

```
example.com/         → web container (static build)
example.com/api/     → api container :4000
```

If the web application and the API share an origin, the browser sends the
session cookie for every request and no CORS configuration is required. If
they are on different origins, `CORS_ORIGINS` must list the web origin
exactly.

---

## 4. The background worker

The worker is a separate process from the API and can be scaled horizontally.
It claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`, so two workers never
process the same job.

```bash
npm run dev:worker          # development
npm run start:worker --workspace @campus-resolve/api   # production
```

| Environment variable      | Meaning                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `WORKER_POLL_INTERVAL_MS` | How long the worker sleeps between ticks. Default `30000`. |
| `WORKER_BATCH_SIZE`       | Jobs claimed per tick. Default `25`.                       |
| `WORKER_MAX_ATTEMPTS`     | Attempts before a job is marked `FAILED`. Default `5`.     |
| `WORKER_ID`               | Instance name used in the logs. Auto-generated when blank. |

### 4.1 Stale job recovery

A worker that is killed mid-job leaves the job in `RUNNING`. On its next tick
every worker calls `recoverStaleJobs()`, which returns jobs that have been
`RUNNING` for longer than twice the poll interval back to `PENDING`. No
operator action is required after a crash or a deploy.

### 4.2 What the worker does

| Job                     | Effect                                                         |
| ----------------------- | -------------------------------------------------------------- |
| `NOTIFICATION_DELIVERY` | Sends an email and records the attempt.                        |
| `TICKET_REMINDER`       | Sends the staff reminder and schedules the next one.           |
| `SLA_FIRST_RESPONSE`    | Flags an unanswered report as overdue and escalates it.        |
| `SLA_RESOLUTION`        | Flags an unresolved report as overdue and escalates it.        |
| `ESCALATION`            | Notifies the department head and records the escalation event. |
| `TICKET_AUTO_CLOSE`     | Closes a resolved report after the auto-close window.          |

---

## 5. Routine operations

### 5.1 Daily checks

1. `GET /api/v1/admin/system/health` — `jobs.failed` and `notifications.failed`
   should be zero.
2. The operations dashboard (`/admin/dashboard`) — look for a rising
   `unassigned` or `overdue` count.
3. The audit trail (`/admin/audit`) — review role changes and account
   suspensions.

### 5.2 Failed notifications

Notifications are only marked `SENT` when the provider confirmed delivery. A
provider outage therefore shows up as `notifications.failed > 0` and the
related report is unaffected.

To retry them:

```bash
curl -X POST https://example.com/api/v1/admin/system/retry-failed-notifications \
  -H 'Cookie: campus_session=…' -H 'X-CSRF-Token: …'
```

The endpoint re-queues up to 200 failed notifications with fresh dedupe keys.
The UI exposes the same action on the operations dashboard.

### 5.3 Failed jobs

A job that exhausts `WORKER_MAX_ATTEMPTS` is marked `FAILED` and stops being
retried automatically. Investigate the error, fix the cause, then requeue the
job by setting its status back to `PENDING`:

```sql
UPDATE jobs SET status = 'PENDING', run_at = now() WHERE id = '<job id>';
```

### 5.4 Re-running the seed

`npm run seed` is idempotent. It upserts roles, permissions, departments,
categories and service targets, and creates the bootstrap super administrator
only when no super administrator exists. It never deletes data.

### 5.5 Backups

Back up two things:

- the database (`pg_dump`), and
- `STORAGE_DIR`, the attachment directory.

Both must be restored together: an attachment row without its file is a broken
document, and a file without its row is unreachable.

A typical nightly job:

```bash
pg_dump "$DATABASE_URL" | gzip > "backup-$(date +%F).sql.gz"
tar czf "attachments-$(date +%F).tar.gz" "$STORAGE_DIR"
```

---

## 6. Incident playbooks

### 6.1 A student says their report disappeared

1. Search for the reference number in the database and in the audit trail.
2. If the row exists, check `status`. `WITHDRAWN` means the student withdrew
   it; the history records the reason.
3. If the row is missing, check the application logs for the request id the
   student has. The `tickets` table is never hard-deleted, so a missing row
   means the request never reached the insert.

### 6.2 Reminders are not being sent

1. Confirm the worker is running (`docker compose ps` or the process list).
2. `GET /api/v1/admin/system/health` — look at `jobs.pending`. A growing
   `pending` count with no delivery means the worker is not ticking.
3. Check the system settings: `remindersPaused` suspends every reminder.
4. Check `reminderIntervalMinutes` on the department's service target.

### 6.3 Emails are not arriving

1. `GET /api/v1/admin/system/health` — `emailProvider` shows the active
   provider and `notifications.failed` shows the failures.
2. `SELECT last_error FROM notifications WHERE status = 'FAILED'` shows the
   provider response.
3. With `EMAIL_PROVIDER=console` the rendered message is stored on the
   notification record in the `rendered` field of its payload. This is the
   fastest way to confirm the template is correct.
4. With `EMAIL_PROVIDER=resend`, confirm `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`
   and that the domain is verified with the provider.

### 6.4 A staff member cannot see a report

1. Confirm the ticket's department matches the officer's active membership.
2. `SELECT * FROM department_memberships WHERE "userId" = '<id>'` — check
   `is_active`.
3. Confirm the account status is `ACTIVE`; a suspended account has its
   sessions revoked.
4. The work queue is scoped server-side. A report that is genuinely missing
   from the queue is a scoping bug, not a permission bug.

---

## 7. Security checklist

Before a production launch:

- [ ] `SESSION_SECRET` is a unique random string of at least 32 characters and
      is not the example value.
- [ ] `NODE_ENV=production`, so the session cookie is `Secure` and `HttpOnly`.
- [ ] The API is only reachable over HTTPS, directly or through a trusted proxy.
- [ ] `CORS_ORIGINS` lists the exact web origin and nothing else.
- [ ] `EMAIL_PROVIDER=resend` with a valid key, or a deliberate decision to
      stay on `console`.
- [ ] `STORAGE_DIR` is outside every web root and is not served by the web
      server.
- [ ] `TRUST_PROXY=true` only when a proxy is really in front of the API.
- [ ] The bootstrap super-administrator password has been changed.
- [ ] `DATABASE_URL` uses TLS and a least-privilege application role.
- [ ] Backups of the database and the attachment directory are scheduled and
      have been restored at least once.
- [ ] `npm run verify` passes on the release commit.

---

## 8. Troubleshooting

| Symptom                                           | Likely cause                                              | Action                                                                               |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `500` on every request                            | Database unreachable                                      | Check `GET /readyz` and `DATABASE_URL`.                                              |
| `403 CSRF_FAILED`                                 | The web app is on an origin that is not in `CORS_ORIGINS` | Add the exact origin, including the scheme.                                          |
| `403 EMAIL_NOT_VERIFIED`                          | The account never used its verification link              | Resend the verification email; admins can re-send it.                                |
| `423 ACCOUNT_LOCKED`                              | Too many failed sign-ins                                  | Wait for the lock to expire, or unlock the account in the database.                  |
| Attachments download as `404`                     | The storage directory moved or was wiped                  | Restore `STORAGE_DIR` from the backup.                                               |
| The web app loads but every call fails with `401` | The session cookie is not being sent                      | Check `SameSite`, the `Secure` flag and whether the API and web app share an origin. |
| The worker is idle and jobs stay `PENDING`        | The worker is not running                                 | Start it; check `WORKER_POLL_INTERVAL_MS` and the worker logs.                       |

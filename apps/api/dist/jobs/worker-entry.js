// src/jobs/worker.ts
import os from "os";

// src/config/env.ts
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import path from "path";
import fs from "fs";
loadDotenv({ path: path.resolve(process.cwd(), ".env") });
loadDotenv({ path: path.resolve(process.cwd(), "apps/api/.env") });
var booleanish = z.union([z.boolean(), z.string()]).transform(
  (value) => typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase())
);
var optionalBooleanish = z.union([z.boolean(), z.string()]).optional().transform((value) => {
  if (value === void 0 || value === "") return void 0;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
});
var intish = (fallback) => z.union([z.number(), z.string()]).optional().transform((value) => value === void 0 || value === "" ? fallback : Number(value)).pipe(z.number().int());
var csv = (fallback) => z.string().optional().transform(
  (value) => value === void 0 || value.trim() === "" ? fallback : value.split(",").map((item) => item.trim()).filter(Boolean)
);
var envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: intish(4e3),
  APP_URL: z.string().url().default("http://localhost:5173"),
  API_URL: z.string().url().default("http://localhost:4000"),
  CORS_ORIGINS: csv(["http://localhost:5173"]),
  TRUST_PROXY: booleanish.default(false),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  INSTITUTION_NAME: z.string().min(2).default("Campus Resolve"),
  INSTITUTION_EMAIL_DOMAINS: csv(["live.gctu.edu.gh"]),
  SUPPORT_EMAIL: z.string().email().default("support@campusresolve.edu.gh"),
  SESSION_COOKIE_NAME: z.string().default("campus_session"),
  CSRF_COOKIE_NAME: z.string().default("campus_csrf"),
  /**
   * The `Secure` flag on the session cookies. Defaults to on in production
   * and off in development. It must be turned off explicitly for a
   * plain-HTTP deployment, because a browser refuses to store a `Secure`
   * cookie that arrives over `http://`.
   */
  COOKIE_SECURE: optionalBooleanish,
  SESSION_TTL_HOURS: intish(12),
  SESSION_SECRET: z.string().min(16).default("insecure-development-secret-change-me"),
  MFA_REQUIRED_FOR_PRIVILEGED: booleanish.default(false),
  RATE_LIMIT_WINDOW_MS: intish(15 * 60 * 1e3),
  RATE_LIMIT_MAX: intish(100),
  LOGIN_RATE_LIMIT_WINDOW_MS: intish(15 * 60 * 1e3),
  LOGIN_RATE_LIMIT_MAX: intish(10),
  PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: intish(60 * 60 * 1e3),
  PASSWORD_RESET_RATE_LIMIT_MAX: intish(5),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM_NAME: z.string().default("Campus Resolve"),
  EMAIL_FROM_ADDRESS: z.string().email().default("no-reply@campusresolve.edu.gh"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_RETRY_MAX_ATTEMPTS: intish(5),
  EMAIL_RETRY_BASE_DELAY_MS: intish(6e4),
  STORAGE_DIR: z.string().default("./storage/attachments"),
  STORAGE_MAX_FILE_SIZE_MB: intish(10),
  REMINDER_INTERVAL_MINUTES: intish(120),
  ESCALATION_AFTER_REMINDERS: intish(3),
  MAX_REMINDERS: intish(8),
  SLA_FIRST_RESPONSE_MINUTES: intish(480),
  SLA_RESOLUTION_MINUTES: intish(4320),
  AUTO_CLOSE_DAYS: intish(14),
  WORKER_POLL_INTERVAL_MS: intish(3e4),
  WORKER_BATCH_SIZE: intish(25),
  WORKER_MAX_ATTEMPTS: intish(5),
  WORKER_ID: z.string().optional().transform((value) => value && value.trim() ? value.trim() : void 0),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default("superadmin@live.gctu.edu.gh"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default("ChangeMe!2026"),
  BOOTSTRAP_ADMIN_NAME: z.string().default("Platform Super Administrator")
});
var cached = null;
function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n  - ");
    throw new Error(`Invalid environment configuration:
  - ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
function getConfig() {
  if (!cached) return loadConfig();
  return cached;
}

// src/config/clock.ts
var override = null;
var clock = {
  now() {
    return new Date(override ?? Date.now());
  },
  nowMs() {
    return override ?? Date.now();
  },
  /** Move the clock to an absolute instant. */
  set(instant) {
    override = new Date(instant).getTime();
  },
  /** Move the clock forward by a number of milliseconds. */
  advance(milliseconds) {
    override = clock.nowMs() + milliseconds;
  },
  /** Remove any override and return to the wall clock. */
  reset() {
    override = null;
  },
  get isOverridden() {
    return override !== null;
  }
};

// src/config/logger.ts
var ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "csrfToken",
  "sessionSecret",
  "apiKey",
  "authorization",
  "resend_api_key"
]);
function redact(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = redact(entry);
  }
  return output;
}
function write(level, message, context) {
  const config = getConfig();
  if (ORDER[level] < ORDER[config.LOG_LEVEL]) return;
  const payload = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    message,
    ...context ? { context: redact(context) } : {}
  };
  if (config.NODE_ENV === "production") {
    process.stdout.write(`${JSON.stringify(payload)}
`);
  } else {
    const extras = context ? ` ${JSON.stringify(redact(context))}` : "";
    process.stdout.write(`[${payload.ts}] ${level.toUpperCase()} ${message}${extras}
`);
  }
}
var logger = {
  debug: (message, context) => write("debug", message, context),
  info: (message, context) => write("info", message, context),
  warn: (message, context) => write("warn", message, context),
  error: (message, context) => write("error", message, context)
};

// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: getConfig().NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (getConfig().NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// src/jobs/queue.ts
async function enqueueJob(type, payload, options = {}, client = prisma) {
  try {
    return await client.job.create({
      data: {
        type,
        payload,
        dedupeKey: options.dedupeKey ?? null,
        runAt: options.runAt ?? clock.now(),
        maxAttempts: options.maxAttempts ?? 5,
        status: "PENDING"
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}
function isUniqueViolation(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
async function claimJobs(workerId, limit) {
  const rows = await prisma.$queryRaw`
    UPDATE jobs
       SET status = 'RUNNING',
           "lockedBy" = ${workerId},
           "lockedAt" = ${clock.now()},
           attempts = attempts + 1,
           "updatedAt" = ${clock.now()}
     WHERE id IN (
       SELECT id FROM jobs
        WHERE status = 'PENDING' AND "runAt" <= ${clock.now()}
        ORDER BY "runAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
  `;
  return rows;
}
async function completeJob(jobId, result) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      result: result ?? null,
      lockedBy: null,
      lockedAt: null,
      lastError: null
    }
  });
}
async function failJob(jobId, error, retry) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  if (!retry || job.attempts >= job.maxAttempts) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        lastError: error.slice(0, 2e3),
        lockedBy: null,
        lockedAt: null
      }
    });
    logger.error("Background job failed permanently", { jobId, jobType: job.type, error });
    return;
  }
  const backoffMs = Math.min(60 * 60 * 1e3, 3e4 * 2 ** Math.max(0, job.attempts - 1));
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "PENDING",
      lastError: error.slice(0, 2e3),
      lockedBy: null,
      lockedAt: null,
      runAt: new Date(clock.nowMs() + backoffMs)
    }
  });
  logger.warn("Background job failed, retrying", { jobId, jobType: job.type, error, backoffMs });
}
async function recoverStaleJobs(staleAfterMs = 5 * 60 * 1e3) {
  const cutoff = new Date(clock.nowMs() - staleAfterMs);
  const result = await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedBy: null, lockedAt: null }
  });
  if (result.count > 0) {
    logger.warn("Recovered stale background jobs after worker restart", { count: result.count });
  }
  return result.count;
}

// src/modules/notifications/email.provider.ts
var ConsoleEmailProvider = class {
  name = "console";
  async send(message) {
    logger.info("Email queued (console provider)", {
      to: message.to,
      subject: message.subject,
      idempotencyKey: message.idempotencyKey
    });
    return {
      providerMessageId: `console-${message.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}`
    };
  }
};
var ResendEmailProvider = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  apiKey;
  name = "resend";
  async send(message) {
    const config = getConfig();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey
      },
      body: JSON.stringify({
        from: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM_ADDRESS}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html
      })
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw new Error(`Email provider rejected the message (${response.status}): ${body}`);
    }
    const payload = await response.json();
    return { providerMessageId: payload.id ?? `resend-${Date.now()}` };
  }
};
var cachedProvider = null;
function getEmailProvider() {
  if (cachedProvider) return cachedProvider;
  const config = getConfig();
  if (config.EMAIL_PROVIDER === "resend") {
    if (!config.RESEND_API_KEY) {
      logger.warn(
        "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set; falling back to console provider."
      );
      cachedProvider = new ConsoleEmailProvider();
      return cachedProvider;
    }
    cachedProvider = new ResendEmailProvider(config.RESEND_API_KEY);
    return cachedProvider;
  }
  cachedProvider = new ConsoleEmailProvider();
  return cachedProvider;
}

// ../../packages/shared/src/tickets.ts
var TICKET_STATUSES = [
  "SUBMITTED",
  "AWAITING_ASSIGNMENT",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "AWAITING_STUDENT",
  "AWAITING_EXTERNAL",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "WITHDRAWN"
];
var TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];
var STATUS_LABELS = {
  SUBMITTED: "Submitted",
  AWAITING_ASSIGNMENT: "Awaiting assignment",
  ASSIGNED: "Assigned",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  AWAITING_STUDENT: "Awaiting your response",
  AWAITING_EXTERNAL: "Awaiting external department",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  WITHDRAWN: "Withdrawn"
};
var STATUS_TRANSITIONS = {
  SUBMITTED: ["AWAITING_ASSIGNMENT", "ASSIGNED", "WITHDRAWN"],
  AWAITING_ASSIGNMENT: ["ASSIGNED", "ESCALATED", "WITHDRAWN"],
  ASSIGNED: [
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "AWAITING_STUDENT",
    "AWAITING_EXTERNAL",
    "RESOLVED",
    "ESCALATED",
    "AWAITING_ASSIGNMENT"
  ],
  ACKNOWLEDGED: ["IN_PROGRESS", "AWAITING_STUDENT", "AWAITING_EXTERNAL", "RESOLVED", "ESCALATED"],
  IN_PROGRESS: ["AWAITING_STUDENT", "AWAITING_EXTERNAL", "RESOLVED", "ESCALATED"],
  AWAITING_STUDENT: ["IN_PROGRESS", "RESOLVED", "ESCALATED"],
  AWAITING_EXTERNAL: ["IN_PROGRESS", "RESOLVED", "ESCALATED"],
  ESCALATED: ["IN_PROGRESS", "AWAITING_STUDENT", "RESOLVED", "ESCALATED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED", "AWAITING_ASSIGNMENT", "ACKNOWLEDGED", "IN_PROGRESS"],
  WITHDRAWN: []
};
function canTransition(from, to) {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ../../packages/shared/src/permissions.ts
var STUDENT_PERMISSIONS = [
  "ticket:create",
  "ticket:read:own",
  "ticket:reply:public",
  "ticket:escalate:request",
  "ticket:reopen:request",
  "ticket:withdraw",
  "ticket:feedback:create",
  "attachment:upload",
  "attachment:download",
  "department:read",
  "category:read"
];
var OFFICER_PERMISSIONS = [
  ...STUDENT_PERMISSIONS,
  "ticket:read:department",
  "ticket:note:internal",
  "ticket:status:update",
  "ticket:assign",
  "ticket:reassign",
  "ticket:resolve",
  "ticket:escalate:manage",
  "ticket:reopen:manage",
  "ticket:feedback:read"
];
var DEPARTMENT_HEAD_PERMISSIONS = [
  ...OFFICER_PERMISSIONS,
  "analytics:department",
  "user:manage:department"
];
var ADMIN_PERMISSIONS = [
  ...DEPARTMENT_HEAD_PERMISSIONS,
  "ticket:read:any",
  "user:manage",
  "user:role:assign",
  "department:manage",
  "category:manage",
  "settings:manage",
  "analytics:global",
  "audit:read",
  "export:create",
  "job:manage"
];
var SUPER_ADMIN_PERMISSIONS = [
  ...ADMIN_PERMISSIONS,
  "settings:institution",
  "security:read",
  "retention:manage"
];

// ../../packages/shared/src/schemas.ts
import { z as z2 } from "zod";
var passwordSchema = z2.string().min(10, "Password must be at least 10 characters").max(128, "Password must be at most 128 characters").regex(/[a-z]/, "Password must contain a lowercase letter").regex(/[A-Z]/, "Password must contain an uppercase letter").regex(/[0-9]/, "Password must contain a number");
var emailSchema = z2.string().trim().min(1, "Email is required").email("Enter a valid email address").max(254, "Email is too long");
var fullNameSchema = z2.string().trim().min(2, "Enter your full name").max(120, "Name is too long");
var studentIdSchema = z2.string().trim().min(1, "Student ID is required").max(32, "Student ID is too long").regex(/^[A-Za-z0-9/-]+$/, "Student ID contains invalid characters");
var registerSchema = z2.object({
  fullName: fullNameSchema,
  email: emailSchema,
  studentId: studentIdSchema.optional(),
  password: passwordSchema,
  acceptTerms: z2.literal(true, {
    errorMap: () => ({ message: "You must accept the privacy notice and usage terms" })
  })
});
var loginSchema = z2.object({
  email: emailSchema,
  password: z2.string().min(1, "Enter your password").max(128)
});
var verifyEmailSchema = z2.object({
  token: z2.string().min(10, "Invalid verification token").max(512)
});
var acceptInvitationSchema = z2.object({
  token: z2.string().min(10, "Invalid invitation token").max(512),
  password: passwordSchema
});
var resendVerificationSchema = z2.object({
  email: emailSchema
});
var forgotPasswordSchema = z2.object({
  email: emailSchema
});
var resetPasswordSchema = z2.object({
  token: z2.string().min(10, "Invalid reset token").max(512),
  password: passwordSchema
});
var changePasswordSchema = z2.object({
  currentPassword: z2.string().min(1, "Enter your current password").max(128),
  newPassword: passwordSchema
});
var updateProfileSchema = z2.object({
  fullName: fullNameSchema.optional(),
  studentId: studentIdSchema.optional(),
  preferredContactMethod: z2.enum(["EMAIL", "PHONE", "IN_PERSON"]).optional(),
  phone: z2.string().trim().max(32).optional()
});
var createTicketSchema = z2.object({
  categoryId: z2.string().uuid("Select a valid issue category"),
  departmentId: z2.string().uuid("Select a valid department"),
  assignedToId: z2.string().uuid().optional().nullable(),
  useTriageQueue: z2.boolean().optional(),
  subject: z2.string().trim().min(6, "Subject must be at least 6 characters").max(180, "Subject must be at most 180 characters"),
  description: z2.string().trim().min(20, "Describe the issue in at least 20 characters").max(8e3, "Description must be at most 8000 characters"),
  priority: z2.enum(TICKET_PRIORITIES).optional(),
  courseCode: z2.string().trim().max(32).optional(),
  courseTitle: z2.string().trim().max(160).optional(),
  semester: z2.string().trim().max(64).optional(),
  assessmentReference: z2.string().trim().max(64).optional(),
  transactionReference: z2.string().trim().max(64).optional(),
  preferredContactMethod: z2.enum(["EMAIL", "PHONE", "IN_PERSON"]).optional()
});
var ticketListQuerySchema = z2.object({
  status: z2.union([z2.enum(TICKET_STATUSES), z2.array(z2.enum(TICKET_STATUSES))]).optional(),
  categoryId: z2.string().uuid().optional(),
  departmentId: z2.string().uuid().optional(),
  assignedToId: z2.string().uuid().optional(),
  priority: z2.union([z2.enum(TICKET_PRIORITIES), z2.array(z2.enum(TICKET_PRIORITIES))]).optional(),
  search: z2.string().trim().max(200).optional(),
  overdue: z2.boolean().optional(),
  unassigned: z2.boolean().optional(),
  awaitingStudent: z2.boolean().optional(),
  from: z2.coerce.date().optional(),
  to: z2.coerce.date().optional(),
  page: z2.coerce.number().int().min(1).optional(),
  pageSize: z2.coerce.number().int().min(1).max(100).optional(),
  sort: z2.enum(["createdAt", "updatedAt", "referenceNumber", "priority"]).optional(),
  order: z2.enum(["asc", "desc"]).optional()
});
var postMessageSchema = z2.object({
  body: z2.string().trim().min(1, "Write a message").max(8e3, "Message must be at most 8000 characters")
});
var postNoteSchema = z2.object({
  body: z2.string().trim().min(1, "Write a note").max(8e3, "Note must be at most 8000 characters")
});
var changeStatusSchema = z2.object({
  status: z2.enum(TICKET_STATUSES),
  note: z2.string().trim().max(2e3).optional()
});
var assignTicketSchema = z2.object({
  assignedToId: z2.string().uuid().nullable(),
  reason: z2.string().trim().max(500).optional()
});
var resolveTicketSchema = z2.object({
  resolutionSummary: z2.string().trim().min(10, "A resolution summary of at least 10 characters is required").max(4e3, "Resolution summary must be at most 4000 characters")
});
var escalateTicketSchema = z2.object({
  reason: z2.string().trim().min(5, "Explain why this ticket is being escalated").max(1e3),
  targetUserId: z2.string().uuid().optional().nullable()
});
var reopenTicketSchema = z2.object({
  reason: z2.string().trim().min(5, "Explain why the issue is not resolved").max(1e3)
});
var withdrawTicketSchema = z2.object({
  reason: z2.string().trim().max(500).optional()
});
var feedbackSchema = z2.object({
  rating: z2.coerce.number().int().min(1).max(5),
  comment: z2.string().trim().max(2e3).optional()
});
var departmentSchema = z2.object({
  name: z2.string().trim().min(2, "Enter a department name").max(120),
  description: z2.string().trim().max(1e3).optional(),
  contactEmail: emailSchema.optional().or(z2.literal("")),
  isActive: z2.boolean().optional(),
  isFallbackQueue: z2.boolean().optional(),
  sortOrder: z2.number().int().optional()
});
var departmentUpdateSchema = departmentSchema.partial();
var categorySchema = z2.object({
  name: z2.string().trim().min(2, "Enter a category name").max(120),
  description: z2.string().trim().max(1e3).optional(),
  departmentId: z2.string().uuid().optional().nullable(),
  defaultPriority: z2.enum(TICKET_PRIORITIES).optional(),
  isActive: z2.boolean().optional(),
  isSensitive: z2.boolean().optional(),
  sortOrder: z2.number().int().optional()
});
var categoryUpdateSchema = categorySchema.partial();
var inviteUserSchema = z2.object({
  email: emailSchema,
  fullName: fullNameSchema,
  role: z2.enum(["OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"]),
  departmentId: z2.string().uuid().optional().nullable(),
  departmentRole: z2.enum(["OFFICER", "HEAD"]).optional().nullable()
});
var updateUserRoleSchema = z2.object({
  role: z2.enum(["STUDENT", "OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"]),
  departmentId: z2.string().uuid().optional().nullable(),
  departmentRole: z2.enum(["OFFICER", "HEAD"]).optional().nullable()
});
var updateUserStatusSchema = z2.object({
  accountStatus: z2.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]),
  reason: z2.string().trim().max(500).optional()
});
var serviceTargetSchema = z2.object({
  firstResponseMinutes: z2.number().int().min(5).max(60 * 24 * 30),
  resolutionMinutes: z2.number().int().min(30).max(60 * 24 * 90),
  reminderIntervalMinutes: z2.number().int().min(15).max(60 * 24 * 7),
  maxReminders: z2.number().int().min(0).max(50),
  escalationAfterReminders: z2.number().int().min(0).max(50),
  businessHoursOnly: z2.boolean().optional()
});
var settingsUpdateSchema = z2.object({
  institutionName: z2.string().trim().min(2).max(120).optional(),
  institutionEmailDomains: z2.array(emailSchema).optional(),
  reminderIntervalMinutes: z2.number().int().min(15).max(60 * 24).optional(),
  escalationAfterReminders: z2.number().int().min(0).max(50).optional(),
  maxReminders: z2.number().int().min(0).max(50).optional(),
  autoCloseDays: z2.number().int().min(1).max(365).optional(),
  ticketRetentionMonths: z2.number().int().min(1).max(120).optional(),
  attachmentRetentionMonths: z2.number().int().min(1).max(120).optional(),
  allowStudentOfficerSelection: z2.boolean().optional(),
  remindersPaused: z2.boolean().optional(),
  supportEmail: emailSchema.optional()
}).strict();
var exportQuerySchema = z2.object({
  type: z2.enum(["tickets", "analytics", "notifications", "audit"]),
  format: z2.enum(["csv", "json"]).optional(),
  from: z2.coerce.date().optional(),
  to: z2.coerce.date().optional(),
  departmentId: z2.string().uuid().optional()
});
var uuidSchema = z2.string().uuid();
var idParamSchema = z2.object({ id: uuidSchema });
var attachmentIdParamSchema = z2.object({
  id: uuidSchema,
  attachmentId: uuidSchema
});

// src/modules/notifications/templates.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatDate(value) {
  if (!value) return "\u2014";
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
function truncate(value, length = 600) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}\u2026`;
}
function ticketLink(appUrl, referenceNumber, path2 = "/tickets") {
  return `${appUrl}${path2}?reference=${encodeURIComponent(referenceNumber)}`;
}
var SUBJECTS = {
  EMAIL_VERIFICATION: () => "Verify your Campus Resolve email address",
  REGISTRATION_CONFIRMED: (ctx) => `Welcome to Campus Resolve, ${ctx.recipientName}`,
  PASSWORD_RESET: () => "Reset your Campus Resolve password",
  STAFF_INVITATION: () => "Campus Resolve staff invitation",
  ACCOUNT_SUSPENDED: () => "Your Campus Resolve account has been suspended",
  TICKET_SUBMITTED: (ctx) => `Report received: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  TICKET_ACKNOWLEDGED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been acknowledged`,
  TICKET_ASSIGNED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been assigned`,
  TICKET_REASSIGNED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been reassigned`,
  TICKET_STATUS_CHANGED: (ctx) => `Update on ${ctx.ticket?.referenceNumber ?? "your report"}`,
  TICKET_INFO_REQUESTED: (ctx) => `More information needed for ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  TICKET_REPLY: (ctx) => `New reply on ${ctx.ticket?.referenceNumber ?? "your report"}`,
  TICKET_ESCALATED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been escalated`,
  TICKET_RESOLVED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been resolved`,
  TICKET_REOPENED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been reopened`,
  TICKET_CLOSED: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been closed`,
  TICKET_WITHDRAWN: (ctx) => `${ctx.ticket?.referenceNumber ?? "Your report"} has been withdrawn`,
  FEEDBACK_REQUESTED: (ctx) => `Please rate the support you received for ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_TICKET_ASSIGNED: (ctx) => `New ticket assigned to you: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_TICKET_REASSIGNED: (ctx) => `Ticket reassigned to you: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_TICKET_REPLIED: (ctx) => `Student replied on ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_TICKET_ESCALATED: (ctx) => `Escalated: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_TICKET_QUEUED: (ctx) => `Ticket routed to your department queue: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_REMINDER_DUE: (ctx) => `Action required: Untouched student ticket ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_SLA_WARNING: (ctx) => `Service target approaching: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  STAFF_SLA_BREACHED: (ctx) => `Service target breached: ${ctx.ticket?.referenceNumber ?? ""}`.trim(),
  SYSTEM_ADMIN_ALERT: (ctx) => `Campus Resolve alert: ${ctx.detail ?? "system notification"}`
};
function layout(ctx, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <tr><td>
      <p style="margin:0 0 4px;font-size:13px;color:#475569;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(ctx.institutionName)} \xB7 Campus Resolve</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(ctx.actionLabel ?? "Notification")}</h1>
      ${bodyHtml}
      ${buttonHtml(ctx)}
      <p style="margin:28px 0 0;font-size:12px;color:#64748b">This is an automated message from Campus Resolve. Please do not reply to this email.</p>
    </td></tr>
  </table>
</body></html>`;
}
function ticketSummaryHtml(ctx) {
  if (!ctx.ticket) return "";
  const rows = [
    ["Ticket", ctx.ticket.referenceNumber],
    ["Category", ctx.ticket.categoryName ?? "\u2014"],
    ["Department", ctx.ticket.departmentName ?? "\u2014"],
    ["Submitted", formatDate(ctx.ticket.submittedAt)],
    ["Current status", STATUS_LABELS[ctx.ticket.status]]
  ];
  if (ctx.ticket.assignedOfficerName)
    rows.push(["Assigned officer", ctx.ticket.assignedOfficerName]);
  if (ctx.ticket.nextAction) rows.push(["Next action", ctx.ticket.nextAction]);
  if (ctx.dueAt) rows.push(["Due", formatDate(ctx.dueAt)]);
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
    ${rows.map(
    ([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
           <td style="padding:6px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`
  ).join("")}
  </table>`;
}
function ticketSummaryText(ctx) {
  if (!ctx.ticket) return "";
  const lines = [
    `- Ticket: ${ctx.ticket.referenceNumber}`,
    ctx.ticket.categoryName ? `- Category: ${ctx.ticket.categoryName}` : void 0,
    ctx.ticket.departmentName ? `- Department: ${ctx.ticket.departmentName}` : void 0,
    `- Submitted: ${formatDate(ctx.ticket.submittedAt)}`,
    `- Current status: ${STATUS_LABELS[ctx.ticket.status]}`,
    ctx.ticket.assignedOfficerName ? `- Assigned officer: ${ctx.ticket.assignedOfficerName}` : void 0,
    ctx.ticket.nextAction ? `- Next action: ${ctx.ticket.nextAction}` : void 0,
    ctx.dueAt ? `- Due: ${formatDate(ctx.dueAt)}` : void 0
  ].filter(Boolean);
  return lines.join("\n");
}
function buttonHtml(ctx) {
  if (!ctx.actionUrl) return "";
  return `<p style="margin:22px 0 0"><a href="${escapeHtml(ctx.actionUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(ctx.actionLabel ?? "Open Campus Resolve")}</a></p>
  <p style="margin:10px 0 0;font-size:12px;color:#64748b">Or paste this link into your browser: ${escapeHtml(ctx.actionUrl)}</p>`;
}
function buttonText(ctx) {
  if (!ctx.actionUrl) return "";
  return `
${ctx.actionLabel ?? "Open Campus Resolve"}: ${ctx.actionUrl}
`;
}
function renderEmail(type, ctx) {
  const subject = SUBJECTS[type](ctx);
  const textParts = [];
  const htmlParts = [];
  switch (type) {
    case "EMAIL_VERIFICATION": {
      const link = `${ctx.appUrl}/verify-email?token=${encodeURIComponent(ctx.token ?? "")}`;
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "Confirm your institutional email address to activate your Campus Resolve account.",
        "",
        `Verification link: ${link}`,
        "",
        "The link expires in 24 hours. If you did not request an account, ignore this message."
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>Confirm your institutional email address to activate your Campus Resolve account.</p>
         <p style="font-size:12px;color:#64748b">This link expires in 24 hours.</p>`
      );
      return {
        subject,
        text: textParts.join("\n"),
        html: layout(
          { ...ctx, actionUrl: link, actionLabel: "Verify my email address" },
          htmlParts.join("")
        )
      };
    }
    case "PASSWORD_RESET": {
      const link = `${ctx.appUrl}/reset-password?token=${encodeURIComponent(ctx.token ?? "")}`;
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "A password reset was requested for your Campus Resolve account.",
        "",
        `Reset link: ${link}`,
        "",
        "The link expires in 60 minutes. If you did not request this, no action is required."
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>A password reset was requested for your Campus Resolve account.</p>
         <p style="font-size:12px;color:#64748b">This link expires in 60 minutes.</p>`
      );
      return {
        subject,
        text: textParts.join("\n"),
        html: layout(
          { ...ctx, actionUrl: link, actionLabel: "Reset my password" },
          htmlParts.join("")
        )
      };
    }
    case "STAFF_INVITATION": {
      const link = `${ctx.appUrl}/staff-invitation?token=${encodeURIComponent(ctx.token ?? "")}`;
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "You have been invited to join Campus Resolve as a staff member.",
        "",
        `Accept the invitation: ${link}`
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>You have been invited to join Campus Resolve as a staff member.</p>`
      );
      return {
        subject,
        text: textParts.join("\n"),
        html: layout(
          { ...ctx, actionUrl: link, actionLabel: "Accept your invitation" },
          htmlParts.join("")
        )
      };
    }
    case "REGISTRATION_CONFIRMED":
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "Your Campus Resolve account is ready. You can now report academic and administrative issues online.",
        "",
        "No report should disappear into an office, remain unaccounted for, or be marked resolved without a recorded action."
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>Your Campus Resolve account is ready. You can now report academic and administrative issues online and follow every update.</p>`
      );
      break;
    case "ACCOUNT_SUSPENDED":
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "Your Campus Resolve account has been suspended.",
        ctx.note ? `Reason: ${ctx.note}` : "",
        "",
        "Contact the platform administrator if you believe this is a mistake."
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>Your Campus Resolve account has been suspended.</p>
         ${ctx.note ? `<p>Reason: ${escapeHtml(ctx.note)}</p>` : ""}
         <p>Contact the platform administrator if you believe this is a mistake.</p>`
      );
      break;
    case "STAFF_REMINDER_DUE": {
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "A student report assigned to you has not received a meaningful update.",
        "",
        ticketSummaryText(ctx),
        "",
        "Please review the report and acknowledge it, begin the investigation, or record the appropriate next action.",
        buttonText(ctx),
        "",
        "This is an automated reminder from Campus Resolve."
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>A student report assigned to you has not received a meaningful update.</p>
         ${ticketSummaryHtml(ctx)}
         <p>Please review the report and acknowledge it, begin the investigation, or record the appropriate next action.</p>`
      );
      break;
    }
    case "STAFF_TICKET_ASSIGNED":
    case "STAFF_TICKET_REASSIGNED":
    case "STAFF_TICKET_QUEUED":
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        type === "STAFF_TICKET_REASSIGNED" ? "A ticket has been reassigned to you." : type === "STAFF_TICKET_QUEUED" ? "A ticket has been routed to your department queue." : "A ticket has been assigned to you.",
        "",
        ticketSummaryText(ctx),
        buttonText(ctx)
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${type === "STAFF_TICKET_REASSIGNED" ? "A ticket has been reassigned to you." : type === "STAFF_TICKET_QUEUED" ? "A ticket has been routed to your department queue." : "A ticket has been assigned to you."}</p>
         ${ticketSummaryHtml(ctx)}`
      );
      break;
    case "STAFF_TICKET_REPLIED":
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        "The student has replied on a ticket assigned to you.",
        "",
        ticketSummaryText(ctx),
        buttonText(ctx)
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>The student has replied on a ticket assigned to you.</p>
         ${ticketSummaryHtml(ctx)}`
      );
      break;
    case "STAFF_TICKET_ESCALATED":
    case "STAFF_SLA_BREACHED":
    case "STAFF_SLA_WARNING":
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        type === "STAFF_SLA_WARNING" ? "A ticket is approaching its service target." : "A ticket assigned to your department has been escalated.",
        "",
        ticketSummaryText(ctx),
        ctx.escalationLevel ? `- Escalation level: ${ctx.escalationLevel}` : "",
        buttonText(ctx)
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${type === "STAFF_SLA_WARNING" ? "A ticket is approaching its service target." : "A ticket assigned to your department has been escalated."}</p>
         ${ticketSummaryHtml(ctx)}`
      );
      break;
    case "SYSTEM_ADMIN_ALERT":
      textParts.push(
        `Hello ${ctx.recipientName},`,
        "",
        ctx.detail ?? "System notification",
        ctx.ticket ? `
${ticketSummaryText(ctx)}` : "",
        buttonText(ctx)
      );
      htmlParts.push(
        `<p>Hello ${escapeHtml(ctx.recipientName)},</p>
         <p>${escapeHtml(ctx.detail ?? "System notification")}</p>
         ${ctx.ticket ? ticketSummaryHtml(ctx) : ""}`
      );
      break;
    default: {
      const greeting = `Hello ${ctx.recipientName},`;
      const intro = {
        TICKET_SUBMITTED: "We have received your report. A reference number has been issued and the relevant department has been notified.",
        TICKET_ACKNOWLEDGED: "A department officer has acknowledged your report and will begin working on it.",
        TICKET_ASSIGNED: "Your report has been assigned to a responsible officer.",
        TICKET_REASSIGNED: "Your report has been reassigned to another officer. The full history is preserved.",
        TICKET_STATUS_CHANGED: "The status of your report has changed.",
        TICKET_INFO_REQUESTED: "The officer handling your report needs more information from you.",
        TICKET_REPLY: "There is a new reply on your report.",
        TICKET_ESCALATED: "Your report has been escalated to a higher authority.",
        TICKET_RESOLVED: "Your report has been marked as resolved. Please confirm if the issue is genuinely resolved.",
        TICKET_REOPENED: "Your report has been reopened and assigned a new action deadline.",
        TICKET_CLOSED: "Your report has been closed.",
        TICKET_WITHDRAWN: "Your report has been withdrawn.",
        FEEDBACK_REQUESTED: "Please rate the support you received so we can improve the service."
      };
      const conclusion = {
        TICKET_RESOLVED: "If the issue is still unresolved you can reopen the report or escalate it using the controls on the ticket page.",
        TICKET_INFO_REQUESTED: "Please respond on the ticket page so the investigation can continue.",
        FEEDBACK_REQUESTED: "Your feedback is anonymous to the department and helps improve the service."
      };
      textParts.push(greeting, "", intro[type] ?? "There is an update on your report.", "");
      if (ctx.ticket) textParts.push(ticketSummaryText(ctx), "");
      if (ctx.messageBody) {
        textParts.push("Message:", truncate(ctx.messageBody), "");
      }
      if (ctx.note) textParts.push(`Note: ${ctx.note}`, "");
      if (conclusion[type]) textParts.push(conclusion[type], "");
      textParts.push(buttonText(ctx));
      htmlParts.push(
        `<p>${escapeHtml(greeting)}</p>
         <p>${escapeHtml(intro[type] ?? "There is an update on your report.")}</p>
         ${ctx.ticket ? ticketSummaryHtml(ctx) : ""}
         ${ctx.messageBody ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;color:#334155">${escapeHtml(truncate(ctx.messageBody))}</blockquote>` : ""}
         ${ctx.note ? `<p>${escapeHtml(ctx.note)}</p>` : ""}
         ${conclusion[type] ? `<p>${escapeHtml(conclusion[type])}</p>` : ""}`
      );
      break;
    }
  }
  return {
    subject,
    text: textParts.filter((part) => part !== void 0).join("\n"),
    html: layout(ctx, htmlParts.join("\n"))
  };
}

// src/modules/notifications/notification.service.ts
async function queueNotification(input, client = prisma) {
  const existing = await client.notification.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });
  if (existing) {
    return { notification: existing, created: false };
  }
  let notification;
  try {
    notification = await client.notification.create({
      data: {
        recipientId: input.recipientId,
        ticketId: input.ticketId ?? null,
        type: input.type,
        channel: "EMAIL",
        status: "PENDING",
        idempotencyKey: input.idempotencyKey,
        payload: input.payload
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await client.notification.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (raced) return { notification: raced, created: false };
    }
    throw error;
  }
  await enqueueJob(
    "NOTIFICATION_DELIVERY",
    { notificationId: notification.id },
    { dedupeKey: `deliver:${notification.id}` },
    client
  );
  return { notification, created: true };
}
function asJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}
function buildTemplateContext(payload, recipientName) {
  const config = getConfig();
  const ticket = payload.referenceNumber ? {
    referenceNumber: payload.referenceNumber,
    subject: payload.ticketSubject ?? "",
    status: payload.status ?? "SUBMITTED",
    categoryName: payload.categoryName,
    departmentName: payload.departmentName,
    submittedAt: payload.submittedAt ? new Date(payload.submittedAt) : void 0,
    lastActionAt: payload.lastActionAt ? new Date(payload.lastActionAt) : void 0,
    nextAction: payload.nextAction,
    assignedOfficerName: payload.assignedOfficerName
  } : void 0;
  return {
    appUrl: config.APP_URL,
    institutionName: config.INSTITUTION_NAME,
    recipientName,
    ticket,
    actorName: payload.actorName,
    messageBody: payload.messageBody,
    token: payload.token,
    actionUrl: payload.referenceNumber ? ticketLink(config.APP_URL, payload.referenceNumber) : config.APP_URL,
    actionLabel: payload.referenceNumber ? "Open ticket" : "Open Campus Resolve",
    note: payload.note,
    dueAt: payload.dueAt ? new Date(payload.dueAt) : void 0,
    escalationLevel: payload.escalationLevel,
    detail: payload.detail
  };
}
async function deliverNotification(notificationId) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { recipient: true }
  });
  if (!notification) {
    return { sent: false, skipped: true, error: "Notification not found" };
  }
  if (notification.status === "SENT") {
    return {
      sent: true,
      skipped: true,
      providerMessageId: notification.providerMessageId ?? void 0
    };
  }
  if (notification.status === "SKIPPED") {
    return { sent: false, skipped: true, error: "Notification was skipped" };
  }
  const payload = notification.payload ?? {};
  const context = buildTemplateContext(payload, notification.recipient.fullName);
  const rendered = renderEmail(notification.type, context);
  const attemptNumber = notification.attemptCount + 1;
  try {
    const result = await getEmailProvider().send({
      to: notification.recipient.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: notification.idempotencyKey
    });
    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: clock.now(),
          providerMessageId: result.providerMessageId,
          attemptCount: attemptNumber,
          lastAttemptAt: clock.now(),
          lastError: null,
          payload: {
            ...asJsonObject(notification.payload),
            rendered: { subject: rendered.subject, text: rendered.text, html: rendered.html }
          }
        }
      }),
      prisma.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attemptNumber,
          status: "SENT",
          providerMessageId: result.providerMessageId
        }
      })
    ]);
    return { sent: true, skipped: false, providerMessageId: result.providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.$transaction([
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          attemptCount: attemptNumber,
          lastAttemptAt: clock.now(),
          lastError: message.slice(0, 2e3)
        }
      }),
      prisma.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attemptNumber,
          status: "FAILED",
          error: message.slice(0, 2e3)
        }
      })
    ]);
    logger.warn("Notification delivery failed", {
      notificationId: notification.id,
      type: notification.type,
      error: message
    });
    return { sent: false, skipped: false, error: message };
  }
}

// src/modules/reminders/service-target.service.ts
async function getServiceTarget(departmentId) {
  const config = getConfig();
  const record = await prisma.departmentServiceTarget.findUnique({
    where: { departmentId }
  });
  if (!record) {
    return {
      departmentId,
      firstResponseMinutes: config.SLA_FIRST_RESPONSE_MINUTES,
      resolutionMinutes: config.SLA_RESOLUTION_MINUTES,
      reminderIntervalMinutes: config.REMINDER_INTERVAL_MINUTES,
      maxReminders: config.MAX_REMINDERS,
      escalationAfterReminders: config.ESCALATION_AFTER_REMINDERS,
      businessHoursOnly: false,
      escalationUserId: null
    };
  }
  return {
    departmentId,
    firstResponseMinutes: record.firstResponseMinutes,
    resolutionMinutes: record.resolutionMinutes,
    reminderIntervalMinutes: record.reminderIntervalMinutes,
    maxReminders: record.maxReminders,
    escalationAfterReminders: record.escalationAfterReminders,
    businessHoursOnly: record.businessHoursOnly,
    escalationUserId: record.escalationUserId
  };
}
async function findEscalationRecipients(departmentId) {
  const recipients = /* @__PURE__ */ new Set();
  const target = await getServiceTarget(departmentId);
  if (target.escalationUserId) recipients.add(target.escalationUserId);
  const heads = await prisma.departmentMembership.findMany({
    where: {
      departmentId,
      departmentRole: "HEAD",
      isActive: true,
      user: { accountStatus: "ACTIVE" }
    },
    select: { userId: true }
  });
  for (const head of heads) recipients.add(head.userId);
  const admins = await prisma.user.findMany({
    where: {
      accountStatus: "ACTIVE",
      roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } } } }
    },
    select: { id: true }
  });
  for (const admin of admins) recipients.add(admin.id);
  return [...recipients];
}

// src/modules/reminders/reminder.service.ts
async function hasActiveAssignee(ticket) {
  if (!ticket.assignedToId) return false;
  const membership = await prisma.departmentMembership.findFirst({
    where: {
      userId: ticket.assignedToId,
      departmentId: ticket.departmentId,
      isActive: true,
      user: {
        accountStatus: "ACTIVE",
        roles: { some: { role: { name: { in: ["OFFICER", "DEPARTMENT_HEAD"] } } } }
      }
    },
    select: { id: true }
  });
  return membership !== null;
}

// src/jobs/handlers/reminder.handler.ts
var AWAITING_STAFF = /* @__PURE__ */ new Set([
  "SUBMITTED",
  "AWAITING_ASSIGNMENT",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "AWAITING_EXTERNAL",
  "ESCALATED",
  "REOPENED"
]);
async function handleReminderJob(payload) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      assignedTo: { select: { id: true, fullName: true } }
    }
  });
  if (!ticket) return { sent: false, skipped: true, reason: "Ticket not found" };
  const dueAtMs = new Date(payload.dueAt).getTime();
  if (ticket.reminderKind !== payload.kind) {
    return { sent: false, skipped: true, reason: "Reminder cycle changed" };
  }
  if (!ticket.nextReminderAt) {
    return { sent: false, skipped: true, reason: "Reminders are paused for this ticket" };
  }
  if (ticket.nextReminderAt.getTime() !== dueAtMs) {
    return {
      sent: false,
      skipped: true,
      reason: "A newer action deadline superseded this occurrence"
    };
  }
  if (!AWAITING_STAFF.has(ticket.status)) {
    return { sent: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (!ticket.assignedToId || !ticket.assignedTo) {
    return { sent: false, skipped: true, reason: "No responsible officer assigned" };
  }
  if (!await hasActiveAssignee(ticket)) {
    return {
      sent: false,
      skipped: true,
      reason: "Assignee is no longer an active officer of the department"
    };
  }
  const now = clock.now();
  let occurrenceCreated = false;
  try {
    await prisma.reminderOccurrence.create({
      data: {
        ticketId: ticket.id,
        kind: payload.kind,
        occurrenceKey: payload.occurrenceKey,
        dueAt: new Date(dueAtMs),
        status: "RUNNING",
        assignedOfficerId: ticket.assignedToId
      }
    });
    occurrenceCreated = true;
  } catch (error) {
    const existing = await prisma.reminderOccurrence.findUnique({
      where: { occurrenceKey: payload.occurrenceKey }
    });
    if (existing) {
      if (existing.status === "COMPLETED") {
        return { sent: false, skipped: true, reason: "Reminder already sent for this occurrence" };
      }
      if (existing.status === "RUNNING" && existing.assignedOfficerId === ticket.assignedToId) {
        return { sent: false, skipped: true, reason: "Reminder already in progress" };
      }
    } else {
      throw error;
    }
  }
  const target = await getServiceTarget(ticket.departmentId);
  const remindersSent = ticket.remindersSentInCycle + 1;
  const reachedLimit = remindersSent > target.maxReminders;
  const notification = await queueNotification({
    recipientId: ticket.assignedToId,
    ticketId: ticket.id,
    type: "STAFF_REMINDER_DUE",
    idempotencyKey: `reminder:${payload.occurrenceKey}`,
    payload: {
      referenceNumber: ticket.referenceNumber,
      status: ticket.status,
      ticketSubject: ticket.subject,
      categoryName: ticket.category.name,
      departmentName: ticket.department.name,
      submittedAt: ticket.createdAt.toISOString(),
      assignedOfficerName: ticket.assignedTo?.fullName,
      nextAction: payload.kind === "UNTOUCHED" ? "Acknowledge the report, begin the investigation, or record the next action." : "Record the next action so the ticket does not breach its service target.",
      reminderKind: payload.kind
    }
  });
  const nextReminderAt = reachedLimit ? null : new Date(now.getTime() + target.reminderIntervalMinutes * 6e4);
  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        lastReminderSentAt: now,
        remindersSentInCycle: remindersSent,
        nextReminderAt
      }
    }),
    prisma.reminderOccurrence.update({
      where: { occurrenceKey: payload.occurrenceKey },
      data: {
        status: "COMPLETED",
        completedAt: now,
        notificationId: notification.notification.id
      }
    }),
    prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: "REMINDER_SENT",
        newValue: String(remindersSent),
        reason: `${payload.kind === "UNTOUCHED" ? "Untouched-ticket" : "Next-action"} reminder sent to the responsible officer.`
      }
    })
  ]);
  if (nextReminderAt) {
    const nextOccurrenceKey = `${ticket.id}:${payload.kind}:${nextReminderAt.toISOString()}`;
    await prisma.job.create({
      data: {
        type: "TICKET_REMINDER",
        payload: {
          ticketId: ticket.id,
          kind: payload.kind,
          occurrenceKey: nextOccurrenceKey,
          dueAt: nextReminderAt.toISOString()
        },
        dedupeKey: `reminder:${payload.kind}:${nextOccurrenceKey}`,
        runAt: nextReminderAt
      }
    });
  }
  if (reachedLimit) {
    logger.warn("Reminder limit reached for ticket", { ticketId: ticket.id, remindersSent });
  }
  if (remindersSent >= target.escalationAfterReminders && target.escalationAfterReminders > 0) {
    await prisma.job.create({
      data: {
        type: "ESCALATION",
        payload: {
          ticketId: ticket.id,
          level: ticket.escalationLevel + 1,
          reason: `${remindersSent} reminders were sent without a meaningful staff action.`,
          source: "AUTO"
        },
        dedupeKey: `escalation:${ticket.id}:${ticket.escalationLevel + 1}`,
        runAt: now
      }
    });
  }
  return { sent: true, skipped: !occurrenceCreated };
}

// src/jobs/handlers/escalation.handler.ts
var INACTIVE = /* @__PURE__ */ new Set(["RESOLVED", "CLOSED", "WITHDRAWN"]);
async function handleEscalationJob(payload) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      assignedTo: { select: { id: true, fullName: true } }
    }
  });
  if (!ticket) return { escalated: false, skipped: true, reason: "Ticket not found" };
  if (INACTIVE.has(ticket.status)) {
    return { escalated: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (payload.source === "AUTO" && ticket.escalationLevel >= payload.level) {
    return { escalated: false, skipped: true, reason: "Already escalated to this level" };
  }
  const recipients = await findEscalationRecipients(ticket.departmentId);
  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const event = await tx.escalationEvent.create({
      data: {
        ticketId: ticket.id,
        level: payload.level,
        reason: payload.reason,
        source: payload.source,
        fromUserId: ticket.assignedToId,
        toUserId: recipients[0] ?? null,
        notifiedAt: now
      }
    });
    const data = {
      escalatedAt: now,
      escalationLevel: payload.level
    };
    if (canTransition(ticket.status, "ESCALATED")) {
      data.status = "ESCALATED";
    }
    await tx.ticket.update({ where: { id: ticket.id }, data });
    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: "ESCALATED",
        previousValue: ticket.status,
        newValue: data.status ?? ticket.status,
        reason: payload.reason
      }
    });
    const payloadContext = {
      referenceNumber: ticket.referenceNumber,
      status: data.status ?? ticket.status,
      ticketSubject: ticket.subject,
      categoryName: ticket.category.name,
      departmentName: ticket.department.name,
      submittedAt: ticket.createdAt.toISOString(),
      assignedOfficerName: ticket.assignedTo?.fullName,
      escalationLevel: payload.level
    };
    for (const recipientId of recipients) {
      await queueNotification(
        {
          recipientId,
          ticketId: ticket.id,
          type: "STAFF_TICKET_ESCALATED",
          idempotencyKey: `staff-escalated:${event.id}:${recipientId}`,
          payload: { ...payloadContext, note: payload.reason }
        },
        tx
      );
    }
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId: ticket.id,
        type: "TICKET_ESCALATED",
        idempotencyKey: `ticket-escalated:${event.id}`,
        payload: { ...payloadContext, note: payload.reason }
      },
      tx
    );
  });
  logger.warn("Ticket escalated", {
    ticketId: ticket.id,
    level: payload.level,
    recipients: recipients.length
  });
  return { escalated: true, skipped: false };
}
async function handleFirstResponseJob(payload) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      assignedTo: { select: { id: true, fullName: true } }
    }
  });
  if (!ticket) return { breached: false, skipped: true, reason: "Ticket not found" };
  if (INACTIVE.has(ticket.status)) {
    return { breached: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (ticket.firstResponseAt) {
    return { breached: false, skipped: true, reason: "First response already recorded" };
  }
  if (ticket.firstResponseOverdue) {
    return { breached: false, skipped: true, reason: "Already flagged as overdue" };
  }
  const target = await getServiceTarget(ticket.departmentId);
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { firstResponseOverdue: true }
    });
    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: "SLA_BREACHED",
        newValue: "FIRST_RESPONSE",
        reason: `First response target of ${target.firstResponseMinutes} minutes was exceeded.`
      }
    });
    const context = {
      referenceNumber: ticket.referenceNumber,
      status: ticket.status,
      ticketSubject: ticket.subject,
      categoryName: ticket.category.name,
      departmentName: ticket.department.name,
      submittedAt: ticket.createdAt.toISOString(),
      assignedOfficerName: ticket.assignedTo?.fullName,
      nextAction: "Respond to the student \u2014 the first-response target has been exceeded."
    };
    if (ticket.assignedToId) {
      await queueNotification(
        {
          recipientId: ticket.assignedToId,
          ticketId: ticket.id,
          type: "STAFF_SLA_BREACHED",
          idempotencyKey: `sla-first-response:${ticket.id}`,
          payload: context
        },
        tx
      );
    }
    const heads = await tx.departmentMembership.findMany({
      where: { departmentId: ticket.departmentId, departmentRole: "HEAD", isActive: true },
      select: { userId: true }
    });
    for (const head of heads) {
      await queueNotification(
        {
          recipientId: head.userId,
          ticketId: ticket.id,
          type: "STAFF_SLA_BREACHED",
          idempotencyKey: `sla-first-response:${ticket.id}:${head.userId}`,
          payload: context
        },
        tx
      );
    }
  });
  return { breached: true, skipped: false };
}
async function handleResolutionJob(payload) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: payload.ticketId },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      assignedTo: { select: { id: true, fullName: true } }
    }
  });
  if (!ticket) return { breached: false, skipped: true, reason: "Ticket not found" };
  if (INACTIVE.has(ticket.status)) {
    return { breached: false, skipped: true, reason: `Ticket is ${ticket.status}` };
  }
  if (ticket.resolutionOverdue) {
    return { breached: false, skipped: true, reason: "Already flagged as overdue" };
  }
  const target = await getServiceTarget(ticket.departmentId);
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: { resolutionOverdue: true }
    });
    await tx.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        actorId: null,
        actionType: "SLA_BREACHED",
        newValue: "RESOLUTION",
        reason: `Resolution target of ${target.resolutionMinutes} minutes was exceeded.`
      }
    });
  });
  await handleEscalationJob({
    ticketId: ticket.id,
    level: ticket.escalationLevel + 1,
    reason: `The resolution service target of ${target.resolutionMinutes} minutes was exceeded.`,
    source: "SLA"
  });
  logger.warn("Resolution service target breached", { ticketId: ticket.id });
  return { breached: true, skipped: false };
}

// src/jobs/handlers/index.ts
async function runJob(job) {
  const payload = job.payload ?? {};
  switch (job.type) {
    case "TICKET_REMINDER":
      return await handleReminderJob(payload);
    case "ESCALATION":
      return await handleEscalationJob(payload);
    case "SLA_FIRST_RESPONSE":
      return await handleFirstResponseJob({ ticketId: String(payload.ticketId) });
    case "SLA_RESOLUTION":
      return await handleResolutionJob({ ticketId: String(payload.ticketId) });
    case "NOTIFICATION_DELIVERY": {
      const notificationId = String(payload.notificationId);
      const result = await deliverNotification(notificationId);
      if (!result.sent && !result.skipped) {
        throw new Error(result.error ?? "Notification delivery failed");
      }
      return result;
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

// src/jobs/worker.ts
var Worker = class {
  workerId;
  pollIntervalMs;
  batchSize;
  running = false;
  timer = null;
  processed = 0;
  failed = 0;
  constructor(options = {}) {
    const config = getConfig();
    this.workerId = options.workerId ?? (config.WORKER_ID ? config.WORKER_ID : `${os.hostname()}-${process.pid}-${Date.now().toString(36)}`);
    this.pollIntervalMs = options.pollIntervalMs ?? config.WORKER_POLL_INTERVAL_MS;
    this.batchSize = options.batchSize ?? config.WORKER_BATCH_SIZE;
  }
  get stats() {
    return { processed: this.processed, failed: this.failed };
  }
  /** Processes one batch of due jobs. Returns the number of jobs handled. */
  async tick() {
    await recoverStaleJobs();
    const jobs = await claimJobs(this.workerId, this.batchSize);
    for (const job of jobs) {
      try {
        const result = await runJob(job);
        await completeJob(job.id, result);
        this.processed += 1;
      } catch (error) {
        this.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        const retry = job.attempts < job.maxAttempts;
        await failJob(job.id, message, retry);
      }
    }
    return jobs.length;
  }
  /** Drains the queue until no job is due. Used by tests and by the CLI. */
  async drain(maxIterations = 50) {
    let total = 0;
    for (let index = 0; index < maxIterations; index += 1) {
      const handled = await this.tick();
      total += handled;
      if (handled === 0) break;
    }
    return total;
  }
  async start() {
    if (this.running) return;
    this.running = true;
    await recoverStaleJobs();
    logger.info("Background worker started", {
      workerId: this.workerId,
      pollIntervalMs: this.pollIntervalMs
    });
    const loop = async () => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (error) {
        logger.error("Worker tick failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      if (!this.running) return;
      this.timer = setTimeout(loop, this.pollIntervalMs);
    };
    await loop();
  }
  async stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await prisma.job.updateMany({
      where: { lockedBy: this.workerId, status: "RUNNING" },
      data: { status: "PENDING", lockedBy: null, lockedAt: null }
    });
    logger.info("Background worker stopped", {
      workerId: this.workerId,
      at: clock.now().toISOString()
    });
  }
};

// src/jobs/worker-entry.ts
async function main() {
  const worker = new Worker();
  await worker.start();
  const shutdown = async (signal) => {
    logger.info("Worker received shutdown signal", { signal });
    await worker.stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
main().catch((error) => {
  logger.error("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : void 0
  });
  process.exit(1);
});
//# sourceMappingURL=worker-entry.js.map
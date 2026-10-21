var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config/env.ts
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import path from "path";
import fs from "fs";
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
function storageRoot() {
  const root = path.resolve(process.cwd(), getConfig().STORAGE_DIR);
  fs.mkdirSync(root, { recursive: true });
  return root;
}
var booleanish, optionalBooleanish, intish, csv, envSchema, cached;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    loadDotenv({ path: path.resolve(process.cwd(), ".env") });
    loadDotenv({ path: path.resolve(process.cwd(), "apps/api/.env") });
    booleanish = z.union([z.boolean(), z.string()]).transform(
      (value) => typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase())
    );
    optionalBooleanish = z.union([z.boolean(), z.string()]).optional().transform((value) => {
      if (value === void 0 || value === "") return void 0;
      if (typeof value === "boolean") return value;
      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    });
    intish = (fallback) => z.union([z.number(), z.string()]).optional().transform((value) => value === void 0 || value === "" ? fallback : Number(value)).pipe(z.number().int());
    csv = (fallback) => z.string().optional().transform(
      (value) => value === void 0 || value.trim() === "" ? fallback : value.split(",").map((item) => item.trim()).filter(Boolean)
    );
    envSchema = z.object({
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
    cached = null;
  }
});

// src/config/logger.ts
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
var ORDER, SENSITIVE_KEYS, logger;
var init_logger = __esm({
  "src/config/logger.ts"() {
    "use strict";
    init_env();
    ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
    SENSITIVE_KEYS = /* @__PURE__ */ new Set([
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
    logger = {
      debug: (message, context) => write("debug", message, context),
      info: (message, context) => write("info", message, context),
      warn: (message, context) => write("warn", message, context),
      error: (message, context) => write("error", message, context)
    };
  }
});

// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
var globalForPrisma, prisma;
var init_prisma = __esm({
  "src/lib/prisma.ts"() {
    "use strict";
    init_env();
    init_logger();
    globalForPrisma = globalThis;
    prisma = globalForPrisma.prisma ?? new PrismaClient({
      log: getConfig().NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
    if (getConfig().NODE_ENV !== "production") {
      globalForPrisma.prisma = prisma;
    }
  }
});

// src/config/clock.ts
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}
var override, clock, MINUTE_MS;
var init_clock = __esm({
  "src/config/clock.ts"() {
    "use strict";
    override = null;
    clock = {
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
    MINUTE_MS = 6e4;
  }
});

// src/modules/reminders/service-target.service.ts
var service_target_service_exports = {};
__export(service_target_service_exports, {
  addBusinessMinutes: () => addBusinessMinutes,
  computeDeadlines: () => computeDeadlines,
  findEscalationRecipients: () => findEscalationRecipients,
  findEscalationTarget: () => findEscalationTarget,
  getServiceTarget: () => getServiceTarget,
  nowUtc: () => nowUtc
});
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
async function loadBusinessHours(departmentId) {
  const rows = await prisma.departmentBusinessHour.findMany({
    where: { departmentId },
    select: { dayOfWeek: true, startMinute: true, endMinute: true }
  });
  return rows;
}
async function isHoliday(departmentId, date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const holiday = await prisma.departmentHoliday.findFirst({
    where: { departmentId, holidayDate: day },
    select: { id: true }
  });
  return holiday !== null;
}
async function addBusinessMinutes(departmentId, from, minutes, businessHoursOnly) {
  if (!businessHoursOnly) return addMinutes(from, minutes);
  const hours = await loadBusinessHours(departmentId);
  if (hours.length === 0) return addMinutes(from, minutes);
  const byDay = /* @__PURE__ */ new Map();
  for (const row of hours) {
    const list = byDay.get(row.dayOfWeek) ?? [];
    list.push(row);
    byDay.set(row.dayOfWeek, list);
  }
  let remaining = minutes;
  let cursor = new Date(from.getTime());
  for (let dayIndex = 0; dayIndex < 400 && remaining > 0; dayIndex += 1) {
    const dayOfWeek = cursor.getUTCDay();
    const windows = byDay.get(dayOfWeek) ?? [];
    if (windows.length > 0 && !await isHoliday(departmentId, cursor)) {
      for (const window of windows) {
        const windowStart = new Date(cursor);
        windowStart.setUTCHours(0, window.startMinute, 0, 0);
        const windowEnd = new Date(cursor);
        windowEnd.setUTCHours(0, window.endMinute, 0, 0);
        if (cursor >= windowEnd) continue;
        if (cursor < windowStart) cursor = new Date(windowStart);
        const available = Math.floor((windowEnd.getTime() - cursor.getTime()) / 6e4);
        if (available <= 0) continue;
        const consumed = Math.min(available, remaining);
        remaining -= consumed;
        cursor = new Date(cursor.getTime() + consumed * 6e4);
        if (remaining <= 0) break;
      }
    }
    const nextDay = new Date(cursor.getTime());
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextDay.setUTCHours(0, 0, 0, 0);
    cursor = nextDay;
  }
  return cursor;
}
async function computeDeadlines(departmentId, from) {
  const target = await getServiceTarget(departmentId);
  const firstResponseDueAt = await addBusinessMinutes(
    departmentId,
    from,
    target.firstResponseMinutes,
    target.businessHoursOnly
  );
  const resolutionDueAt = await addBusinessMinutes(
    departmentId,
    from,
    target.resolutionMinutes,
    target.businessHoursOnly
  );
  return { firstResponseDueAt, resolutionDueAt };
}
async function findEscalationTarget(departmentId) {
  const target = await getServiceTarget(departmentId);
  if (target.escalationUserId) {
    const user = await prisma.user.findUnique({
      where: { id: target.escalationUserId },
      select: { id: true, fullName: true, accountStatus: true }
    });
    if (user && user.accountStatus === "ACTIVE") {
      return { userId: user.id, name: user.fullName };
    }
  }
  const head = await prisma.departmentMembership.findFirst({
    where: {
      departmentId,
      departmentRole: "HEAD",
      isActive: true,
      user: { accountStatus: "ACTIVE" }
    },
    select: { userId: true, user: { select: { fullName: true } } }
  });
  if (head) return { userId: head.userId, name: head.user.fullName };
  const admin = await prisma.user.findFirst({
    where: {
      accountStatus: "ACTIVE",
      roles: { some: { role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } } } }
    },
    select: { id: true, fullName: true },
    orderBy: { createdAt: "asc" }
  });
  return { userId: admin?.id ?? null, name: admin?.fullName ?? null };
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
function nowUtc() {
  return clock.now();
}
var init_service_target_service = __esm({
  "src/modules/reminders/service-target.service.ts"() {
    "use strict";
    init_prisma();
    init_env();
    init_clock();
    init_clock();
  }
});

// src/app.ts
init_env();
init_logger();
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto3 from "crypto";

// src/modules/auth/session.service.ts
init_prisma();
init_env();

// src/lib/crypto.ts
import crypto from "crypto";
import { promisify } from "util";
var scrypt = promisify(crypto.scrypt);
var SCRYPT_N = 16384;
var SCRYPT_R = 8;
var SCRYPT_P = 1;
var KEY_LENGTH = 64;
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("hex"),
    derived.toString("hex")
  ].join("$");
}
async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
function hashToken(token, secret) {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}
function safeCompare(a, b) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}
function generateSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// src/modules/auth/session.service.ts
init_clock();

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
var INACTIVE_STATUSES = ["RESOLVED", "CLOSED", "WITHDRAWN"];
function canTransition(from, to) {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
function isInactiveStatus(status) {
  return INACTIVE_STATUSES.includes(status);
}
var REFERENCE_PREFIX = "CR";
function formatReference(year, sequence) {
  return `${REFERENCE_PREFIX}-${year}-${String(sequence).padStart(6, "0")}`;
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
var ROLE_PERMISSIONS = {
  STUDENT: STUDENT_PERMISSIONS,
  OFFICER: OFFICER_PERMISSIONS,
  DEPARTMENT_HEAD: DEPARTMENT_HEAD_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS
};
var STAFF_ROLES = [
  "OFFICER",
  "DEPARTMENT_HEAD",
  "ADMIN",
  "SUPER_ADMIN"
];
function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}
function isAdminRole(role) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}
var ASSIGNABLE_ROLES = {
  STUDENT: ["STUDENT"],
  OFFICER: ["STUDENT", "OFFICER"],
  DEPARTMENT_HEAD: ["STUDENT", "OFFICER", "DEPARTMENT_HEAD"],
  ADMIN: ["STUDENT", "OFFICER", "DEPARTMENT_HEAD", "ADMIN"],
  SUPER_ADMIN: ["STUDENT", "OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"]
};

// ../../packages/shared/src/api.ts
var DEFAULT_PAGE_SIZE = 20;
var MAX_PAGE_SIZE = 100;

// ../../packages/shared/src/schemas.ts
import { z as z2 } from "zod";
var STUDENT_EMAIL_LOCAL_PART = /^[0-9]{4,20}$/;
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
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

// src/modules/auth/session.service.ts
var SESSION_COOKIE = getConfig().SESSION_COOKIE_NAME;
var CSRF_COOKIE = getConfig().CSRF_COOKIE_NAME;
async function createSession(userId, meta = {}) {
  const config = getConfig();
  const sessionToken = generateSessionToken();
  const csrfToken = generateSessionToken();
  const expiresAt = new Date(clock.nowMs() + config.SESSION_TTL_HOURS * 36e5);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(sessionToken, config.SESSION_SECRET),
      csrfTokenHash: hashToken(csrfToken, config.SESSION_SECRET),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null
    }
  });
  return { sessionId: session.id, sessionToken, csrfToken, expiresAt };
}
async function revokeSession(sessionId) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: clock.now() }
  });
}
async function resolveSession(sessionToken) {
  const config = getConfig();
  const tokenHash = hashToken(sessionToken, config.SESSION_SECRET);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
          memberships: { include: { department: true } }
        }
      }
    }
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= clock.nowMs()) return null;
  if (session.user.accountStatus === "DEACTIVATED") return null;
  const roles = session.user.roles.map((entry) => entry.role.name);
  const permissions = /* @__PURE__ */ new Set();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) permissions.add(permission);
  }
  const auth = {
    userId: session.user.id,
    sessionId: session.id,
    email: session.user.email,
    fullName: session.user.fullName,
    studentId: session.user.studentId,
    emailVerified: session.user.emailVerifiedAt !== null,
    accountStatus: session.user.accountStatus,
    roles,
    permissions,
    departments: session.user.memberships.map((membership) => ({
      departmentId: membership.departmentId,
      departmentName: membership.department.name,
      departmentRole: membership.departmentRole,
      isActive: membership.isActive
    })),
    lastLoginAt: session.user.lastLoginAt
  };
  return { auth, sessionTokenHash: tokenHash };
}
function verifyCsrfToken(sessionCsrfHash, presentedToken) {
  if (!presentedToken) return false;
  const config = getConfig();
  return safeCompare(sessionCsrfHash, hashToken(presentedToken, config.SESSION_SECRET));
}
function cookieIsSecure(config) {
  return config.COOKIE_SECURE ?? config.NODE_ENV === "production";
}
function setSessionCookies(res, session) {
  const config = getConfig();
  const secure = cookieIsSecure(config);
  const base = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/"
  };
  res.cookie(SESSION_COOKIE, session.sessionToken, {
    ...base,
    expires: session.expiresAt
  });
  res.cookie(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt
  });
}
function clearSessionCookies(res) {
  const config = getConfig();
  const secure = cookieIsSecure(config);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure, sameSite: "lax", path: "/" });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure, sameSite: "lax", path: "/" });
}
function attachSession(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    next();
    return;
  }
  resolveSession(token).then((resolved) => {
    if (resolved) req.auth = resolved.auth;
    next();
  }).catch(() => next());
}

// src/lib/errors.ts
var AppError = class extends Error {
  status;
  code;
  details;
  expose;
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
};
var badRequest = (message, details) => new AppError(400, "VALIDATION_ERROR", message, details);
var validationError = (details) => new AppError(422, "VALIDATION_ERROR", "The submitted data is invalid.", details);
var unauthenticated = (message = "Authentication is required.") => new AppError(401, "UNAUTHENTICATED", message);
var forbidden = (message = "You do not have permission to perform this action.") => new AppError(403, "FORBIDDEN", message);
var notFound = (message = "The requested resource was not found.") => new AppError(404, "NOT_FOUND", message);
var conflict = (message) => new AppError(409, "CONFLICT", message);
var invalidTransition = (message) => new AppError(409, "INVALID_TRANSITION", message);
var rateLimited = (message = "Too many requests. Please try again later.") => new AppError(429, "RATE_LIMITED", message);
var emailNotVerified = () => new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your institutional email address to continue.");
var accountSuspended = () => new AppError(
  403,
  "ACCOUNT_SUSPENDED",
  "This account has been suspended. Contact the administrator."
);
var accountLocked = (message = "This account is temporarily locked. Try again later.") => new AppError(423, "ACCOUNT_LOCKED", message);
var payloadTooLarge = (message = "The uploaded file is too large.") => new AppError(413, "PAYLOAD_TOO_LARGE", message);
var unsupportedMediaType = (message = "This file type is not supported.") => new AppError(415, "UNSUPPORTED_MEDIA_TYPE", message);
var csrfFailed = () => new AppError(403, "CSRF_FAILED", "Invalid or missing CSRF token.");

// src/middleware/auth.ts
init_env();
init_prisma();
function requireAuth(req, _res, next) {
  if (!req.auth) {
    next(unauthenticated());
    return;
  }
  if (req.auth.accountStatus === "SUSPENDED") {
    next(accountSuspended());
    return;
  }
  next();
}
function requireVerifiedEmail(req, _res, next) {
  if (!req.auth) {
    next(unauthenticated());
    return;
  }
  if (!req.auth.emailVerified) {
    next(emailNotVerified());
    return;
  }
  next();
}
function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthenticated());
      return;
    }
    if (!req.auth.permissions.has(permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}
function csrfProtection(req, _res, next) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }
  if (!req.auth) {
    next();
    return;
  }
  const header = req.get("x-csrf-token") ?? void 0;
  void prisma.session.findUnique({ where: { id: req.auth.sessionId }, select: { csrfTokenHash: true } }).then((session) => {
    if (!session || !verifyCsrfToken(session.csrfTokenHash, header)) {
      next(csrfFailed());
      return;
    }
    next();
  }).catch(() => next(csrfFailed()));
}
function originGuard(req, _res, next) {
  const config = getConfig();
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  if (!config.CORS_ORIGINS.includes(origin)) {
    next(forbidden("Origin is not allowed."));
    return;
  }
  next();
}

// src/middleware/rateLimit.ts
init_clock();
var registry = /* @__PURE__ */ new Set();
function createRateLimiter(options) {
  const buckets = /* @__PURE__ */ new Map();
  registry.add(buckets);
  const keyFn = options.key ?? ((req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : void 0) ?? req.socket.remoteAddress ?? "unknown";
    return `${req.method}:${req.path}:${ip}`;
  });
  return function rateLimit(req, res, next) {
    const now = clock.nowMs();
    const key = keyFn(req);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader("X-RateLimit-Limit", String(options.max));
      res.setHeader("X-RateLimit-Remaining", String(options.max - 1));
      next();
      return;
    }
    if (options.skipSuccessful && res.statusCode < 400) {
      next();
      return;
    }
    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1e3)));
    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1e3);
      res.setHeader("Retry-After", String(retryAfter));
      next(rateLimited(options.message ?? "Too many requests. Please try again later."));
      return;
    }
    next();
  };
}

// src/middleware/errorHandler.ts
import { ZodError } from "zod";
init_logger();

// src/middleware/validate.ts
function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(validationError(formatZodError(result.error)));
      return;
    }
    if (source === "query") {
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } else {
      req[source] = result.data;
    }
    next();
  };
}
function formatZodError(error) {
  const details = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
    details[key] = details[key] ?? [];
    details[key].push(issue.message);
  }
  return details;
}

// src/middleware/errorHandler.ts
import { Prisma } from "@prisma/client";
function notFoundHandler(_req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint does not exist."
    }
  });
}
function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...error.details ? { details: error.details } : {},
        ...req.requestId ? { requestId: req.requestId } : {}
      }
    });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The submitted data is invalid.",
        details: formatZodError(error),
        ...req.requestId ? { requestId: req.requestId } : {}
      }
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "A record with these details already exists.",
          ...req.requestId ? { requestId: req.requestId } : {}
        }
      });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          ...req.requestId ? { requestId: req.requestId } : {}
        }
      });
      return;
    }
  }
  const status = typeof error?.status === "number" ? error.status : 500;
  const code = typeof error?.code === "string" ? error.code : "INTERNAL_ERROR";
  const message = status === 429 ? "Too many requests. Please try again later." : "An unexpected error occurred. The incident has been logged.";
  logger.error("Unhandled request error", {
    method: req.method,
    path: req.path,
    status,
    code,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : void 0,
    requestId: req.requestId
  });
  res.status(status).json({
    error: {
      code,
      message,
      ...req.requestId ? { requestId: req.requestId } : {}
    }
  });
}

// src/app.ts
init_prisma();

// src/lib/router.ts
import {
  Router
} from "express";
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
function createRouter() {
  const router = Router();
  const methods = ["get", "post", "put", "patch", "delete", "all"];
  for (const method of methods) {
    const original = router[method].bind(router);
    router[method] = (path3, ...handlers) => original(path3, ...handlers.map((handler) => asyncHandler(handler)));
  }
  return router;
}

// src/routes/auth.routes.ts
init_env();

// src/lib/request.ts
function requestMeta(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress = (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : void 0) ?? req.socket.remoteAddress ?? void 0;
  const userAgent = req.get("user-agent") ?? void 0;
  return { ipAddress, userAgent };
}

// src/modules/auth/auth.service.ts
init_prisma();
init_clock();
init_env();

// src/modules/notifications/notification.service.ts
init_prisma();
init_clock();
init_env();
init_logger();

// src/jobs/queue.ts
init_prisma();
init_clock();
init_logger();
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

// src/modules/notifications/email.provider.ts
init_env();
init_logger();

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
async function listNotifications(recipientId, limit = 50) {
  return prisma.notification.findMany({
    where: { recipientId, channel: "EMAIL" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      ticketId: true,
      createdAt: true,
      sentAt: true,
      payload: true
    }
  });
}

// src/modules/auth/auth.service.ts
var VERIFICATION_TTL_MS = 24 * 36e5;
var RESET_TTL_MS = 60 * 6e4;
var MAX_FAILED_LOGINS = 8;
var LOCK_DURATION_MS = 15 * 6e4;
function isInstitutionalDomain(email) {
  const config = getConfig();
  const domain = normalizeEmail(email).split("@")[1] ?? "";
  return config.INSTITUTION_EMAIL_DOMAINS.some(
    (allowed) => allowed.toLowerCase() === domain.toLowerCase()
  );
}
function deriveStudentId(email) {
  const local = normalizeEmail(email).split("@")[0] ?? "";
  return STUDENT_EMAIL_LOCAL_PART.test(local) ? local : null;
}
async function registerStudent(input) {
  const config = getConfig();
  const email = normalizeEmail(input.email);
  if (!isInstitutionalDomain(email)) {
    throw badRequest(
      `Registration requires an institutional email address (${config.INSTITUTION_EMAIL_DOMAINS.join(", ")}).`
    );
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw conflict("An account already exists for this email address.");
  }
  const studentId = input.studentId?.trim() || deriveStudentId(email);
  if (studentId) {
    const existingStudent = await prisma.user.findUnique({ where: { studentId } });
    if (existingStudent) {
      throw conflict("This student ID is already registered.");
    }
  }
  const passwordHash = await hashPassword(input.password);
  const token = generateToken();
  const now = clock.now();
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        studentId,
        passwordHash,
        accountStatus: "PENDING_VERIFICATION"
      }
    });
    const role = await tx.role.findUnique({ where: { name: "STUDENT" } });
    if (role) {
      await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
    }
    await tx.emailVerificationToken.create({
      data: {
        userId: created.id,
        tokenHash: hashToken(token, config.SESSION_SECRET),
        expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS)
      }
    });
    await queueNotification(
      {
        recipientId: created.id,
        type: "EMAIL_VERIFICATION",
        idempotencyKey: `email-verification:${created.id}`,
        payload: { token, detail: "Please verify your institutional email address." }
      },
      tx
    );
    return created;
  });
  return { user, token };
}
async function verifyEmail(token) {
  const config = getConfig();
  const tokenHash = hashToken(token, config.SESSION_SECRET);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= clock.nowMs()) {
    throw badRequest("This verification link is invalid or has expired.");
  }
  const now = clock.now();
  const user = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now }
    });
    const updated = await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: now, accountStatus: "ACTIVE" }
    });
    await queueNotification(
      {
        recipientId: updated.id,
        type: "REGISTRATION_CONFIRMED",
        idempotencyKey: `registration-confirmed:${updated.id}`,
        payload: {}
      },
      tx
    );
    return updated;
  });
  return { email: user.email, fullName: user.fullName };
}
async function resendVerification(email) {
  const config = getConfig();
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || user.emailVerifiedAt) return;
  if (!isInstitutionalDomain(normalized)) return;
  const token = generateToken();
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token, config.SESSION_SECRET),
        expiresAt: new Date(clock.nowMs() + VERIFICATION_TTL_MS)
      }
    });
    await queueNotification(
      {
        recipientId: user.id,
        type: "EMAIL_VERIFICATION",
        idempotencyKey: `email-verification-resend:${user.id}:${token.slice(0, 8)}`,
        payload: { token }
      },
      tx
    );
  });
}
async function login(email, password, meta = {}) {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  const genericFailure = badRequest("The email address or password is incorrect.");
  if (!user) {
    await verifyPassword(password, "scrypt$16384$8$1$00$00");
    throw genericFailure;
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > clock.nowMs()) {
    throw accountLocked(
      "This account is temporarily locked after too many failed attempts. Try again later."
    );
  }
  if (user.accountStatus === "SUSPENDED") throw accountSuspended();
  if (user.accountStatus === "DEACTIVATED") {
    throw forbidden("This account has been deactivated.");
  }
  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(clock.nowMs() + LOCK_DURATION_MS) : null
      }
    });
    throw genericFailure;
  }
  if (!user.emailVerifiedAt) {
    throw emailNotVerified();
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: clock.now() }
  });
  const session = await createSession(user.id, meta);
  return {
    user,
    sessionId: session.sessionId,
    sessionToken: session.sessionToken,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt
  };
}
async function logout(sessionId) {
  await revokeSession(sessionId);
}
async function requestPasswordReset(email) {
  const config = getConfig();
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.emailVerifiedAt) return;
  const token = generateToken();
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token, config.SESSION_SECRET),
        expiresAt: new Date(clock.nowMs() + RESET_TTL_MS)
      }
    });
    await queueNotification(
      {
        recipientId: user.id,
        type: "PASSWORD_RESET",
        idempotencyKey: `password-reset:${user.id}:${token.slice(0, 8)}`,
        payload: { token }
      },
      tx
    );
  });
}
async function resetPassword(token, newPassword) {
  const config = getConfig();
  const tokenHash = hashToken(token, config.SESSION_SECRET);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= clock.nowMs()) {
    throw badRequest("This password reset link is invalid or has expired.");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: clock.now() } });
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null }
    });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: clock.now() }
    });
  });
}
async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("Account not found.");
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw badRequest("The current password is incorrect.");
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null }
  });
}
async function acceptInvitation(token, password) {
  const config = getConfig();
  const tokenHash = hashToken(token, config.SESSION_SECRET);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
  if (!record || record.usedAt || record.expiresAt.getTime() <= clock.nowMs()) {
    throw badRequest("This invitation link is invalid or has expired.");
  }
  if (!record.user.invitedById) {
    throw badRequest("This link is not a staff invitation.");
  }
  if (record.user.accountStatus === "SUSPENDED" || record.user.accountStatus === "DEACTIVATED") {
    throw accountSuspended();
  }
  const now = clock.now();
  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: now }
    });
    const updated = await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        accountStatus: "ACTIVE",
        failedLoginCount: 0,
        lockedUntil: null
      }
    });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now }
    });
    await queueNotification(
      {
        recipientId: updated.id,
        type: "REGISTRATION_CONFIRMED",
        idempotencyKey: `registration-confirmed:${updated.id}`,
        payload: {}
      },
      tx
    );
    return updated;
  });
  return { email: user.email, fullName: user.fullName };
}
function toSessionUser(auth) {
  return {
    id: auth.userId,
    email: auth.email,
    fullName: auth.fullName,
    studentId: auth.studentId,
    emailVerified: auth.emailVerified,
    accountStatus: auth.accountStatus,
    roles: auth.roles,
    permissions: [...auth.permissions],
    departments: auth.departments.map((scope) => ({
      departmentId: scope.departmentId,
      departmentName: scope.departmentName,
      departmentRole: scope.departmentRole
    })),
    lastLoginAt: auth.lastLoginAt,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/routes/auth.routes.ts
var authRouter = createRouter();
var loginLimiter = createRateLimiter({
  windowMs: getConfig().LOGIN_RATE_LIMIT_WINDOW_MS,
  max: getConfig().LOGIN_RATE_LIMIT_MAX,
  key: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : void 0) ?? req.socket.remoteAddress ?? "unknown";
    return `login:${ip}`;
  },
  message: "Too many sign-in attempts. Please try again later."
});
var passwordResetLimiter = createRateLimiter({
  windowMs: getConfig().PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  max: getConfig().PASSWORD_RESET_RATE_LIMIT_MAX,
  key: (req) => `password-reset:${req.ip}`,
  message: "Too many password reset requests. Please try again later."
});
var verificationLimiter = createRateLimiter({
  windowMs: getConfig().PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  max: getConfig().PASSWORD_RESET_RATE_LIMIT_MAX,
  key: (req) => `verification:${req.ip}`,
  message: "Too many verification emails requested. Please try again later."
});
var validationLimiter = createRateLimiter({
  windowMs: getConfig().PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  max: getConfig().PASSWORD_RESET_RATE_LIMIT_MAX,
  key: (req) => `validation:${req.ip}`,
  message: "Too many attempts. Please try again later."
});
authRouter.post("/register", verificationLimiter, validate(registerSchema), async (req, res) => {
  const result = await registerStudent(req.body);
  res.status(201).json({
    id: result.user.id,
    email: result.user.email,
    fullName: result.user.fullName,
    studentId: result.user.studentId,
    emailVerified: false,
    message: "Check your institutional inbox to verify your email address."
  });
});
authRouter.post("/verify-email", validate(verifyEmailSchema), async (req, res) => {
  const result = await verifyEmail(req.body.token);
  res.json({ verified: true, email: result.email, fullName: result.fullName });
});
authRouter.post(
  "/resend-verification",
  verificationLimiter,
  validate(resendVerificationSchema),
  async (req, res) => {
    await resendVerification(req.body.email);
    res.json({ message: "If the account exists and is unverified, a new link has been sent." });
  }
);
authRouter.post(
  "/accept-invitation",
  validationLimiter,
  validate(acceptInvitationSchema),
  async (req, res) => {
    const result = await acceptInvitation(req.body.token, req.body.password);
    res.json({
      email: result.email,
      fullName: result.fullName,
      message: "Your staff account is active. You can sign in now."
    });
  }
);
authRouter.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const result = await login(req.body.email, req.body.password, requestMeta(req));
  setSessionCookies(res, {
    sessionId: result.sessionId,
    sessionToken: result.sessionToken,
    csrfToken: result.csrfToken,
    expiresAt: result.expiresAt
  });
  res.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      studentId: result.user.studentId,
      emailVerified: result.user.emailVerifiedAt !== null,
      accountStatus: result.user.accountStatus
    }
  });
});
authRouter.post("/logout", requireAuth, async (req, res) => {
  await logout(req.auth.sessionId);
  clearSessionCookies(res);
  res.json({ message: "Signed out." });
});
authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: toSessionUser(req.auth) });
});
authRouter.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  async (req, res) => {
    await requestPasswordReset(req.body.email);
    res.json({ message: "If the account exists, a password reset link has been sent." });
  }
);
authRouter.post(
  "/reset-password",
  passwordResetLimiter,
  validate(resetPasswordSchema),
  async (req, res) => {
    await resetPassword(req.body.token, req.body.password);
    res.json({ message: "Your password has been updated. You can sign in now." });
  }
);
authRouter.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  async (req, res) => {
    await changePassword(
      req.auth.userId,
      req.body.currentPassword,
      req.body.newPassword
    );
    res.json({ message: "Password updated." });
  }
);

// src/routes/tickets.routes.ts
import multer from "multer";
init_env();

// src/modules/tickets/ticket.service.ts
init_prisma();
init_clock();
init_env();

// src/lib/pagination.ts
function resolvePagination(options = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
function paginate(items, total, options = {}) {
  const { page, pageSize } = resolvePagination(options);
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

// src/modules/tickets/ticket.service.ts
init_service_target_service();

// src/modules/tickets/routing.service.ts
init_prisma();
async function resolveRouting(params) {
  const notes = [];
  const category = await prisma.category.findUnique({
    where: { id: params.categoryId },
    select: { id: true, name: true, departmentId: true, isActive: true }
  });
  if (!category || !category.isActive) {
    throw notFound("The selected issue category is not available.");
  }
  const requestedDepartment = await prisma.department.findUnique({
    where: { id: params.departmentId },
    select: { id: true, name: true, isActive: true }
  });
  if (!requestedDepartment || !requestedDepartment.isActive) {
    throw notFound("The selected department is not available.");
  }
  let departmentId = requestedDepartment.id;
  if (category.departmentId && category.departmentId !== requestedDepartment.id) {
    const categoryDepartment = await prisma.department.findUnique({
      where: { id: category.departmentId },
      select: { id: true, name: true, isActive: true }
    });
    if (categoryDepartment?.isActive) {
      departmentId = categoryDepartment.id;
      notes.push(
        `Routed to ${categoryDepartment.name} because the category "${category.name}" is handled by that department.`
      );
    }
  }
  if (params.useTriageQueue) {
    notes.push("Sent to the department queue for triage.");
    const decision = await applyFallbackIfEmpty(departmentId, notes);
    return { ...decision, assignedToId: null, source: "TRIAGE", notes };
  }
  let assignedToId = null;
  if (params.requestedOfficerId) {
    if (!params.allowStudentOfficerSelection) {
      notes.push("Direct officer selection is disabled; the ticket goes to the department queue.");
    } else {
      const eligible = await prisma.departmentMembership.findFirst({
        where: {
          departmentId,
          userId: params.requestedOfficerId,
          isActive: true,
          user: {
            accountStatus: "ACTIVE",
            roles: { some: { role: { name: { in: ["OFFICER", "DEPARTMENT_HEAD"] } } } }
          }
        },
        select: { id: true }
      });
      if (eligible) {
        assignedToId = params.requestedOfficerId;
      } else {
        notes.push(
          "The selected officer is not available for this department; the ticket goes to the department queue."
        );
      }
    }
  }
  if (!assignedToId) {
    const hasOfficers = await prisma.departmentMembership.findFirst({
      where: {
        departmentId,
        isActive: true,
        user: {
          accountStatus: "ACTIVE",
          roles: { some: { role: { name: { in: ["OFFICER", "DEPARTMENT_HEAD"] } } } }
        }
      },
      select: { id: true }
    });
    if (!hasOfficers) {
      const decision = await applyFallbackIfEmpty(departmentId, notes);
      return { ...decision, assignedToId: null, source: "TRIAGE", notes };
    }
  }
  return {
    departmentId,
    assignedToId,
    source: "STUDENT",
    usedFallbackQueue: false,
    notes
  };
}
async function applyFallbackIfEmpty(departmentId, notes) {
  const hasOfficers = await prisma.departmentMembership.findFirst({
    where: {
      departmentId,
      isActive: true,
      user: {
        accountStatus: "ACTIVE",
        roles: { some: { role: { name: { in: ["OFFICER", "DEPARTMENT_HEAD"] } } } }
      }
    },
    select: { id: true }
  });
  if (hasOfficers) return { departmentId, usedFallbackQueue: false };
  const fallback = await prisma.department.findFirst({
    where: { isFallbackQueue: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true }
  });
  if (fallback && fallback.id !== departmentId) {
    notes.push(`${fallback.name} will triage this report because no active officer was available.`);
    return { departmentId: fallback.id, usedFallbackQueue: true };
  }
  notes.push(
    "No active officer was available. The report has been flagged for administrative assignment."
  );
  return { departmentId, usedFallbackQueue: false };
}
async function listSelectableOfficers(departmentId) {
  return prisma.departmentMembership.findMany({
    where: {
      departmentId,
      isActive: true,
      user: {
        accountStatus: "ACTIVE",
        roles: { some: { role: { name: { in: ["OFFICER", "DEPARTMENT_HEAD"] } } } }
      }
    },
    select: {
      id: true,
      departmentRole: true,
      user: { select: { id: true, fullName: true } }
    },
    orderBy: { user: { fullName: "asc" } }
  });
}

// src/modules/auth/auth.types.ts
function isInDepartment(auth, departmentId) {
  return auth.departments.some((scope) => scope.departmentId === departmentId && scope.isActive);
}
function headsDepartment(auth, departmentId) {
  return auth.departments.some(
    (scope) => scope.departmentId === departmentId && scope.departmentRole === "HEAD" && scope.isActive
  );
}

// src/modules/tickets/ticket.policy.ts
function isOwner(auth, ticket) {
  return auth.userId === ticket.studentId;
}
function isDepartmentStaff(auth, ticket) {
  return auth.roles.some((role) => isStaffRole(role)) && isInDepartment(auth, ticket.departmentId);
}
function isCurrentAssignee(auth, ticket) {
  return ticket.assignedToId !== null && ticket.assignedToId === auth.userId;
}
function isGlobalAdmin(auth) {
  return auth.roles.some((role) => isAdminRole(role));
}
function canViewTicket(auth, ticket) {
  if (isOwner(auth, ticket)) return true;
  if (isGlobalAdmin(auth)) return true;
  if (isDepartmentStaff(auth, ticket)) return true;
  return auth.permissions.has("ticket:read:any");
}
function canReply(auth, ticket) {
  if (isOwner(auth, ticket)) return true;
  if (isGlobalAdmin(auth)) return true;
  if (isCurrentAssignee(auth, ticket)) return true;
  return isDepartmentStaff(auth, ticket);
}
function canAddInternalNote(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  if (isCurrentAssignee(auth, ticket)) return true;
  return isDepartmentStaff(auth, ticket);
}
function canChangeStatus(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  return isCurrentAssignee(auth, ticket) || isDepartmentStaff(auth, ticket);
}
function canAssign(auth, ticket, targetUserId) {
  if (isGlobalAdmin(auth)) return true;
  if (headsDepartment(auth, ticket.departmentId)) return true;
  if (targetUserId !== auth.userId) return false;
  if (!isDepartmentStaff(auth, ticket)) return false;
  return ticket.assignedToId === null || ticket.assignedToId === auth.userId;
}
function canReassign(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  if (headsDepartment(auth, ticket.departmentId)) return true;
  return isCurrentAssignee(auth, ticket);
}
function canResolve(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  return isCurrentAssignee(auth, ticket) || isDepartmentStaff(auth, ticket);
}
function canEscalate(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  if (isDepartmentStaff(auth, ticket)) return true;
  return auth.permissions.has("ticket:escalate:request");
}
function canReopen(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  if (auth.permissions.has("ticket:reopen:manage") && isDepartmentStaff(auth, ticket)) return true;
  return auth.permissions.has("ticket:reopen:request");
}
function canWithdraw(auth, ticket) {
  if (isGlobalAdmin(auth)) return true;
  if (!isOwner(auth, ticket)) return false;
  return ["SUBMITTED", "AWAITING_ASSIGNMENT"].includes(ticket.status);
}
function canUploadAttachment(auth, ticket) {
  if (isOwner(auth, ticket)) return true;
  if (isGlobalAdmin(auth)) return true;
  return isDepartmentStaff(auth, ticket);
}
function canDownloadAttachment(auth, ticket) {
  return canViewTicket(auth, ticket);
}
function canGiveFeedback(auth, ticket) {
  return isOwner(auth, ticket) && ["RESOLVED", "CLOSED"].includes(ticket.status);
}
function studentMayReopen(ticket) {
  return ticket.status === "RESOLVED";
}
function studentMayEscalate(ticket) {
  return ["ASSIGNED", "ACKNOWLEDGED", "IN_PROGRESS", "AWAITING_EXTERNAL"].includes(ticket.status);
}

// src/modules/tickets/ticket.service.ts
var MIN_SUBSTANTIVE_NOTE_LENGTH = 10;
async function nextReference(tx) {
  const year = clock.now().getUTCFullYear();
  const name = `ticket_reference_${year}`;
  const rows = await tx.$queryRaw`
    INSERT INTO counters (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = counters.value + 1
    RETURNING value;
  `;
  const sequence = Number(rows[0]?.value ?? 1);
  return formatReference(year, sequence);
}
async function scheduleReminderJob(tx, ticketId, kind, dueAt) {
  const occurrenceKey = `${ticketId}:${kind}:${dueAt.toISOString()}`;
  await tx.job.upsert({
    where: { dedupeKey: `reminder:${kind}:${occurrenceKey}` },
    create: {
      type: "TICKET_REMINDER",
      payload: { ticketId, kind, occurrenceKey, dueAt: dueAt.toISOString() },
      dedupeKey: `reminder:${kind}:${occurrenceKey}`,
      runAt: dueAt
    },
    update: {}
  });
}
async function writeHistory(tx, data) {
  return tx.ticketHistory.create({
    data: {
      ticketId: data.ticketId,
      actorId: data.actorId,
      actionType: data.actionType,
      previousValue: data.previousValue ?? null,
      newValue: data.newValue ?? null,
      reason: data.reason ?? null,
      metadata: data.metadata ?? void 0
    }
  });
}
async function buildPayloadContext(tx, ticket) {
  const [category, department, assignee] = await Promise.all([
    tx.category.findUnique({ where: { id: ticket.categoryId }, select: { name: true } }),
    tx.department.findUnique({ where: { id: ticket.departmentId }, select: { name: true } }),
    ticket.assignedToId ? tx.user.findUnique({ where: { id: ticket.assignedToId }, select: { fullName: true } }) : Promise.resolve(null)
  ]);
  return {
    referenceNumber: ticket.referenceNumber,
    status: ticket.status,
    ticketSubject: ticket.subject,
    categoryName: category?.name ?? "General",
    departmentName: department?.name ?? "Unassigned",
    submittedAt: ticket.createdAt.toISOString(),
    assignedOfficerName: assignee?.fullName
  };
}
async function createTicket(auth, input) {
  const config = getConfig();
  const now = clock.now();
  const routing = await resolveRouting({
    categoryId: input.categoryId,
    departmentId: input.departmentId,
    requestedOfficerId: input.assignedToId ?? null,
    useTriageQueue: input.useTriageQueue ?? false,
    allowStudentOfficerSelection: true
  });
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { defaultPriority: true }
  });
  const priority = input.priority ?? category?.defaultPriority ?? "NORMAL";
  const status = routing.assignedToId ? "ASSIGNED" : "AWAITING_ASSIGNMENT";
  const serviceTarget = await getServiceTarget(routing.departmentId);
  const deadlines = routing.assignedToId ? await computeDeadlines(routing.departmentId, now) : { firstResponseDueAt: null, resolutionDueAt: null };
  const ticket = await prisma.$transaction(async (tx) => {
    const referenceNumber = await nextReference(tx);
    const created = await tx.ticket.create({
      data: {
        referenceNumber,
        studentId: auth.userId,
        categoryId: input.categoryId,
        departmentId: routing.departmentId,
        assignedToId: routing.assignedToId,
        subject: input.subject,
        description: input.description,
        status,
        priority,
        source: routing.source,
        courseCode: input.courseCode ?? null,
        courseTitle: input.courseTitle ?? null,
        semester: input.semester ?? null,
        assessmentReference: input.assessmentReference ?? null,
        transactionReference: input.transactionReference ?? null,
        preferredContactMethod: input.preferredContactMethod ?? null,
        assignedAt: routing.assignedToId ? now : null,
        lastMeaningfulStaffActionAt: routing.assignedToId ? now : null,
        reminderCycleStartedAt: routing.assignedToId ? now : null,
        reminderKind: routing.assignedToId ? "UNTOUCHED" : null,
        nextReminderAt: routing.assignedToId ? new Date(now.getTime() + serviceTarget.reminderIntervalMinutes * 6e4) : null,
        firstResponseDueAt: deadlines.firstResponseDueAt,
        resolutionDueAt: deadlines.resolutionDueAt
      }
    });
    const history = await writeHistory(tx, {
      ticketId: created.id,
      actorId: auth.userId,
      actionType: "CREATED",
      newValue: referenceNumber,
      reason: routing.notes.length > 0 ? routing.notes.join(" ") : routing.assignedToId ? "Assigned directly to the selected officer." : "Sent to the department queue.",
      metadata: { status, priority, departmentId: routing.departmentId }
    });
    const payload = await buildPayloadContext(tx, created);
    await queueNotification(
      {
        recipientId: auth.userId,
        ticketId: created.id,
        type: "TICKET_SUBMITTED",
        idempotencyKey: `ticket-submitted:${created.id}`,
        payload: { ...payload, nextAction: "A department officer will acknowledge your report." }
      },
      tx
    );
    if (routing.assignedToId) {
      await queueNotification(
        {
          recipientId: routing.assignedToId,
          ticketId: created.id,
          type: "STAFF_TICKET_ASSIGNED",
          idempotencyKey: `staff-assigned:${created.id}:${routing.assignedToId}`,
          payload: { ...payload, nextAction: "Acknowledge the report to stop reminders." }
        },
        tx
      );
      await queueNotification(
        {
          recipientId: auth.userId,
          ticketId: created.id,
          type: "TICKET_ASSIGNED",
          idempotencyKey: `ticket-assigned:${created.id}`,
          payload
        },
        tx
      );
      const firstReminderAt = new Date(
        now.getTime() + serviceTarget.reminderIntervalMinutes * 6e4
      );
      await scheduleReminderJob(tx, created.id, "UNTOUCHED", firstReminderAt);
    } else {
      const heads = await tx.departmentMembership.findMany({
        where: { departmentId: routing.departmentId, departmentRole: "HEAD", isActive: true },
        select: { userId: true }
      });
      for (const head of heads) {
        await queueNotification(
          {
            recipientId: head.userId,
            ticketId: created.id,
            type: "STAFF_TICKET_QUEUED",
            idempotencyKey: `staff-queued:${created.id}:${head.userId}`,
            payload
          },
          tx
        );
      }
    }
    if (deadlines.firstResponseDueAt && deadlines.resolutionDueAt) {
      await tx.job.create({
        data: {
          type: "SLA_FIRST_RESPONSE",
          payload: { ticketId: created.id, dueAt: deadlines.firstResponseDueAt.toISOString() },
          dedupeKey: `sla-first-response:${created.id}`,
          runAt: deadlines.firstResponseDueAt
        }
      });
      await tx.job.create({
        data: {
          type: "SLA_RESOLUTION",
          payload: { ticketId: created.id, dueAt: deadlines.resolutionDueAt.toISOString() },
          dedupeKey: `sla-resolution:${created.id}`,
          runAt: deadlines.resolutionDueAt
        }
      });
    }
    return { created, history };
  });
  void config;
  return ticket.created;
}
function buildTicketScopeFilter(auth) {
  if (isGlobalAdmin(auth)) return {};
  const departmentIds = auth.departments.filter((scope) => scope.isActive).map((scope) => scope.departmentId);
  const staffConditions = [
    { assignedToId: auth.userId },
    ...departmentIds.length > 0 ? [{ departmentId: { in: departmentIds } }] : []
  ];
  return {
    OR: [
      { studentId: auth.userId },
      ...auth.permissions.has("ticket:read:department") ? staffConditions : [],
      ...auth.permissions.has("ticket:read:any") ? [{}] : []
    ]
  };
}
async function listTickets(auth, options) {
  const { skip, take } = resolvePagination(options);
  const scope = buildTicketScopeFilter(auth);
  const where = {
    AND: [
      scope,
      options.status ? { status: { in: Array.isArray(options.status) ? options.status : [options.status] } } : {},
      options.priority ? {
        priority: {
          in: Array.isArray(options.priority) ? options.priority : [options.priority]
        }
      } : {},
      options.categoryId ? { categoryId: options.categoryId } : {},
      options.departmentId ? { departmentId: options.departmentId } : {},
      options.assignedToId ? { assignedToId: options.assignedToId } : {},
      options.unassigned ? { assignedToId: null } : {},
      options.awaitingStudent ? { status: "AWAITING_STUDENT" } : {},
      options.overdue ? {
        OR: [
          { firstResponseOverdue: true },
          { resolutionOverdue: true },
          { status: "ESCALATED" }
        ]
      } : {},
      options.from ? { createdAt: { gte: options.from } } : {},
      options.to ? { createdAt: { lte: options.to } } : {},
      options.search ? {
        OR: [
          { subject: { contains: options.search, mode: "insensitive" } },
          { referenceNumber: { contains: options.search, mode: "insensitive" } },
          { description: { contains: options.search, mode: "insensitive" } }
        ]
      } : {}
    ]
  };
  const sortField = options.sort ?? "createdAt";
  const order = options.order ?? "desc";
  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { [sortField]: order },
      skip,
      take,
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, fullName: true } }
      }
    }),
    prisma.ticket.count({ where })
  ]);
  return paginate(items.map(toTicketSummary), total, options);
}
function toTicketSummary(ticket) {
  return {
    id: ticket.id,
    referenceNumber: ticket.referenceNumber,
    subject: ticket.subject,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    priority: ticket.priority,
    category: ticket.category ?? null,
    department: ticket.department ?? null,
    assignedTo: ticket.assignedTo ? { id: ticket.assignedTo.id, fullName: ticket.assignedTo.fullName } : null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    reopenedCount: ticket.reopenedCount,
    remindersSentInCycle: ticket.remindersSentInCycle,
    nextReminderAt: ticket.nextReminderAt,
    overdue: ticket.firstResponseOverdue || ticket.resolutionOverdue,
    escalationLevel: ticket.escalationLevel
  };
}
async function getTicketForUser(auth, ticketId) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      student: { select: { id: true, fullName: true, studentId: true, email: true } },
      category: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, fullName: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              roles: { select: { role: { select: { name: true } } } }
            }
          }
        }
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { id: true, fullName: true } } }
      },
      history: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, fullName: true } } }
      },
      feedback: true
    }
  });
  if (!ticket) throw notFound("Ticket not found.");
  if (!canViewTicket(auth, ticket))
    throw forbidden("You do not have access to this ticket.");
  const isStudentOwner = isOwner(auth, ticket);
  const canSeeInternal = !isStudentOwner && canAddInternalNote(auth, ticket);
  return {
    id: ticket.id,
    referenceNumber: ticket.referenceNumber,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    statusLabel: STATUS_LABELS[ticket.status],
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    assignedAt: ticket.assignedAt,
    firstResponseAt: ticket.firstResponseAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    escalatedAt: ticket.escalatedAt,
    resolutionSummary: ticket.resolutionSummary,
    reopenedCount: ticket.reopenedCount,
    remindersSentInCycle: ticket.remindersSentInCycle,
    nextReminderAt: ticket.nextReminderAt,
    lastReminderSentAt: ticket.lastReminderSentAt,
    lastMeaningfulStaffActionAt: ticket.lastMeaningfulStaffActionAt,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    firstResponseOverdue: ticket.firstResponseOverdue,
    resolutionOverdue: ticket.resolutionOverdue,
    escalationLevel: ticket.escalationLevel,
    courseCode: ticket.courseCode,
    courseTitle: ticket.courseTitle,
    semester: ticket.semester,
    assessmentReference: ticket.assessmentReference,
    transactionReference: ticket.transactionReference,
    preferredContactMethod: ticket.preferredContactMethod,
    student: ticket.student,
    category: ticket.category,
    department: ticket.department,
    assignedTo: ticket.assignedTo,
    messages: ticket.messages.filter((message) => canSeeInternal || message.visibility === "PUBLIC").map((message) => ({
      id: message.id,
      body: message.messageBody,
      visibility: message.visibility,
      createdAt: message.createdAt,
      sender: {
        id: message.sender.id,
        fullName: message.sender.fullName,
        isStaff: message.sender.roles.some((role) => role.role.name !== "STUDENT")
      }
    })),
    attachments: ticket.attachments.map((attachment) => ({
      id: attachment.id,
      originalFilename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdAt: attachment.createdAt,
      uploadedBy: attachment.uploadedBy
    })),
    history: ticket.history.map((entry) => ({
      id: entry.id,
      actionType: entry.actionType,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      reason: entry.reason,
      createdAt: entry.createdAt,
      actor: entry.actor ? { id: entry.actor.id, fullName: entry.actor.fullName } : null
    })),
    feedback: ticket.feedback ? {
      rating: ticket.feedback.rating,
      comment: ticket.feedback.comment,
      createdAt: ticket.feedback.createdAt
    } : null
  };
}
async function loadTicketForAction(ticketId) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound("Ticket not found.");
  return ticket;
}
async function postMessage(auth, ticketId, body) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canReply(auth, ticket)) throw forbidden("You cannot reply on this ticket.");
  if (isInactiveStatus(ticket.status)) {
    throw conflict("This ticket is closed and cannot receive new messages.");
  }
  const now = clock.now();
  const isStaff = canAddInternalNote(auth, ticket) && !isOwner(auth, ticket);
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: {
        ticketId,
        senderId: auth.userId,
        messageBody: body,
        visibility: "PUBLIC"
      }
    });
    await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "MESSAGE_ADDED",
      reason: body.slice(0, 500)
    });
    const payload = await buildPayloadContext(tx, ticket);
    if (isStaff) {
      await applyMeaningfulStaffAction(
        tx,
        ticket,
        auth,
        now,
        "A staff member replied on the ticket."
      );
      if (!ticket.firstResponseAt) {
        await tx.ticket.update({ where: { id: ticketId }, data: { firstResponseAt: now } });
      }
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: "TICKET_REPLY",
          idempotencyKey: `ticket-reply:${created.id}`,
          payload: { ...payload, actorName: auth.fullName, messageBody: body }
        },
        tx
      );
    } else {
      const studentReplyReminderAt = ticket.assignedToId ? new Date(
        now.getTime() + (await getServiceTarget(ticket.departmentId)).reminderIntervalMinutes * 6e4
      ) : null;
      await tx.ticket.update({
        where: { id: ticketId },
        data: {
          lastStudentReplyAt: now,
          status: ticket.status === "AWAITING_STUDENT" ? "IN_PROGRESS" : ticket.status,
          reminderKind: ticket.assignedToId ? "UNTOUCHED" : null,
          reminderCycleStartedAt: ticket.assignedToId ? now : null,
          nextReminderAt: studentReplyReminderAt,
          remindersSentInCycle: 0
        }
      });
      if (studentReplyReminderAt) {
        await scheduleReminderJob(tx, ticketId, "UNTOUCHED", studentReplyReminderAt);
      }
      if (ticket.assignedToId) {
        await queueNotification(
          {
            recipientId: ticket.assignedToId,
            ticketId,
            type: "STAFF_TICKET_REPLIED",
            idempotencyKey: `staff-replied:${created.id}`,
            payload: { ...payload, messageBody: body }
          },
          tx
        );
      }
    }
    return created;
  });
  return { id: message.id, createdAt: message.createdAt };
}
async function postInternalNote(auth, ticketId, body) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canAddInternalNote(auth, ticket)) {
    throw forbidden("Only authorised staff can add internal notes.");
  }
  if (isInactiveStatus(ticket.status)) {
    throw conflict("This ticket is closed.");
  }
  const now = clock.now();
  const substantive = body.trim().length >= MIN_SUBSTANTIVE_NOTE_LENGTH;
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketMessage.create({
      data: { ticketId, senderId: auth.userId, messageBody: body, visibility: "INTERNAL" }
    });
    await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "NOTE_ADDED",
      reason: "Internal note added."
    });
    if (substantive) {
      await applyMeaningfulStaffAction(
        tx,
        ticket,
        auth,
        now,
        "A substantive internal note was recorded."
      );
    }
    return created;
  });
  return { id: note.id, createdAt: note.createdAt, substantive };
}
async function applyMeaningfulStaffAction(tx, ticket, auth, now, reason) {
  const target = await getServiceTarget(ticket.departmentId);
  const nextReminderAt = requiresStaffActionStatus(ticket.status) ? new Date(now.getTime() + target.reminderIntervalMinutes * 6e4) : null;
  await tx.ticket.update({
    where: { id: ticket.id },
    data: {
      lastMeaningfulStaffActionAt: now,
      remindersSentInCycle: 0,
      reminderKind: nextReminderAt ? "NEXT_ACTION" : null,
      nextReminderAt
    }
  });
  if (nextReminderAt) {
    await scheduleReminderJob(tx, ticket.id, "NEXT_ACTION", nextReminderAt);
  }
  await writeHistory(tx, {
    ticketId: ticket.id,
    actorId: auth.userId,
    actionType: "REMINDER_SENT",
    newValue: "action-recorded",
    reason
  });
}
function requiresStaffActionStatus(status) {
  return [
    "SUBMITTED",
    "AWAITING_ASSIGNMENT",
    "ASSIGNED",
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "AWAITING_EXTERNAL",
    "ESCALATED",
    "REOPENED"
  ].includes(status);
}
async function acknowledgeTicket(auth, ticketId) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canChangeStatus(auth, ticket)) {
    throw forbidden("You cannot acknowledge this ticket.");
  }
  if (!["ASSIGNED", "AWAITING_ASSIGNMENT", "SUBMITTED", "ESCALATED", "REOPENED"].includes(
    ticket.status
  )) {
    throw invalidTransition(
      `A ticket in status "${STATUS_LABELS[ticket.status]}" cannot be acknowledged.`
    );
  }
  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const target = await getServiceTarget(ticket.departmentId);
    const nextReminderAt = new Date(now.getTime() + target.reminderIntervalMinutes * 6e4);
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: "ACKNOWLEDGED",
        firstResponseAt: ticket.firstResponseAt ?? now,
        lastMeaningfulStaffActionAt: now,
        remindersSentInCycle: 0,
        // Untouched-ticket reminders stop once the ticket is acknowledged; the
        // ticket stays monitored by the next-action and service-target timers.
        reminderKind: "NEXT_ACTION",
        nextReminderAt
      }
    });
    await scheduleReminderJob(tx, ticketId, "NEXT_ACTION", nextReminderAt);
    await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "STATUS_CHANGED",
      previousValue: ticket.status,
      newValue: "ACKNOWLEDGED",
      reason: "Report acknowledged by the responsible officer."
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: "ACKNOWLEDGED" });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: "TICKET_ACKNOWLEDGED",
        idempotencyKey: `ticket-ack:${ticketId}`,
        payload: { ...payload, actorName: auth.fullName }
      },
      tx
    );
  });
  return getTicketForUser(auth, ticketId);
}
async function changeStatus(auth, ticketId, nextStatus, note) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canChangeStatus(auth, ticket)) {
    throw forbidden("You cannot change the status of this ticket.");
  }
  if (ticket.status === nextStatus) {
    throw conflict("The ticket already has that status.");
  }
  if (!canTransition(ticket.status, nextStatus)) {
    throw invalidTransition(
      `A ticket cannot move from "${STATUS_LABELS[ticket.status]}" to "${STATUS_LABELS[nextStatus]}".`
    );
  }
  if (nextStatus === "RESOLVED") {
    throw badRequest("Use the resolve action so a resolution summary is recorded.");
  }
  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    const target = await getServiceTarget(ticket.departmentId);
    const data = { status: nextStatus };
    if (nextStatus === "AWAITING_STUDENT") {
      data.reminderKind = null;
      data.nextReminderAt = null;
      data.lastStaffReplyAt = now;
    } else if (nextStatus === "IN_PROGRESS" || nextStatus === "AWAITING_EXTERNAL") {
      const nextReminderAt = ticket.assignedToId ? new Date(now.getTime() + target.reminderIntervalMinutes * 6e4) : null;
      data.lastMeaningfulStaffActionAt = now;
      data.remindersSentInCycle = 0;
      data.reminderKind = nextReminderAt ? "NEXT_ACTION" : null;
      data.nextReminderAt = nextReminderAt;
      if (!ticket.firstResponseAt) data.firstResponseAt = now;
      if (nextReminderAt) {
        await scheduleReminderJob(tx, ticketId, "NEXT_ACTION", nextReminderAt);
      }
    }
    await tx.ticket.update({ where: { id: ticketId }, data });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "STATUS_CHANGED",
      previousValue: ticket.status,
      newValue: nextStatus,
      reason: note ?? null
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: nextStatus });
    if (nextStatus === "AWAITING_STUDENT") {
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: "TICKET_INFO_REQUESTED",
          idempotencyKey: `ticket-info:${history.id}`,
          payload: { ...payload, note: note ?? void 0 }
        },
        tx
      );
    } else if (!isOwner(auth, ticket)) {
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: "TICKET_STATUS_CHANGED",
          idempotencyKey: `ticket-status:${history.id}`,
          payload: { ...payload, note: note ?? void 0 }
        },
        tx
      );
    }
    if (ticket.assignedToId && ticket.assignedToId !== auth.userId) {
      await queueNotification(
        {
          recipientId: ticket.assignedToId,
          ticketId,
          type: "STAFF_TICKET_QUEUED",
          idempotencyKey: `staff-status:${history.id}`,
          payload: { ...payload, note: note ?? void 0 }
        },
        tx
      );
    }
  });
  return getTicketForUser(auth, ticketId);
}
async function assignTicket(auth, ticketId, assignedToId, reason) {
  const ticket = await loadTicketForAction(ticketId);
  const isReassignment = ticket.assignedToId !== null && ticket.assignedToId !== assignedToId;
  const allowed = isReassignment ? canReassign(auth, ticket) : canAssign(auth, ticket, assignedToId);
  if (!allowed) {
    throw forbidden("You are not authorised to assign this ticket.");
  }
  if (isInactiveStatus(ticket.status)) {
    throw conflict("A closed ticket cannot be assigned.");
  }
  if (assignedToId) {
    const membership = await prisma.departmentMembership.findFirst({
      where: {
        userId: assignedToId,
        departmentId: ticket.departmentId,
        isActive: true,
        user: { accountStatus: "ACTIVE" }
      },
      select: { id: true }
    });
    if (!membership) {
      throw badRequest("The selected officer is not an active member of this department.");
    }
  }
  const now = clock.now();
  const target = await getServiceTarget(ticket.departmentId);
  await prisma.$transaction(async (tx) => {
    const data = {
      assignedToId,
      assignedAt: assignedToId ? now : null,
      status: assignedToId ? ticket.status === "AWAITING_ASSIGNMENT" ? "ASSIGNED" : ticket.status : "AWAITING_ASSIGNMENT",
      lastMeaningfulStaffActionAt: now,
      remindersSentInCycle: 0,
      reminderCycleStartedAt: assignedToId ? now : null,
      reminderKind: assignedToId ? "UNTOUCHED" : null,
      nextReminderAt: assignedToId ? new Date(now.getTime() + target.reminderIntervalMinutes * 6e4) : null
    };
    if (assignedToId && (!ticket.firstResponseDueAt || !ticket.resolutionDueAt)) {
      const deadlines = await computeDeadlines(ticket.departmentId, now);
      data.firstResponseDueAt = deadlines.firstResponseDueAt;
      data.resolutionDueAt = deadlines.resolutionDueAt;
    }
    await tx.ticket.update({ where: { id: ticketId }, data });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: isReassignment ? "REASSIGNED" : "ASSIGNED",
      previousValue: ticket.assignedToId,
      newValue: assignedToId,
      reason: reason ?? null
    });
    const payload = await buildPayloadContext(tx, ticket);
    if (assignedToId) {
      await queueNotification(
        {
          recipientId: assignedToId,
          ticketId,
          type: isReassignment ? "STAFF_TICKET_REASSIGNED" : "STAFF_TICKET_ASSIGNED",
          idempotencyKey: `staff-assign:${history.id}`,
          payload: { ...payload, nextAction: "Acknowledge the report to stop reminders." }
        },
        tx
      );
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: isReassignment ? "TICKET_REASSIGNED" : "TICKET_ASSIGNED",
          idempotencyKey: `ticket-assign:${history.id}`,
          payload: { ...payload, note: reason ?? void 0 }
        },
        tx
      );
      const nextReminderAt = new Date(now.getTime() + target.reminderIntervalMinutes * 6e4);
      await scheduleReminderJob(tx, ticketId, "UNTOUCHED", nextReminderAt);
    } else {
      await queueNotification(
        {
          recipientId: ticket.studentId,
          ticketId,
          type: "TICKET_REASSIGNED",
          idempotencyKey: `ticket-unassign:${history.id}`,
          payload: { ...payload, note: "The ticket was returned to the department queue." }
        },
        tx
      );
    }
  });
  return getTicketForUser(auth, ticketId);
}
async function resolveTicket(auth, ticketId, resolutionSummary) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canResolve(auth, ticket)) {
    throw forbidden("You cannot resolve this ticket.");
  }
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    throw conflict("This ticket is already resolved.");
  }
  if (!canTransition(ticket.status, "RESOLVED")) {
    throw invalidTransition(
      `A ticket in status "${STATUS_LABELS[ticket.status]}" cannot be resolved directly.`
    );
  }
  if (resolutionSummary.trim().length < 10) {
    throw badRequest("A resolution summary of at least 10 characters is required.");
  }
  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: "RESOLVED",
        resolutionSummary,
        resolvedAt: now,
        firstResponseAt: ticket.firstResponseAt ?? now,
        lastMeaningfulStaffActionAt: now,
        reminderKind: null,
        nextReminderAt: null,
        remindersSentInCycle: 0
      }
    });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "RESOLVED",
      previousValue: ticket.status,
      newValue: "RESOLVED",
      reason: resolutionSummary
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: "RESOLVED" });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: "TICKET_RESOLVED",
        idempotencyKey: `ticket-resolved:${history.id}`,
        payload: { ...payload, note: resolutionSummary }
      },
      tx
    );
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: "FEEDBACK_REQUESTED",
        idempotencyKey: `feedback-request:${history.id}`,
        payload
      },
      tx
    );
  });
  return getTicketForUser(auth, ticketId);
}
async function reopenTicket(auth, ticketId, reason) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canReopen(auth, ticket)) {
    throw forbidden("You cannot reopen this ticket.");
  }
  const isOwner2 = isOwner(auth, ticket);
  if (isOwner2 && !studentMayReopen(ticket)) {
    throw invalidTransition("A student can only reopen a ticket that has been resolved.");
  }
  if (!isOwner2 && !canTransition(ticket.status, "REOPENED")) {
    throw invalidTransition(
      `A ticket in status "${STATUS_LABELS[ticket.status]}" cannot be reopened.`
    );
  }
  const now = clock.now();
  const target = await getServiceTarget(ticket.departmentId);
  const deadlines = await computeDeadlines(ticket.departmentId, now);
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: "REOPENED",
        reopenedCount: { increment: 1 },
        resolvedAt: null,
        closedAt: null,
        escalationLevel: 0,
        escalatedAt: null,
        firstResponseOverdue: false,
        resolutionOverdue: false,
        // A reopened ticket receives a new action deadline.
        firstResponseDueAt: deadlines.firstResponseDueAt,
        resolutionDueAt: deadlines.resolutionDueAt,
        reminderCycleStartedAt: now,
        reminderKind: ticket.assignedToId ? "UNTOUCHED" : null,
        nextReminderAt: ticket.assignedToId ? new Date(now.getTime() + target.reminderIntervalMinutes * 6e4) : null,
        remindersSentInCycle: 0
      }
    });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "REOPENED",
      previousValue: ticket.status,
      newValue: "REOPENED",
      reason
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: "REOPENED" });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: "TICKET_REOPENED",
        idempotencyKey: `ticket-reopened:${history.id}`,
        payload: { ...payload, note: reason }
      },
      tx
    );
    if (ticket.assignedToId) {
      await queueNotification(
        {
          recipientId: ticket.assignedToId,
          ticketId,
          type: "STAFF_TICKET_QUEUED",
          idempotencyKey: `staff-reopened:${history.id}`,
          payload: { ...payload, note: reason }
        },
        tx
      );
    }
    const reopenReminderAt = new Date(now.getTime() + target.reminderIntervalMinutes * 6e4);
    await scheduleReminderJob(tx, ticketId, "UNTOUCHED", reopenReminderAt);
    await tx.job.create({
      data: {
        type: "SLA_FIRST_RESPONSE",
        payload: { ticketId, dueAt: deadlines.firstResponseDueAt.toISOString() },
        dedupeKey: `sla-first-response:${ticketId}:${history.id}`,
        runAt: deadlines.firstResponseDueAt
      }
    });
    await tx.job.create({
      data: {
        type: "SLA_RESOLUTION",
        payload: { ticketId, dueAt: deadlines.resolutionDueAt.toISOString() },
        dedupeKey: `sla-resolution:${ticketId}:${history.id}`,
        runAt: deadlines.resolutionDueAt
      }
    });
  });
  return getTicketForUser(auth, ticketId);
}
async function withdrawTicket(auth, ticketId, reason) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canWithdraw(auth, ticket)) {
    throw forbidden("This ticket cannot be withdrawn at its current stage.");
  }
  if (!canTransition(ticket.status, "WITHDRAWN")) {
    throw invalidTransition("This ticket can no longer be withdrawn.");
  }
  const now = clock.now();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status: "WITHDRAWN",
        withdrawnAt: now,
        reminderKind: null,
        nextReminderAt: null
      }
    });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "WITHDRAWN",
      previousValue: ticket.status,
      newValue: "WITHDRAWN",
      reason: reason ?? "Withdrawn by the reporting student."
    });
    const payload = await buildPayloadContext(tx, { ...ticket, status: "WITHDRAWN" });
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: "TICKET_WITHDRAWN",
        idempotencyKey: `ticket-withdrawn:${history.id}`,
        payload
      },
      tx
    );
  });
  return getTicketForUser(auth, ticketId);
}
async function escalateTicket(auth, ticketId, reason, targetUserId) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canEscalate(auth, ticket)) {
    throw forbidden("You cannot escalate this ticket.");
  }
  if (isInactiveStatus(ticket.status)) {
    throw conflict("A closed ticket cannot be escalated.");
  }
  const isOwner2 = isOwner(auth, ticket);
  if (isOwner2 && !studentMayEscalate(ticket)) {
    throw invalidTransition("This ticket is not in a state that can be escalated.");
  }
  const now = clock.now();
  const recipients = await findEscalationRecipients2(ticket.departmentId);
  const targets = targetUserId ? [targetUserId] : recipients;
  await prisma.$transaction(async (tx) => {
    const escalation = await tx.escalationEvent.create({
      data: {
        ticketId,
        level: ticket.escalationLevel + 1,
        reason,
        source: isOwner2 ? "STUDENT" : "MANUAL",
        fromUserId: auth.userId,
        toUserId: targets[0] ?? null,
        notifiedAt: now
      }
    });
    const data = {
      escalatedAt: now,
      escalationLevel: ticket.escalationLevel + 1
    };
    if (canTransition(ticket.status, "ESCALATED")) {
      data.status = "ESCALATED";
    }
    await tx.ticket.update({ where: { id: ticketId }, data });
    const history = await writeHistory(tx, {
      ticketId,
      actorId: auth.userId,
      actionType: "ESCALATED",
      previousValue: ticket.status,
      newValue: data.status?.toString() ?? ticket.status,
      reason
    });
    const payload = await buildPayloadContext(tx, ticket);
    for (const target of targets) {
      await queueNotification(
        {
          recipientId: target,
          ticketId,
          type: "STAFF_TICKET_ESCALATED",
          idempotencyKey: `staff-escalated:${escalation.id}:${target}`,
          payload: { ...payload, note: reason, escalationLevel: ticket.escalationLevel + 1 }
        },
        tx
      );
    }
    await queueNotification(
      {
        recipientId: ticket.studentId,
        ticketId,
        type: "TICKET_ESCALATED",
        idempotencyKey: `ticket-escalated:${history.id}`,
        payload: { ...payload, note: reason }
      },
      tx
    );
  });
  return getTicketForUser(auth, ticketId);
}
async function submitFeedback(auth, ticketId, rating, comment) {
  const ticket = await loadTicketForAction(ticketId);
  if (!canGiveFeedback(auth, ticket)) {
    throw forbidden("Feedback can only be given on your own resolved ticket.");
  }
  const existing = await prisma.studentFeedback.findUnique({ where: { ticketId } });
  if (existing) throw conflict("Feedback has already been recorded for this ticket.");
  const feedback = await prisma.studentFeedback.create({
    data: { ticketId, studentId: auth.userId, rating, comment: comment ?? null }
  });
  await writeHistory(prisma, {
    ticketId,
    actorId: auth.userId,
    actionType: "FEEDBACK_ADDED",
    newValue: String(rating)
  });
  return feedback;
}
async function findEscalationRecipients2(departmentId) {
  const { findEscalationRecipients: find } = await Promise.resolve().then(() => (init_service_target_service(), service_target_service_exports));
  return find(departmentId);
}

// src/modules/tickets/attachment.service.ts
init_prisma();

// src/services/storage.service.ts
init_env();
import crypto2 from "crypto";
import fs2 from "fs/promises";
import path2 from "path";
var ALLOWED_MIME_TYPES = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "text/plain": ["txt", "log", "csv"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.ms-excel": ["xls"]
};
function sniffMimeType(buffer) {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 4).toString("hex") === "25504446") return "application/pdf";
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buffer.subarray(0, 4).toString("hex") === "d0cf11e0" || buffer.subarray(0, 2).toString("hex") === "504b") {
    return "application/octet-stream";
  }
  const head = buffer.subarray(0, 64).toString("utf8");
  if (!/[\x00-\x08\x0E-\x1F]/.test(head)) return "text/plain";
  return null;
}
function sanitizeFilename(filename) {
  const base = path2.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  const trimmed = base.replace(/^\.+/, "").slice(0, 180);
  return trimmed.length > 0 ? trimmed : "attachment";
}
function validateUpload(buffer, declaredMimeType, filename) {
  const config = getConfig();
  const maxBytes = config.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    throw payloadTooLarge(
      `Attachments must be smaller than ${config.STORAGE_MAX_FILE_SIZE_MB} MB.`
    );
  }
  if (buffer.byteLength === 0) {
    throw badRequest("The uploaded file is empty.");
  }
  const extension = path2.extname(filename).replace(".", "").toLowerCase();
  const allowedExtensions = ALLOWED_MIME_TYPES[declaredMimeType];
  if (!allowedExtensions) {
    throw unsupportedMediaType(`Files of type "${declaredMimeType}" are not accepted.`);
  }
  if (!allowedExtensions.includes(extension)) {
    throw unsupportedMediaType(
      `The file extension ".${extension}" does not match the accepted types.`
    );
  }
  const sniffed = sniffMimeType(buffer);
  if (!sniffed) {
    throw unsupportedMediaType("The file content could not be verified.");
  }
  if (sniffed !== "application/octet-stream" && sniffed !== declaredMimeType) {
    throw unsupportedMediaType("The file content does not match its declared type.");
  }
}
var LocalStorageProvider = class {
  root;
  constructor(root = storageRoot()) {
    this.root = root;
  }
  resolveKey(storageKey) {
    const target = path2.resolve(this.root, storageKey);
    if (!target.startsWith(path2.resolve(this.root) + path2.sep)) {
      throw badRequest("Invalid storage key.");
    }
    return target;
  }
  async save(buffer, filename, mimeType) {
    const safeName = sanitizeFilename(filename);
    const key = `${(/* @__PURE__ */ new Date()).getUTCFullYear()}/${crypto2.randomUUID()}-${safeName}`;
    const target = this.resolveKey(key);
    await fs2.mkdir(path2.dirname(target), { recursive: true });
    await fs2.writeFile(target, buffer, { mode: 384 });
    return {
      storageKey: key,
      originalFilename: safeName,
      mimeType,
      fileSize: buffer.byteLength,
      checksum: crypto2.createHash("sha256").update(buffer).digest("hex")
    };
  }
  async read(storageKey) {
    const target = this.resolveKey(storageKey);
    try {
      return await fs2.readFile(target);
    } catch {
      throw badRequest("The attachment is no longer available.");
    }
  }
  async delete(storageKey) {
    const target = this.resolveKey(storageKey);
    await fs2.rm(target, { force: true });
  }
  async exists(storageKey) {
    try {
      await fs2.access(this.resolveKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }
};
var storageProvider = new LocalStorageProvider();

// src/modules/tickets/attachment.service.ts
async function addAttachment(auth, ticketId, file) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound("Ticket not found.");
  if (!canUploadAttachment(auth, ticket)) {
    throw forbidden("You cannot attach files to this ticket.");
  }
  if (["CLOSED", "WITHDRAWN", "RESOLVED"].includes(ticket.status)) {
    throw badRequest("Attachments cannot be added to a closed, withdrawn or resolved ticket.");
  }
  validateUpload(file.buffer, file.mimetype, file.originalname);
  const stored = await storageProvider.save(file.buffer, file.originalname, file.mimetype);
  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      uploadedById: auth.userId,
      storageKey: stored.storageKey,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      checksum: stored.checksum
    }
  });
  await prisma.ticketHistory.create({
    data: {
      ticketId,
      actorId: auth.userId,
      actionType: "ATTACHMENT_ADDED",
      newValue: stored.originalFilename,
      reason: "Supporting document attached."
    }
  });
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    createdAt: attachment.createdAt
  };
}
async function getAttachmentForDownload(auth, attachmentId) {
  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      ticket: {
        select: { id: true, studentId: true, departmentId: true, assignedToId: true, status: true }
      }
    }
  });
  if (!attachment) throw notFound("Attachment not found.");
  if (!canDownloadAttachment(auth, attachment.ticket)) {
    throw forbidden("You do not have access to this attachment.");
  }
  const buffer = await storageProvider.read(attachment.storageKey);
  return {
    buffer,
    mimeType: attachment.mimeType,
    filename: attachment.originalFilename
  };
}

// src/routes/tickets.routes.ts
var ticketRouter = createRouter();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getConfig().STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 }
});
ticketRouter.post(
  "/",
  requireAuth,
  requireVerifiedEmail,
  validate(createTicketSchema),
  async (req, res) => {
    const ticket = await createTicket(req.auth, req.body);
    res.status(201).json({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      status: ticket.status,
      departmentId: ticket.departmentId,
      assignedToId: ticket.assignedToId,
      message: "Your report has been received."
    });
  }
);
ticketRouter.get("/", requireAuth, validate(ticketListQuerySchema, "query"), async (req, res) => {
  const result = await listTickets(req.auth, req.query);
  res.json(result);
});
ticketRouter.get("/:id", requireAuth, validate(idParamSchema, "params"), async (req, res) => {
  const ticket = await getTicketForUser(req.auth, req.params.id);
  res.json({ ticket });
});
ticketRouter.post(
  "/:id/messages",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(postMessageSchema),
  async (req, res) => {
    const message = await postMessage(req.auth, req.params.id, req.body.body);
    res.status(201).json({ message });
  }
);
ticketRouter.post(
  "/:id/attachments",
  requireAuth,
  validate(idParamSchema, "params"),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest("No file was uploaded.");
    const attachment = await addAttachment(req.auth, req.params.id, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    res.status(201).json({ attachment });
  }
);
ticketRouter.post(
  "/:id/reopen",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(reopenTicketSchema),
  async (req, res) => {
    const ticket = await reopenTicket(req.auth, req.params.id, req.body.reason);
    res.json({ ticket });
  }
);
ticketRouter.post(
  "/:id/escalate",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(escalateTicketSchema),
  async (req, res) => {
    const ticket = await escalateTicket(
      req.auth,
      req.params.id,
      req.body.reason,
      req.body.targetUserId ?? null
    );
    res.json({ ticket });
  }
);
ticketRouter.post(
  "/:id/withdraw",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(withdrawTicketSchema),
  async (req, res) => {
    const ticket = await withdrawTicket(req.auth, req.params.id, req.body.reason);
    res.json({ ticket });
  }
);
ticketRouter.post(
  "/:id/feedback",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(feedbackSchema),
  async (req, res) => {
    const feedback = await submitFeedback(
      req.auth,
      req.params.id,
      req.body.rating,
      req.body.comment
    );
    res.status(201).json({ feedback });
  }
);
ticketRouter.get(
  "/:id/attachments/:attachmentId/download",
  requireAuth,
  validate(attachmentIdParamSchema, "params"),
  async (req, res) => {
    const attachment = await getAttachmentForDownload(
      req.auth,
      req.params.attachmentId
    );
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${attachment.filename.replace(/"/g, "")}"`
    );
    res.setHeader("Content-Length", String(attachment.buffer.byteLength));
    res.send(attachment.buffer);
  }
);
var notificationRouter = createRouter();
notificationRouter.get("/", requireAuth, async (req, res) => {
  const notifications = await listNotifications(req.auth.userId, 50);
  res.json({
    items: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      status: notification.status,
      ticketId: notification.ticketId,
      createdAt: notification.createdAt,
      sentAt: notification.sentAt
    }))
  });
});

// src/modules/admin/admin.service.ts
init_prisma();
init_clock();
init_env();
async function writeAudit(auth, action, entityType, entityId, metadata, meta) {
  await prisma.auditLog.create({
    data: {
      actorId: auth.userId,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: metadata ?? void 0,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent?.slice(0, 255) ?? null
    }
  });
}
async function listUsers(auth, options) {
  const where = {
    ...options.role ? { roles: { some: { role: { name: options.role } } } } : {},
    ...options.accountStatus ? { accountStatus: options.accountStatus } : {},
    ...options.departmentId ? { memberships: { some: { departmentId: options.departmentId, isActive: true } } } : {},
    ...options.search ? {
      OR: [
        { fullName: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { studentId: { contains: options.search, mode: "insensitive" } }
      ]
    } : {}
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: options.page ? (options.page - 1) * (options.pageSize ?? 20) : 0,
      take: options.pageSize ?? 20,
      include: {
        roles: { include: { role: { select: { name: true } } } },
        memberships: { include: { department: { select: { id: true, name: true } } } }
      }
    }),
    prisma.user.count({ where })
  ]);
  return paginate(
    users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      studentId: user.studentId,
      accountStatus: user.accountStatus,
      emailVerified: user.emailVerifiedAt !== null,
      roles: user.roles.map((role) => role.role.name),
      departments: user.memberships.map((membership) => ({
        id: membership.department.id,
        name: membership.department.name,
        departmentRole: membership.departmentRole,
        isActive: membership.isActive
      })),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt
    })),
    total,
    options
  );
}
async function inviteUser(auth, input, meta = {}) {
  assertCanGrantRole(auth, input.role);
  const config = getConfig();
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("A user with this email address already exists.");
  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw notFound("Department not found.");
  }
  const role = await prisma.role.findUnique({ where: { name: input.role } });
  if (!role) throw badRequest(`Unknown role "${input.role}".`);
  const token = generateToken();
  const temporaryPassword = generateToken(12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email,
        passwordHash: await hashPassword(temporaryPassword),
        accountStatus: "PENDING_VERIFICATION",
        invitedById: auth.userId,
        roles: { create: { roleId: role.id, grantedById: auth.userId } },
        ...input.departmentId ? {
          memberships: {
            create: {
              departmentId: input.departmentId,
              departmentRole: input.departmentRole ?? "OFFICER"
            }
          }
        } : {}
      }
    });
    await tx.emailVerificationToken.create({
      data: {
        userId: created.id,
        tokenHash: hashToken(token, config.SESSION_SECRET),
        expiresAt: new Date(clock.nowMs() + 24 * 36e5)
      }
    });
    await queueNotification(
      {
        recipientId: created.id,
        type: "STAFF_INVITATION",
        idempotencyKey: `staff-invitation:${created.id}`,
        payload: { token, detail: `You were invited as ${input.role}.` }
      },
      tx
    );
    return created;
  });
  await writeAudit(
    auth,
    "USER_INVITED",
    "User",
    user.id,
    { email, role: input.role, departmentId: input.departmentId ?? null },
    meta
  );
  return { id: user.id, email: user.email, fullName: user.fullName, roles: [input.role] };
}
function assertCanGrantRole(auth, targetRole) {
  if (auth.permissions.has("user:role:assign")) {
    if (targetRole === "SUPER_ADMIN" && !auth.roles.includes("SUPER_ADMIN")) {
      throw forbidden("Only a super administrator can grant the super-administrator role.");
    }
    return;
  }
  if (auth.permissions.has("user:manage:department")) {
    if (targetRole !== "OFFICER" && targetRole !== "DEPARTMENT_HEAD") {
      throw forbidden("Department heads can only manage officer and department-head roles.");
    }
    return;
  }
  throw forbidden("You are not authorised to assign roles.");
}
async function updateUserRole(auth, userId, role, departmentId, departmentRole, meta = {}) {
  assertCanGrantRole(auth, role);
  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } }
  });
  if (!target) throw notFound("User not found.");
  if (auth.permissions.has("user:manage:department") && !auth.permissions.has("user:role:assign")) {
    const scope = auth.departments.some(
      (entry) => entry.departmentId === departmentId && entry.isActive
    );
    if (!scope) throw forbidden("You can only manage staff inside your own department.");
  }
  if (target.id === auth.userId && !target.roles.some((entry) => entry.role.name === role)) {
    throw badRequest("You cannot change your own role.");
  }
  const roleRecord = await prisma.role.findUnique({ where: { name: role } });
  if (!roleRecord) throw badRequest(`Unknown role "${role}".`);
  await prisma.$transaction(async (tx) => {
    if (role === "STUDENT") {
      await tx.userRole.deleteMany({
        where: {
          userId,
          role: { name: { in: ["OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"] } }
        }
      });
      await tx.userRole.create({
        data: { userId, roleId: roleRecord.id, grantedById: auth.userId }
      });
    } else {
      await tx.userRole.deleteMany({
        where: {
          userId,
          role: { name: { in: ["STUDENT", "OFFICER", "DEPARTMENT_HEAD", "ADMIN", "SUPER_ADMIN"] } }
        }
      });
      await tx.userRole.create({
        data: { userId, roleId: roleRecord.id, grantedById: auth.userId }
      });
      if (departmentId) {
        await tx.departmentMembership.upsert({
          where: { departmentId_userId: { departmentId, userId } },
          create: { departmentId, userId, departmentRole: departmentRole ?? "OFFICER" },
          update: { departmentRole: departmentRole ?? "OFFICER", isActive: true }
        });
      }
    }
  });
  await writeAudit(
    auth,
    "USER_ROLE_UPDATED",
    "User",
    userId,
    { role, departmentId: departmentId ?? null },
    meta
  );
  return { userId, role };
}
async function updateUserStatus(auth, userId, accountStatus, reason, meta = {}) {
  if (!auth.permissions.has("user:manage")) {
    throw forbidden("You are not authorised to change account status.");
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User not found.");
  if (target.id === auth.userId)
    throw badRequest("You cannot change the status of your own account.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { accountStatus }
    });
    if (accountStatus !== "ACTIVE") {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: clock.now() }
      });
    }
    if (accountStatus === "SUSPENDED") {
      await queueNotification(
        {
          recipientId: userId,
          type: "ACCOUNT_SUSPENDED",
          idempotencyKey: `account-suspended:${userId}:${clock.nowMs()}`,
          payload: { note: reason ?? void 0 }
        },
        tx
      );
    }
  });
  await writeAudit(
    auth,
    "USER_STATUS_UPDATED",
    "User",
    userId,
    { accountStatus, reason: reason ?? null },
    meta
  );
  return { userId, accountStatus };
}
async function createDepartment(auth, input, meta = {}) {
  const department = await prisma.department.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      contactEmail: input.contactEmail ?? null,
      isActive: input.isActive ?? true,
      isFallbackQueue: input.isFallbackQueue ?? false,
      sortOrder: input.sortOrder ?? 0
    }
  });
  await writeAudit(
    auth,
    "DEPARTMENT_CREATED",
    "Department",
    department.id,
    { name: department.name },
    meta
  );
  return department;
}
async function updateDepartment(auth, departmentId, input, meta = {}) {
  const existing = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!existing) throw notFound("Department not found.");
  const department = await prisma.department.update({
    where: { id: departmentId },
    data: {
      ...input.name !== void 0 ? { name: input.name.trim() } : {},
      ...input.description !== void 0 ? { description: input.description } : {},
      ...input.contactEmail !== void 0 ? { contactEmail: input.contactEmail } : {},
      ...input.isActive !== void 0 ? { isActive: input.isActive } : {},
      ...input.isFallbackQueue !== void 0 ? { isFallbackQueue: input.isFallbackQueue } : {},
      ...input.sortOrder !== void 0 ? { sortOrder: input.sortOrder } : {}
    }
  });
  await writeAudit(
    auth,
    "DEPARTMENT_UPDATED",
    "Department",
    departmentId,
    input,
    meta
  );
  return department;
}
async function createCategory(auth, input, meta = {}) {
  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw notFound("Department not found.");
  }
  const category = await prisma.category.create({
    data: {
      name: input.name.trim(),
      description: input.description ?? null,
      departmentId: input.departmentId ?? null,
      defaultPriority: input.defaultPriority ?? "NORMAL",
      isActive: input.isActive ?? true,
      isSensitive: input.isSensitive ?? false,
      sortOrder: input.sortOrder ?? 0
    }
  });
  await writeAudit(
    auth,
    "CATEGORY_CREATED",
    "Category",
    category.id,
    { name: category.name },
    meta
  );
  return category;
}
async function updateCategory(auth, categoryId, input, meta = {}) {
  const existing = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!existing) throw notFound("Category not found.");
  const category = await prisma.category.update({
    where: { id: categoryId },
    data: {
      ...input.name !== void 0 ? { name: input.name.trim() } : {},
      ...input.description !== void 0 ? { description: input.description } : {},
      ...input.departmentId !== void 0 ? { departmentId: input.departmentId } : {},
      ...input.defaultPriority !== void 0 ? { defaultPriority: input.defaultPriority } : {},
      ...input.isActive !== void 0 ? { isActive: input.isActive } : {},
      ...input.isSensitive !== void 0 ? { isSensitive: input.isSensitive } : {},
      ...input.sortOrder !== void 0 ? { sortOrder: input.sortOrder } : {}
    }
  });
  await writeAudit(
    auth,
    "CATEGORY_UPDATED",
    "Category",
    categoryId,
    input,
    meta
  );
  return category;
}
async function listAuditLogs(auth, options) {
  const where = {
    ...options.action ? { action: options.action } : {},
    ...options.entityType ? { entityType: options.entityType } : {},
    ...options.actorId ? { actorId: options.actorId } : {}
  };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: options.page ? (options.page - 1) * (options.pageSize ?? 20) : 0,
      take: options.pageSize ?? 20,
      include: { actor: { select: { id: true, fullName: true, email: true } } }
    }),
    prisma.auditLog.count({ where })
  ]);
  return paginate(items, total, options);
}
var SETTING_DEFAULTS = {
  institutionName: "Campus Resolve",
  institutionEmailDomains: getConfig().INSTITUTION_EMAIL_DOMAINS,
  reminderIntervalMinutes: 120,
  escalationAfterReminders: 3,
  maxReminders: 8,
  autoCloseDays: 14,
  ticketRetentionMonths: 24,
  attachmentRetentionMonths: 12,
  allowStudentOfficerSelection: true,
  remindersPaused: false,
  supportEmail: "support@campusresolve.edu.gh"
};
async function getSettings() {
  const rows = await prisma.systemSetting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...SETTING_DEFAULTS, ...stored };
}
async function updateSettings(auth, input, meta = {}) {
  const entries = Object.entries(input).filter(([, value]) => value !== void 0);
  await prisma.$transaction(
    entries.map(
      ([key, value]) => prisma.systemSetting.upsert({
        where: { key },
        create: { key, value, updatedById: auth.userId },
        update: { value, updatedById: auth.userId }
      })
    )
  );
  await writeAudit(
    auth,
    "SETTINGS_UPDATED",
    "SystemSetting",
    null,
    input,
    meta
  );
  return getSettings();
}
async function exportReport(auth, type, format, options = {}) {
  if (!auth.permissions.has("export:create")) {
    throw forbidden("You are not authorised to export reports.");
  }
  const from = options.from ?? new Date(clock.nowMs() - 30 * 864e5);
  const to = options.to ?? clock.now();
  if (type === "tickets") {
    const tickets = await prisma.ticket.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...options.departmentId ? { departmentId: options.departmentId } : {}
      },
      select: {
        referenceNumber: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        reopenedCount: true,
        remindersSentInCycle: true,
        department: { select: { name: true } },
        category: { select: { name: true } },
        student: { select: { studentId: true } }
      },
      orderBy: { createdAt: "asc" }
    });
    const rows2 = tickets.map((ticket) => ({
      reference: ticket.referenceNumber,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category.name,
      department: ticket.department.name,
      studentId: ticket.student.studentId ?? "",
      createdAt: ticket.createdAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? "",
      reopened: ticket.reopenedCount,
      reminders: ticket.remindersSentInCycle
    }));
    return format === "json" ? { rows: rows2 } : { csv: toCsv(rows2) };
  }
  if (type === "notifications") {
    const notifications = await prisma.notification.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        type: true,
        status: true,
        attemptCount: true,
        sentAt: true,
        createdAt: true,
        recipient: { select: { email: true } }
      },
      orderBy: { createdAt: "asc" }
    });
    const rows2 = notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      status: notification.status,
      attempts: notification.attemptCount,
      recipient: notification.recipient.email,
      createdAt: notification.createdAt.toISOString(),
      sentAt: notification.sentAt?.toISOString() ?? ""
    }));
    return format === "json" ? { rows: rows2 } : { csv: toCsv(rows2) };
  }
  if (type === "audit") {
    const logs = await prisma.auditLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { email: true } }
      },
      orderBy: { createdAt: "asc" }
    });
    const rows2 = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? "",
      actor: log.actor?.email ?? "",
      createdAt: log.createdAt.toISOString()
    }));
    return format === "json" ? { rows: rows2 } : { csv: toCsv(rows2) };
  }
  const analytics = await prisma.ticket.groupBy({
    by: ["departmentId", "status"],
    where: { createdAt: { gte: from, lte: to } },
    _count: { _all: true }
  });
  const departments = await prisma.department.findMany({ select: { id: true, name: true } });
  const nameById = new Map(departments.map((department) => [department.id, department.name]));
  const rows = analytics.map((entry) => ({
    department: nameById.get(entry.departmentId) ?? entry.departmentId,
    status: entry.status,
    count: entry._count._all
  }));
  return format === "json" ? { rows } : { csv: toCsv(rows) };
}
function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value === null || value === void 0 ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\n");
}
var ASSIGNABLE_ROLE_NAMES = Object.keys(ASSIGNABLE_ROLES);

// src/routes/staff.routes.ts
var staffRouter = createRouter();
staffRouter.use(requireAuth);
staffRouter.get("/tickets", validate(ticketListQuerySchema, "query"), async (req, res) => {
  const result = await listTickets(req.auth, req.query);
  res.json(result);
});
staffRouter.post("/tickets/:id/acknowledge", async (req, res) => {
  const ticket = await acknowledgeTicket(req.auth, req.params.id);
  res.json({ ticket });
});
staffRouter.patch("/tickets/:id/status", validate(changeStatusSchema), async (req, res) => {
  const ticket = await changeStatus(
    req.auth,
    req.params.id,
    req.body.status,
    req.body.note
  );
  res.json({ ticket });
});
staffRouter.patch("/tickets/:id/assign", validate(assignTicketSchema), async (req, res) => {
  const ticket = await assignTicket(
    req.auth,
    req.params.id,
    req.body.assignedToId ?? null,
    req.body.reason
  );
  await writeAudit(
    req.auth,
    "TICKET_ASSIGNED",
    "Ticket",
    req.params.id,
    { assignedToId: req.body.assignedToId ?? null },
    requestMeta(req)
  );
  res.json({ ticket });
});
staffRouter.post("/tickets/:id/notes", validate(postNoteSchema), async (req, res) => {
  const note = await postInternalNote(req.auth, req.params.id, req.body.body);
  res.status(201).json({ note });
});
staffRouter.post("/tickets/:id/resolve", validate(resolveTicketSchema), async (req, res) => {
  const ticket = await resolveTicket(
    req.auth,
    req.params.id,
    req.body.resolutionSummary
  );
  res.json({ ticket });
});
staffRouter.get("/queue", requirePermission("ticket:read:department"), async (req, res) => {
  const result = await listTickets(req.auth, {
    page: 1,
    pageSize: 50,
    departmentId: req.auth.departments[0]?.departmentId
  });
  res.json(result);
});

// src/modules/departments/department.service.ts
init_prisma();
init_clock();
async function listDepartments(auth, includeInactive = false) {
  const canManage = auth.permissions.has("department:manage");
  const departments = await prisma.department.findMany({
    where: includeInactive && canManage ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      serviceTarget: true,
      _count: { select: { memberships: { where: { isActive: true } }, categories: true } }
    }
  });
  const isAdmin = auth.permissions.has("analytics:global");
  return departments.map((department) => ({
    id: department.id,
    name: department.name,
    code: department.code,
    description: department.description,
    contactEmail: department.contactEmail,
    isActive: department.isActive,
    isFallbackQueue: department.isFallbackQueue,
    sortOrder: department.sortOrder,
    staffCount: department._count.memberships,
    categoryCount: department._count.categories,
    serviceTarget: department.serviceTarget ? {
      firstResponseMinutes: department.serviceTarget.firstResponseMinutes,
      resolutionMinutes: department.serviceTarget.resolutionMinutes,
      reminderIntervalMinutes: department.serviceTarget.reminderIntervalMinutes,
      maxReminders: department.serviceTarget.maxReminders,
      escalationAfterReminders: department.serviceTarget.escalationAfterReminders,
      businessHoursOnly: department.serviceTarget.businessHoursOnly
    } : null,
    ...isAdmin ? { hasAccess: true } : {}
  }));
}
async function listCategories(auth, includeInactive = false) {
  const canManage = auth.permissions.has("category:manage");
  const categories = await prisma.category.findMany({
    where: includeInactive && canManage ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { department: { select: { id: true, name: true } } }
  });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    departmentId: category.departmentId,
    departmentName: category.department?.name ?? null,
    defaultPriority: category.defaultPriority,
    isActive: category.isActive,
    isSensitive: category.isSensitive,
    sortOrder: category.sortOrder
  }));
}
async function listDepartmentStaff(departmentId) {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true }
  });
  if (!department) throw notFound("Department not found.");
  const memberships = await prisma.departmentMembership.findMany({
    where: { departmentId, isActive: true },
    orderBy: [{ departmentRole: "asc" }, { user: { fullName: "asc" } }],
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          accountStatus: true,
          roles: { select: { role: { select: { name: true } } } }
        }
      }
    }
  });
  return {
    department,
    staff: memberships.map((membership) => ({
      membershipId: membership.id,
      userId: membership.user.id,
      fullName: membership.user.fullName,
      email: membership.user.email,
      accountStatus: membership.user.accountStatus,
      departmentRole: membership.departmentRole,
      roles: membership.user.roles.map((role) => role.role.name)
    }))
  };
}
function assertDepartmentScope(auth, departmentId) {
  if (auth.permissions.has("analytics:global")) return;
  const allowed = auth.departments.some(
    (scope) => scope.departmentId === departmentId && scope.isActive
  );
  if (!allowed) throw forbidden("You do not have access to this department.");
}
async function getDepartmentTickets(auth, departmentId, options) {
  assertDepartmentScope(auth, departmentId);
  return listTickets(auth, { ...options, departmentId });
}
var OPEN_STATUSES = [
  "SUBMITTED",
  "AWAITING_ASSIGNMENT",
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "AWAITING_STUDENT",
  "AWAITING_EXTERNAL",
  "ESCALATED",
  "REOPENED"
];
async function getDepartmentAnalytics(auth, departmentId, options = {}) {
  assertDepartmentScope(auth, departmentId);
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, serviceTarget: true }
  });
  if (!department) throw notFound("Department not found.");
  const where = {
    departmentId,
    ...options.from || options.to ? {
      createdAt: {
        ...options.from ? { gte: options.from } : {},
        ...options.to ? { lte: options.to } : {}
      }
    } : {}
  };
  const tickets = await prisma.ticket.findMany({
    where,
    select: {
      id: true,
      status: true,
      priority: true,
      createdAt: true,
      assignedAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      reopenedCount: true,
      firstResponseOverdue: true,
      resolutionOverdue: true,
      escalationLevel: true,
      assignedToId: true
    }
  });
  const feedback = await prisma.studentFeedback.findMany({
    where: {
      ticket: {
        departmentId,
        ...where.createdAt ? { ticket: { createdAt: where.createdAt } } : {}
      }
    },
    select: { rating: true }
  });
  const now = clock.now();
  const resolutionTargetMinutes = department.serviceTarget?.resolutionMinutes ?? 4320;
  const firstResponseDurations = [];
  const resolutionDurations = [];
  const volumeByStatus = {};
  const volumeByPriority = {};
  let unassigned = 0;
  let overdue = 0;
  let escalated = 0;
  let resolved = 0;
  let reopened = 0;
  let awaitingStudent = 0;
  let resolvedWithinTarget = 0;
  for (const ticket of tickets) {
    volumeByStatus[ticket.status] = (volumeByStatus[ticket.status] ?? 0) + 1;
    volumeByPriority[ticket.priority] = (volumeByPriority[ticket.priority] ?? 0) + 1;
    if (!ticket.assignedToId) unassigned += 1;
    if (ticket.firstResponseOverdue || ticket.resolutionOverdue) overdue += 1;
    if (ticket.escalationLevel > 0) escalated += 1;
    if (ticket.reopenedCount > 0) reopened += 1;
    if (ticket.status === "AWAITING_STUDENT") awaitingStudent += 1;
    if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
      resolved += 1;
      if (ticket.resolvedAt && ticket.createdAt) {
        const minutes = (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 6e4;
        resolutionDurations.push(minutes);
        if (minutes <= resolutionTargetMinutes) resolvedWithinTarget += 1;
      }
    }
    if (ticket.firstResponseAt && ticket.createdAt) {
      firstResponseDurations.push(
        (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 6e4
      );
    }
    void now;
  }
  const average = (values) => values.length === 0 ? null : Math.round(values.reduce((total, value) => total + value, 0) / values.length * 10) / 10;
  const satisfactionAverage = feedback.length === 0 ? null : Math.round(
    feedback.reduce((total, item) => total + item.rating, 0) / feedback.length * 100
  ) / 100;
  return {
    departmentId: department.id,
    departmentName: department.name,
    total: tickets.length,
    open: tickets.filter((ticket) => OPEN_STATUSES.includes(ticket.status)).length,
    unassigned,
    overdue,
    escalated,
    resolved,
    reopened,
    awaitingStudent,
    averageFirstResponseMinutes: average(firstResponseDurations),
    averageResolutionMinutes: average(resolutionDurations),
    resolvedWithinTarget,
    satisfactionAverage,
    satisfactionCount: feedback.length,
    volumeByStatus,
    volumeByPriority
  };
}
async function getSystemDashboard(auth, options = {}) {
  if (!auth.permissions.has("analytics:global")) {
    throw forbidden("Global analytics are restricted to administrators.");
  }
  const where = options.from ? { createdAt: { gte: options.from } } : {};
  const [total, open, unassigned, overdue, escalated, resolved, awaitingStudent, reopenedTickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.count({ where: { ...where, status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { ...where, assignedToId: null } }),
    prisma.ticket.count({
      where: { ...where, OR: [{ firstResponseOverdue: true }, { resolutionOverdue: true }] }
    }),
    prisma.ticket.count({ where: { ...where, escalationLevel: { gt: 0 } } }),
    prisma.ticket.count({ where: { ...where, status: { in: ["RESOLVED", "CLOSED"] } } }),
    prisma.ticket.count({ where: { ...where, status: "AWAITING_STUDENT" } }),
    prisma.ticket.count({ where: { ...where, reopenedCount: { gt: 0 } } })
  ]);
  const responseTimes = await prisma.ticket.findMany({
    where: { ...where, firstResponseAt: { not: null } },
    select: { createdAt: true, firstResponseAt: true }
  });
  const resolutionTimes = await prisma.ticket.findMany({
    where: { ...where, resolvedAt: { not: null } },
    select: { createdAt: true, resolvedAt: true }
  });
  const average = (values) => values.length === 0 ? null : Math.round(values.reduce((total2, value) => total2 + value, 0) / values.length * 10) / 10;
  const firstResponseDurations = responseTimes.filter((ticket) => ticket.firstResponseAt).map((ticket) => (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 6e4);
  const resolutionDurations = resolutionTimes.filter((ticket) => ticket.resolvedAt).map((ticket) => (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 6e4);
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, serviceTarget: true }
  });
  const perDepartment = await Promise.all(
    departments.map(async (department) => ({
      id: department.id,
      name: department.name,
      total: await prisma.ticket.count({ where: { ...where, departmentId: department.id } }),
      open: await prisma.ticket.count({
        where: { ...where, departmentId: department.id, status: { in: OPEN_STATUSES } }
      }),
      unassigned: await prisma.ticket.count({
        where: { ...where, departmentId: department.id, assignedToId: null }
      }),
      overdue: await prisma.ticket.count({
        where: {
          ...where,
          departmentId: department.id,
          OR: [{ firstResponseOverdue: true }, { resolutionOverdue: true }]
        }
      }),
      resolutionTargetMinutes: department.serviceTarget?.resolutionMinutes ?? null
    }))
  );
  const failedNotifications = await prisma.notification.count({ where: { status: "FAILED" } });
  const pendingJobs = await prisma.job.count({ where: { status: "PENDING" } });
  const failedJobs = await prisma.job.count({ where: { status: "FAILED" } });
  return {
    totals: {
      total,
      open,
      unassigned,
      overdue,
      escalated,
      resolved,
      awaitingStudent,
      reopened: reopenedTickets,
      resolutionRate: total === 0 ? 0 : Math.round(resolved / total * 1e3) / 10
    },
    timings: {
      averageFirstResponseMinutes: average(firstResponseDurations),
      averageResolutionMinutes: average(resolutionDurations)
    },
    departments: perDepartment,
    system: { failedNotifications, pendingJobs, failedJobs }
  };
}
async function getStaffWorkload(auth, departmentId) {
  assertDepartmentScope(auth, departmentId);
  const memberships = await prisma.departmentMembership.findMany({
    where: { departmentId, isActive: true },
    select: { userId: true, user: { select: { fullName: true } } }
  });
  const workload = await Promise.all(
    memberships.map(async (membership) => {
      const [assigned, open, overdue, resolved] = await Promise.all([
        prisma.ticket.count({
          where: { assignedToId: membership.userId, status: { in: OPEN_STATUSES } }
        }),
        prisma.ticket.count({ where: { assignedToId: membership.userId } }),
        prisma.ticket.count({
          where: {
            assignedToId: membership.userId,
            OR: [{ firstResponseOverdue: true }, { resolutionOverdue: true }]
          }
        }),
        prisma.ticket.count({
          where: { assignedToId: membership.userId, status: { in: ["RESOLVED", "CLOSED"] } }
        })
      ]);
      return {
        userId: membership.userId,
        fullName: membership.user.fullName,
        open,
        overdue,
        resolved,
        assigned
      };
    })
  );
  return workload.sort((a, b) => b.open - a.open);
}
async function upsertServiceTarget(departmentId, data) {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) throw notFound("Department not found.");
  if (data.firstResponseMinutes > data.resolutionMinutes) {
    throw badRequest("The first-response target must not exceed the resolution target.");
  }
  return prisma.departmentServiceTarget.upsert({
    where: { departmentId },
    create: {
      departmentId,
      firstResponseMinutes: data.firstResponseMinutes,
      resolutionMinutes: data.resolutionMinutes,
      reminderIntervalMinutes: data.reminderIntervalMinutes,
      maxReminders: data.maxReminders,
      escalationAfterReminders: data.escalationAfterReminders,
      businessHoursOnly: data.businessHoursOnly ?? false,
      escalationUserId: data.escalationUserId ?? null
    },
    update: {
      firstResponseMinutes: data.firstResponseMinutes,
      resolutionMinutes: data.resolutionMinutes,
      reminderIntervalMinutes: data.reminderIntervalMinutes,
      maxReminders: data.maxReminders,
      escalationAfterReminders: data.escalationAfterReminders,
      ...data.businessHoursOnly !== void 0 ? { businessHoursOnly: data.businessHoursOnly } : {},
      ...data.escalationUserId !== void 0 ? { escalationUserId: data.escalationUserId } : {}
    }
  });
}

// src/routes/departments.routes.ts
var departmentRouter = createRouter();
departmentRouter.use(requireAuth);
departmentRouter.get("/", async (req, res) => {
  const departments = await listDepartments(req.auth);
  res.json({ items: departments });
});
departmentRouter.get("/categories", async (req, res) => {
  const categories = await listCategories(req.auth);
  res.json({ items: categories });
});
departmentRouter.get("/:id/staff", validate(idParamSchema, "params"), async (req, res) => {
  const result = await listDepartmentStaff(req.params.id);
  res.json(result);
});
departmentRouter.get("/:id/officers", validate(idParamSchema, "params"), async (req, res) => {
  const officers = await listSelectableOfficers(req.params.id);
  res.json({
    items: officers.map((officer) => ({
      id: officer.user.id,
      fullName: officer.user.fullName,
      departmentRole: officer.departmentRole
    }))
  });
});
departmentRouter.get(
  "/:id/tickets",
  validate(idParamSchema, "params"),
  validate(ticketListQuerySchema, "query"),
  async (req, res) => {
    const result = await getDepartmentTickets(
      req.auth,
      req.params.id,
      req.query
    );
    res.json(result);
  }
);
departmentRouter.get("/:id/analytics", validate(idParamSchema, "params"), async (req, res) => {
  const metrics = await getDepartmentAnalytics(req.auth, req.params.id, {
    from: req.query.from ? new Date(String(req.query.from)) : void 0,
    to: req.query.to ? new Date(String(req.query.to)) : void 0
  });
  res.json({ metrics });
});
departmentRouter.get("/:id/workload", validate(idParamSchema, "params"), async (req, res) => {
  const workload = await getStaffWorkload(req.auth, req.params.id);
  res.json({ items: workload });
});

// src/routes/admin.routes.ts
init_prisma();
init_env();
var adminRouter = createRouter();
adminRouter.use(requireAuth);
adminRouter.get("/dashboard", requirePermission("analytics:global"), async (req, res) => {
  const dashboard = await getSystemDashboard(req.auth, {
    from: req.query.from ? new Date(String(req.query.from)) : void 0
  });
  res.json({ dashboard });
});
adminRouter.get("/users", requirePermission("user:manage"), async (req, res) => {
  const result = await listUsers(req.auth, {
    page: req.query.page ? Number(req.query.page) : void 0,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : void 0,
    search: req.query.search ? String(req.query.search) : void 0,
    role: req.query.role ? String(req.query.role) : void 0,
    accountStatus: req.query.accountStatus ? String(req.query.accountStatus) : void 0,
    departmentId: req.query.departmentId ? String(req.query.departmentId) : void 0
  });
  res.json(result);
});
adminRouter.post(
  "/users/invite",
  requirePermission("user:role:assign"),
  validate(inviteUserSchema),
  async (req, res) => {
    const user = await inviteUser(req.auth, req.body, requestMeta(req));
    res.status(201).json({ user });
  }
);
adminRouter.patch(
  "/users/:id/role",
  requirePermission("user:manage:department"),
  validate(updateUserRoleSchema),
  async (req, res) => {
    const result = await updateUserRole(
      req.auth,
      req.params.id,
      req.body.role,
      req.body.departmentId ?? null,
      req.body.departmentRole ?? null,
      requestMeta(req)
    );
    res.json(result);
  }
);
adminRouter.patch(
  "/users/:id/status",
  requirePermission("user:manage"),
  validate(updateUserStatusSchema),
  async (req, res) => {
    const result = await updateUserStatus(
      req.auth,
      req.params.id,
      req.body.accountStatus,
      req.body.reason,
      requestMeta(req)
    );
    res.json(result);
  }
);
adminRouter.post(
  "/departments",
  requirePermission("department:manage"),
  validate(departmentSchema),
  async (req, res) => {
    const department = await createDepartment(req.auth, req.body, requestMeta(req));
    res.status(201).json({ department });
  }
);
adminRouter.patch(
  "/departments/:id",
  requirePermission("department:manage"),
  validate(departmentUpdateSchema),
  async (req, res) => {
    const department = await updateDepartment(
      req.auth,
      req.params.id,
      req.body,
      requestMeta(req)
    );
    res.json({ department });
  }
);
adminRouter.put(
  "/departments/:id/service-target",
  requirePermission("department:manage"),
  validate(serviceTargetSchema),
  async (req, res) => {
    const target = await upsertServiceTarget(req.params.id, req.body);
    res.json({ serviceTarget: target });
  }
);
adminRouter.post(
  "/categories",
  requirePermission("category:manage"),
  validate(categorySchema),
  async (req, res) => {
    const category = await createCategory(req.auth, req.body, requestMeta(req));
    res.status(201).json({ category });
  }
);
adminRouter.patch(
  "/categories/:id",
  requirePermission("category:manage"),
  validate(categoryUpdateSchema),
  async (req, res) => {
    const category = await updateCategory(
      req.auth,
      req.params.id,
      req.body,
      requestMeta(req)
    );
    res.json({ category });
  }
);
adminRouter.get("/audit-logs", requirePermission("audit:read"), async (req, res) => {
  const result = await listAuditLogs(req.auth, {
    page: req.query.page ? Number(req.query.page) : void 0,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : void 0,
    action: req.query.action ? String(req.query.action) : void 0,
    entityType: req.query.entityType ? String(req.query.entityType) : void 0
  });
  res.json(result);
});
adminRouter.get("/reports", requirePermission("export:create"), async (req, res) => {
  const query = exportQuerySchema.parse(req.query);
  const result = await exportReport(req.auth, query.type, query.format ?? "json", {
    from: query.from,
    to: query.to,
    departmentId: query.departmentId
  });
  res.json(result);
});
adminRouter.get("/settings", requirePermission("settings:manage"), async (req, res) => {
  const settings = await getSettings();
  res.json({ settings });
});
adminRouter.patch(
  "/settings",
  requirePermission("settings:manage"),
  validate(settingsUpdateSchema),
  async (req, res) => {
    const settings = await updateSettings(req.auth, req.body, requestMeta(req));
    res.json({ settings });
  }
);
adminRouter.get("/system/health", requirePermission("job:manage"), async (_req, res) => {
  const [pendingJobs, failedJobs, runningJobs, failedNotifications, sentNotifications] = await Promise.all([
    prisma.job.count({ where: { status: "PENDING" } }),
    prisma.job.count({ where: { status: "FAILED" } }),
    prisma.job.count({ where: { status: "RUNNING" } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
    prisma.notification.count({ where: { status: "SENT" } })
  ]);
  res.json({
    jobs: { pending: pendingJobs, failed: failedJobs, running: runningJobs },
    notifications: { failed: failedNotifications, sent: sentNotifications },
    emailProvider: getConfig().EMAIL_PROVIDER
  });
});
adminRouter.post(
  "/system/retry-failed-notifications",
  requirePermission("job:manage"),
  async (_req, res) => {
    const failed = await prisma.notification.findMany({
      where: { status: "FAILED" },
      select: { id: true },
      take: 200
    });
    const retryBatch = Date.now().toString(36);
    const result = await prisma.job.createMany({
      data: failed.map((notification) => ({
        type: "NOTIFICATION_DELIVERY",
        payload: { notificationId: notification.id },
        dedupeKey: `deliver-retry:${notification.id}:${retryBatch}`
      })),
      skipDuplicates: true
    });
    res.json({ queued: result.count });
  }
);

// src/app.ts
function createApp() {
  const config = getConfig();
  const app = express();
  app.set("trust proxy", config.TRUST_PROXY ? 1 : false);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-site" }
    })
  );
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"]
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.requestId = req.get("x-request-id") ?? crypto3.randomUUID();
    next();
  });
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", service: "campus-resolve-api", at: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.get("/readyz", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready", database: "up" });
    } catch {
      res.status(503).json({ status: "unavailable", database: "down" });
    }
  });
  const api = express.Router();
  api.use(
    createRateLimiter({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX
    })
  );
  api.use(originGuard);
  api.use(attachSession);
  api.use(csrfProtection);
  api.use("/auth", authRouter);
  api.use("/tickets", ticketRouter);
  api.use("/notifications", notificationRouter);
  api.use("/staff", staffRouter);
  api.use("/departments", departmentRouter);
  api.use("/admin", adminRouter);
  app.use("/api/v1", api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  logger.info("API initialised", { environment: config.NODE_ENV, cors: config.CORS_ORIGINS });
  return app;
}

// src/server.ts
init_env();
init_logger();
init_prisma();
async function main() {
  const config = getConfig();
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`Campus Resolve API listening on port ${config.PORT}`, {
      environment: config.NODE_ENV,
      api: config.API_URL,
      app: config.APP_URL
    });
  });
  const shutdown = async (signal) => {
    logger.info("API received shutdown signal", { signal });
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 1e4).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
main().catch((error) => {
  logger.error("API failed to start", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : void 0
  });
  process.exit(1);
});
//# sourceMappingURL=server.js.map
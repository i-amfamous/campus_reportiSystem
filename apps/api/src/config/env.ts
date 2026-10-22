import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';

loadDotenv({ path: path.resolve(process.cwd(), '.env') });
loadDotenv({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

/** A boolean that stays undefined when it is not set, so a default can win. */
const optionalBooleanish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const intish = (fallback: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((value) => (value === undefined || value === '' ? fallback : Number(value)))
    .pipe(z.number().int());

const csv = (fallback: string[]) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === ''
        ? fallback
        : value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intish(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: csv(['http://localhost:5173']),
  TRUST_PROXY: booleanish.default(false),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),

  INSTITUTION_NAME: z.string().min(2).default('Campus Resolve'),
  INSTITUTION_EMAIL_DOMAINS: csv(['live.gctu.edu.gh']),
  SUPPORT_EMAIL: z.string().email().default('amoswnganbe@gmail.com'),

  SESSION_COOKIE_NAME: z.string().default('campus_session'),
  CSRF_COOKIE_NAME: z.string().default('campus_csrf'),
  /**
   * The `Secure` flag on the session cookies. Defaults to on in production
   * and off in development. It must be turned off explicitly for a
   * plain-HTTP deployment, because a browser refuses to store a `Secure`
   * cookie that arrives over `http://`.
   */
  COOKIE_SECURE: optionalBooleanish,
  SESSION_TTL_HOURS: intish(12),
  SESSION_SECRET: z.string().min(16).default('insecure-development-secret-change-me'),
  MFA_REQUIRED_FOR_PRIVILEGED: booleanish.default(false),

  RATE_LIMIT_WINDOW_MS: intish(15 * 60 * 1000),
  RATE_LIMIT_MAX: intish(100),
  LOGIN_RATE_LIMIT_WINDOW_MS: intish(15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX: intish(10),
  PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: intish(60 * 60 * 1000),
  PASSWORD_RESET_RATE_LIMIT_MAX: intish(5),

  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  EMAIL_FROM_NAME: z.string().default('Campus Resolve'),
  EMAIL_FROM_ADDRESS: z.string().email().default('no-reply@campusresolve.edu.gh'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_RETRY_MAX_ATTEMPTS: intish(5),
  EMAIL_RETRY_BASE_DELAY_MS: intish(60_000),

  STORAGE_DIR: z.string().default('./storage/attachments'),
  STORAGE_MAX_FILE_SIZE_MB: intish(10),

  BACKUP_DIR: z.string().default('./storage/backups'),
  /** How many archives are kept before the oldest is removed. */
  BACKUP_MAX_COUNT: intish(10),
  /** Largest archive the API accepts when restoring. */
  BACKUP_MAX_UPLOAD_MB: intish(512),

  REMINDER_INTERVAL_MINUTES: intish(120),
  ESCALATION_AFTER_REMINDERS: intish(3),
  MAX_REMINDERS: intish(8),
  SLA_FIRST_RESPONSE_MINUTES: intish(480),
  SLA_RESOLUTION_MINUTES: intish(4320),
  AUTO_CLOSE_DAYS: intish(14),

  WORKER_POLL_INTERVAL_MS: intish(30_000),
  WORKER_BATCH_SIZE: intish(25),
  WORKER_MAX_ATTEMPTS: intish(5),
  WORKER_ID: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined)),

  BOOTSTRAP_ADMIN_EMAIL: z.string().email().default('amoswnganbe@gmail.com'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default('ChangeMe!2026'),
  BOOTSTRAP_ADMIN_NAME: z.string().default('Platform Super Administrator'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function getConfig(): AppConfig {
  if (!cached) return loadConfig();
  return cached;
}

export function resetConfig(): void {
  cached = null;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

export function isTest(): boolean {
  return getConfig().NODE_ENV === 'test';
}

/** Absolute path of the private attachment directory (never web-served). */
export function storageRoot(): string {
  const root = path.resolve(process.cwd(), getConfig().STORAGE_DIR);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** Absolute path of the directory that holds the backup archives. */
export function backupRoot(): string {
  const root = path.resolve(process.cwd(), getConfig().BACKUP_DIR);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/**
 * Minimal structured logger. JSON lines in production, human readable locally.
 * Never logs secrets, tokens, passwords or full student records (PRD §19).
 */
import { getConfig } from './env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'csrfToken',
  'sessionSecret',
  'apiKey',
  'authorization',
  'resend_api_key',
]);

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key)) {
      output[key] = '[redacted]';
      continue;
    }
    output[key] = redact(entry);
  }
  return output;
}

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  const config = getConfig();
  if (ORDER[level] < ORDER[config.LOG_LEVEL]) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context ? { context: redact(context) } : {}),
  };
  if (config.NODE_ENV === 'production') {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } else {
    const extras = context ? ` ${JSON.stringify(redact(context))}` : '';
    process.stdout.write(`[${payload.ts}] ${level.toUpperCase()} ${message}${extras}\n`);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};

/**
 * Vitest setup. Runs before the test modules are imported so the environment
 * points at the dedicated test database.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://campus_resolve:campus_resolve@localhost:5433/campus_resolve_test?schema=public';
process.env.EMAIL_PROVIDER = 'console';
process.env.INSTITUTION_EMAIL_DOMAINS = 'live.gctu.edu.gh';
process.env.SESSION_SECRET = 'test-session-secret-value-for-automated-tests-0123456789';
process.env.STORAGE_DIR = './storage/test-attachments';
process.env.LOG_LEVEL = 'error';
process.env.WORKER_MAX_ATTEMPTS = '3';
process.env.EMAIL_RETRY_MAX_ATTEMPTS = '3';

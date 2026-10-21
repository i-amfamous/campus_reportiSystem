import { execFileSync } from 'node:child_process';
import path from 'node:path';

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../..');

function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    'postgresql://campus_resolve:campus_resolve@localhost:5433/campus_resolve_test?schema=public'
  );
}

/**
 * Prepares the dedicated test database: applies every migration from
 * scratch so the suite always runs against the real schema.
 */
export default function globalSetup(): void {
  const databaseUrl = testDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;
  process.env.TEST_DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_PROVIDER = 'console';
  process.env.INSTITUTION_EMAIL_DOMAINS = 'live.gctu.edu.gh';
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ?? 'test-session-secret-value-for-automated-tests-0123456789';

  execFileSync('npx', ['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  execFileSync('npx', ['prisma', 'generate'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  void repoRoot;
}

#!/usr/bin/env node
/**
 * Starts a local PostgreSQL server for development and automated tests.
 *
 * Uses the official PostgreSQL binaries shipped with the `embedded-postgres`
 * package, so a developer needs no system-wide database installation. The
 * server is started with `pg_ctl`, which keeps it running independently of
 * this script — that matters for the background worker and for test runs.
 *
 * Usage:
 *   node scripts/local-postgres.mjs start|stop|status|url
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, '.local-postgres', 'data');
const LOG_FILE = path.join(ROOT, '.local-postgres', 'postgres.log');
const PORT = Number(process.env.LOCAL_PG_PORT ?? 5433);
const USER = process.env.LOCAL_PG_USER ?? 'campus_resolve';
const PASSWORD = process.env.LOCAL_PG_PASSWORD ?? 'campus_resolve';

function binaryDir() {
  const pkg = require.resolve('@embedded-postgres/darwin-x64');
  // `require.resolve` points at the package entry; the native binaries live
  // next to it in `native/bin`.
  let dir = path.dirname(pkg);
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'native', 'bin');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('Could not locate the embedded PostgreSQL binaries.');
}

function bin(name) {
  return path.join(binaryDir(), name);
}

export function databaseUrl(database) {
  return `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${database}?schema=public`;
}

function isRunning() {
  const result = spawnSync(bin('pg_ctl'), ['-D', DATA_DIR, 'status'], { encoding: 'utf8' });
  return result.status === 0;
}

function initialise() {
  mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  if (existsSync(path.join(DATA_DIR, 'PG_VERSION'))) return;
  execFileSync(
    bin('initdb'),
    ['-D', DATA_DIR, '-U', USER, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-sync'],
    { stdio: 'inherit' },
  );
}

function start() {
  initialise();
  if (isRunning()) {
    process.stdout.write('Local PostgreSQL is already running.\n');
    return;
  }
  mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  execFileSync(bin('pg_ctl'), [
    '-D',
    DATA_DIR,
    '-l',
    LOG_FILE,
    '-o',
    `-p ${PORT} -c listen_addresses=localhost -c max_connections=120`,
    '-w',
    'start',
  ]);
  process.stdout.write(`Local PostgreSQL started on port ${PORT}.\n`);
}

function stop() {
  if (!existsSync(DATA_DIR)) {
    process.stdout.write('Local PostgreSQL is not initialised.\n');
    return;
  }
  execFileSync(bin('pg_ctl'), ['-D', DATA_DIR, '-m', 'fast', 'stop'], { stdio: 'inherit' });
  process.stdout.write('Local PostgreSQL stopped.\n');
}

async function ensureDatabases() {
  const { default: pg } = await import('pg');
  for (const database of ['campus_resolve', 'campus_resolve_test']) {
    const client = new pg.Client({ host: 'localhost', port: PORT, user: USER, database: 'postgres' });
    await client.connect();
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${database}`);
      process.stdout.write(`Created database ${database}.\n`);
    }
    await client.end();
  }
}

async function main() {
  const command = process.argv[2] ?? 'start';

  if (command === 'url') {
    process.stdout.write(`${databaseUrl('campus_resolve')}\n`);
    return;
  }
  if (command === 'status') {
    process.stdout.write(
      `Data dir: ${DATA_DIR}\nPort: ${PORT}\nRunning: ${isRunning() ? 'yes' : 'no'}\n`,
    );
    return;
  }
  if (command === 'stop') {
    stop();
    return;
  }

  start();
  await ensureDatabases();
  process.stdout.write(
    `Local PostgreSQL ready.\n` +
      `  DATABASE_URL=${databaseUrl('campus_resolve')}\n` +
      `  TEST_DATABASE_URL=${databaseUrl('campus_resolve_test')}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exit(1);
});

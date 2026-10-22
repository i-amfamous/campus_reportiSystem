/**
 * Credential reset for local and staging environments.
 *
 * Sets a known password for an account, clears any lockout, marks the
 * address verified and revokes the sessions that were created with the old
 * password. The email address of the account is never changed.
 *
 *   npm run reset:credentials                  # the bootstrap administrator
 *   npm run reset:credentials -- --all         # every account
 *   npm run reset:credentials -- --email a@b.c # a specific account
 *
 * The password comes from `BOOTSTRAP_ADMIN_PASSWORD` unless `RESET_PASSWORD`
 * is set. A password given on the command line is never accepted so that it
 * cannot end up in the shell history.
 */
import { PrismaClient } from '@prisma/client';
import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { hashPassword } from '../src/lib/crypto';

loadDotenv({ path: path.resolve(process.cwd(), 'apps/api/.env') });
loadDotenv({ path: path.resolve(process.cwd(), '.env') });
loadDotenv({ path: path.resolve(process.cwd(), 'apps/api/.env') });

const prisma = new PrismaClient();

const DEFAULT_ADMIN_EMAIL = 'amoswnganbe@gmail.com';
const DEFAULT_PASSWORD = 'ChangeMe!2026';

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  const resetAll = process.argv.includes('--all');
  const email = (readOption('email') ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  const password = process.env.RESET_PASSWORD ?? process.env.BOOTSTRAP_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;

  const users = resetAll
    ? await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
    : await prisma.user.findMany({ where: { email } });

  if (users.length === 0) {
    process.stderr.write(
      `No account found for ${email}. Run with --all to reset every account.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);

  for (const user of users) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          accountStatus: user.accountStatus === 'SUSPENDED' ? 'ACTIVE' : user.accountStatus,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    process.stdout.write(
      `Password reset for ${user.email} (${user.fullName}); active sessions revoked.\n`,
    );
  }

  process.stdout.write(`\nSign in with:\n  email:    ${users[0]?.email ?? email}\n  password: ${password}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

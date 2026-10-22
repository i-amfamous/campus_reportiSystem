import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  ApiClient,
  buildApp,
  clock,
  createUser,
  prisma,
  resetDatabase,
  TEST_PASSWORD,
} from './helpers/test-app';
import type { Express } from 'express';

const app: Express = buildApp();
let client: ApiClient;

async function latestNotification(type: string) {
  return prisma.notification.findFirst({
    where: { type: type as never },
    orderBy: { createdAt: 'desc' },
  });
}

describe('authentication', () => {
  beforeEach(async () => {
    await resetDatabase();
    clock.reset();
    client = new ApiClient(app);
  });

  afterEach(() => {
    clock.reset();
  });

  describe('registration', () => {
    it('accepts a regular student email and issues a verification OTP', async () => {
      const response = await client.post('/api/v1/auth/register', {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.email).toBe('ama@example.com');
      expect(response.body.emailVerified).toBe(false);

      const user = await prisma.user.findUnique({ where: { email: 'ama@example.com' } });
      expect(user).not.toBeNull();
      expect(user?.studentId).toBeNull();
      expect(user?.accountStatus).toBe('PENDING_VERIFICATION');
      expect(user?.passwordHash).toBeTruthy();
      expect(user?.passwordHash).not.toContain(TEST_PASSWORD);

      // Only the student role is ever granted by self-registration.
      const roles = await prisma.userRole.findMany({ where: { userId: user!.id } });
      expect(roles).toHaveLength(1);
      const role = await prisma.role.findUnique({ where: { id: roles[0]!.roleId } });
      expect(role?.name).toBe('STUDENT');

      const notification = await latestNotification('EMAIL_VERIFICATION');
      expect(notification).not.toBeNull();
      expect((notification!.payload as { otp?: string }).otp).toMatch(/^[0-9]{6}$/);
    });

    it('accepts an email address with a numeric local part but does not derive a student ID', async () => {
      const response = await client.post('/api/v1/auth/register', {
        fullName: 'Kwame Asare',
        email: '10234567@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
      });

      expect(response.status).toBe(201);
      const user = await prisma.user.findUnique({ where: { email: '10234567@example.com' } });
      expect(user?.studentId).toBeNull();
    });

    it('rejects a duplicate registration', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });
      const response = await client.post('/api/v1/auth/register', {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('never accepts a privileged role from the registration payload', async () => {
      const response = await client.post('/api/v1/auth/register', {
        fullName: 'Sneaky Admin',
        email: 'sneaky@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
        role: 'SUPER_ADMIN',
        roles: ['SUPER_ADMIN'],
        accountStatus: 'ACTIVE',
      });

      expect(response.status).toBe(201);
      const user = await prisma.user.findUnique({
        where: { email: 'sneaky@example.com' },
        include: { roles: { include: { role: true } } },
      });
      expect(user?.roles.map((role) => role.role.name)).toEqual(['STUDENT']);
      expect(user?.accountStatus).toBe('PENDING_VERIFICATION');
    });
  });

  describe('OTP verification', () => {
    it('activates the account when the OTP is used', async () => {
      await client.post('/api/v1/auth/register', {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
      });
      const notification = await latestNotification('EMAIL_VERIFICATION');
      const otp = (notification!.payload as { otp: string }).otp;

      const response = await client.post('/api/v1/auth/verify-otp', {
        email: 'ama@example.com',
        otp,
      });
      expect(response.status).toBe(200);
      expect(response.body.verified).toBe(true);

      const user = await prisma.user.findUnique({ where: { email: 'ama@example.com' } });
      expect(user?.emailVerifiedAt).not.toBeNull();
      expect(user?.accountStatus).toBe('ACTIVE');
    });

    it('rejects an incorrect OTP', async () => {
      await client.post('/api/v1/auth/register', {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
      });

      const response = await client.post('/api/v1/auth/verify-otp', {
        email: 'ama@example.com',
        otp: '000000',
      });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const user = await prisma.user.findUnique({ where: { email: 'ama@example.com' } });
      expect(user?.accountStatus).toBe('PENDING_VERIFICATION');
    });

    it('rejects OTP for an unknown email', async () => {
      const response = await client.post('/api/v1/auth/verify-otp', {
        email: 'nobody@example.com',
        otp: '123456',
      });
      expect(response.status).toBe(400);
    });

    it('rejects reuse of a verification OTP', async () => {
      await client.post('/api/v1/auth/register', {
        fullName: 'Ama Mensah',
        email: 'ama@example.com',
        password: TEST_PASSWORD,
        acceptTerms: true,
      });
      const notification = await latestNotification('EMAIL_VERIFICATION');
      const otp = (notification!.payload as { otp: string }).otp;

      await client.post('/api/v1/auth/verify-otp', { email: 'ama@example.com', otp });
      const response = await client.post('/api/v1/auth/verify-otp', { email: 'ama@example.com', otp });
      expect(response.status).toBe(400);
    });
  });

  describe('login and logout', () => {
    it('signs a verified student in and issues session cookies', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });

      const response = await client.post('/api/v1/auth/login', {
        email: 'ama@example.com',
        password: TEST_PASSWORD,
      });

      expect(response.status).toBe(200);
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((cookie) => cookie.startsWith('campus_session='))).toBe(true);
      expect(cookies.some((cookie) => cookie.startsWith('campus_csrf='))).toBe(true);

      const me = await client.get('/api/v1/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.user.email).toBe('ama@example.com');
      expect(me.body.user.roles).toEqual(['STUDENT']);
    });

    it('rejects an incorrect password without revealing whether the account exists', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });

      const wrongPassword = await client.post('/api/v1/auth/login', {
        email: 'ama@example.com',
        password: 'WrongPassword!1',
      });
      const unknownUser = await client.post('/api/v1/auth/login', {
        email: '99999999@example.com',
        password: 'WrongPassword!1',
      });

      expect(wrongPassword.status).toBe(400);
      expect(unknownUser.status).toBe(400);
      expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
    });

    it('blocks sign-in for an unverified account', async () => {
      await createUser({
        email: 'ama@example.com',
        roles: ['STUDENT'],
        emailVerified: false,
      });
      const response = await client.post('/api/v1/auth/login', {
        email: 'ama@example.com',
        password: TEST_PASSWORD,
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('blocks sign-in for a suspended account', async () => {
      await createUser({
        email: 'ama@example.com',
        roles: ['STUDENT'],
        accountStatus: 'SUSPENDED',
      });
      const response = await client.post('/api/v1/auth/login', {
        email: 'ama@example.com',
        password: TEST_PASSWORD,
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('revokes the session on logout', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });
      await client.login('ama@example.com', TEST_PASSWORD);
      expect((await client.get('/api/v1/auth/me')).status).toBe(200);

      expect((await client.post('/api/v1/auth/logout')).status).toBe(200);
      expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    });

    it('rejects state-changing requests without a CSRF token', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });
      await client.login('ama@example.com', TEST_PASSWORD);

      client.setCsrfEnabled(false);
      const response = await client.request('post', '/api/v1/auth/logout');
      client.setCsrfEnabled(true);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CSRF_FAILED');
    });
  });

  describe('password reset', () => {
    it('sends a reset link and allows the password to be changed', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });

      const request = await client.post('/api/v1/auth/forgot-password', {
        email: 'ama@example.com',
      });
      expect(request.status).toBe(200);

      const notification = await latestNotification('PASSWORD_RESET');
      const token = (notification!.payload as { token: string }).token;

      const reset = await client.post('/api/v1/auth/reset-password', {
        token,
        password: 'NewStr0ng!Password',
      });
      expect(reset.status).toBe(200);

      const signIn = await client.post('/api/v1/auth/login', {
        email: 'ama@example.com',
        password: 'NewStr0ng!Password',
      });
      expect(signIn.status).toBe(200);
    });

    it('rejects an expired reset token', async () => {
      const user = await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });
      const { hashToken } = await import('../src/lib/crypto');
      const { getConfig } = await import('../src/config/env');
      const token = 'expired-reset-token';
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token, getConfig().SESSION_SECRET),
          expiresAt: new Date(clock.nowMs() - 1000),
        },
      });

      const response = await client.post('/api/v1/auth/reset-password', {
        token,
        password: 'NewStr0ng!Password',
      });
      expect(response.status).toBe(400);
    });

    it('revokes existing sessions when the password is reset', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });
      await client.login('ama@example.com', TEST_PASSWORD);
      expect((await client.get('/api/v1/auth/me')).status).toBe(200);

      await prisma.passwordResetToken.create({
        data: {
          userId: (
            await prisma.user.findUniqueOrThrow({ where: { email: 'ama@example.com' } })
          ).id,
          tokenHash: 'irrelevant',
          expiresAt: new Date(clock.nowMs() + 60_000),
        },
      });

      await prisma.session.updateMany({ where: {}, data: { revokedAt: clock.now() } });
      expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('rate limits repeated sign-in attempts', async () => {
      await createUser({ email: 'ama@example.com', roles: ['STUDENT'] });

      let limited = false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await client.post('/api/v1/auth/login', {
          email: 'ama@example.com',
          password: 'WrongPassword!1',
        });
        if (response.status === 429) {
          limited = true;
          expect(response.body.error.code).toBe('RATE_LIMITED');
          break;
        }
      }
      expect(limited).toBe(true);
    });
  });
});

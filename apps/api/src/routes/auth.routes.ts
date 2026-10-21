import type { Router } from 'express';
import { createRouter } from '../lib/router';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@campus-resolve/shared';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { getConfig } from '../config/env';
import { requestMeta } from '../lib/request';
import * as authService from '../modules/auth/auth.service';
import { clearSessionCookies, setSessionCookies } from '../modules/auth/session.service';

export const authRouter: Router = createRouter();

const loginLimiter = createRateLimiter({
  windowMs: getConfig().LOGIN_RATE_LIMIT_WINDOW_MS,
  max: getConfig().LOGIN_RATE_LIMIT_MAX,
  key: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
      req.socket.remoteAddress ??
      'unknown';
    return `login:${ip}`;
  },
  message: 'Too many sign-in attempts. Please try again later.',
});

const passwordResetLimiter = createRateLimiter({
  windowMs: getConfig().PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  max: getConfig().PASSWORD_RESET_RATE_LIMIT_MAX,
  key: (req) => `password-reset:${req.ip}`,
  message: 'Too many password reset requests. Please try again later.',
});

const verificationLimiter = createRateLimiter({
  windowMs: getConfig().PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  max: getConfig().PASSWORD_RESET_RATE_LIMIT_MAX,
  key: (req) => `verification:${req.ip}`,
  message: 'Too many verification emails requested. Please try again later.',
});

const validationLimiter = createRateLimiter({
  windowMs: getConfig().PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  max: getConfig().PASSWORD_RESET_RATE_LIMIT_MAX,
  key: (req) => `validation:${req.ip}`,
  message: 'Too many attempts. Please try again later.',
});

authRouter.post('/register', verificationLimiter, validate(registerSchema), async (req, res) => {
  const result = await authService.registerStudent(req.body);
  res.status(201).json({
    id: result.user.id,
    email: result.user.email,
    fullName: result.user.fullName,
    studentId: result.user.studentId,
    emailVerified: false,
    message: 'Check your institutional inbox to verify your email address.',
  });
});

authRouter.post('/verify-email', validate(verifyEmailSchema), async (req, res) => {
  const result = await authService.verifyEmail(req.body.token);
  res.json({ verified: true, email: result.email, fullName: result.fullName });
});

authRouter.post(
  '/resend-verification',
  verificationLimiter,
  validate(resendVerificationSchema),
  async (req, res) => {
    await authService.resendVerification(req.body.email);
    res.json({ message: 'If the account exists and is unverified, a new link has been sent.' });
  },
);

authRouter.post(
  '/accept-invitation',
  validationLimiter,
  validate(acceptInvitationSchema),
  async (req, res) => {
    const result = await authService.acceptInvitation(req.body.token, req.body.password);
    res.json({
      email: result.email,
      fullName: result.fullName,
      message: 'Your staff account is active. You can sign in now.',
    });
  },
);

authRouter.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const result = await authService.login(req.body.email, req.body.password, requestMeta(req));
  setSessionCookies(res, {
    sessionId: result.sessionId,
    sessionToken: result.sessionToken,
    csrfToken: result.csrfToken,
    expiresAt: result.expiresAt,
  });
  res.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      studentId: result.user.studentId,
      emailVerified: result.user.emailVerifiedAt !== null,
      accountStatus: result.user.accountStatus,
    },
  });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await authService.logout(req.auth!.sessionId);
  clearSessionCookies(res);
  res.json({ message: 'Signed out.' });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: authService.toSessionUser(req.auth!) });
});

authRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  async (req, res) => {
    await authService.requestPasswordReset(req.body.email);
    res.json({ message: 'If the account exists, a password reset link has been sent.' });
  },
);

authRouter.post(
  '/reset-password',
  passwordResetLimiter,
  validate(resetPasswordSchema),
  async (req, res) => {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ message: 'Your password has been updated. You can sign in now.' });
  },
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate(changePasswordSchema),
  async (req, res) => {
    await authService.changePassword(
      req.auth!.userId,
      req.body.currentPassword,
      req.body.newPassword,
    );
    res.json({ message: 'Password updated.' });
  },
);

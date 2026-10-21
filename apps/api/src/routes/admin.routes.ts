import type { Router } from 'express';
import { createRouter } from '../lib/router';
import {
  categorySchema,
  categoryUpdateSchema,
  departmentSchema,
  departmentUpdateSchema,
  exportQuerySchema,
  inviteUserSchema,
  serviceTargetSchema,
  settingsUpdateSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from '@campus-resolve/shared';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { requestMeta } from '../lib/request';
import * as adminService from '../modules/admin/admin.service';
import * as departmentService from '../modules/departments/department.service';
import { prisma } from '../lib/prisma';
import { getConfig } from '../config/env';

export const adminRouter: Router = createRouter();

adminRouter.use(requireAuth);

adminRouter.get('/dashboard', requirePermission('analytics:global'), async (req, res) => {
  const dashboard = await departmentService.getSystemDashboard(req.auth!, {
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
  });
  res.json({ dashboard });
});

adminRouter.get('/users', requirePermission('user:manage'), async (req, res) => {
  const result = await adminService.listUsers(req.auth!, {
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
    role: req.query.role ? (String(req.query.role) as never) : undefined,
    accountStatus: req.query.accountStatus ? String(req.query.accountStatus) : undefined,
    departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
  });
  res.json(result);
});

adminRouter.post(
  '/users/invite',
  requirePermission('user:role:assign'),
  validate(inviteUserSchema),
  async (req, res) => {
    const user = await adminService.inviteUser(req.auth!, req.body, requestMeta(req));
    res.status(201).json({ user });
  },
);

adminRouter.patch(
  '/users/:id/role',
  requirePermission('user:manage:department'),
  validate(updateUserRoleSchema),
  async (req, res) => {
    const result = await adminService.updateUserRole(
      req.auth!,
      req.params.id!,
      req.body.role,
      req.body.departmentId ?? null,
      req.body.departmentRole ?? null,
      requestMeta(req),
    );
    res.json(result);
  },
);

adminRouter.patch(
  '/users/:id/status',
  requirePermission('user:manage'),
  validate(updateUserStatusSchema),
  async (req, res) => {
    const result = await adminService.updateUserStatus(
      req.auth!,
      req.params.id!,
      req.body.accountStatus,
      req.body.reason,
      requestMeta(req),
    );
    res.json(result);
  },
);

adminRouter.post(
  '/departments',
  requirePermission('department:manage'),
  validate(departmentSchema),
  async (req, res) => {
    const department = await adminService.createDepartment(req.auth!, req.body, requestMeta(req));
    res.status(201).json({ department });
  },
);

adminRouter.patch(
  '/departments/:id',
  requirePermission('department:manage'),
  validate(departmentUpdateSchema),
  async (req, res) => {
    const department = await adminService.updateDepartment(
      req.auth!,
      req.params.id!,
      req.body,
      requestMeta(req),
    );
    res.json({ department });
  },
);

adminRouter.put(
  '/departments/:id/service-target',
  requirePermission('department:manage'),
  validate(serviceTargetSchema),
  async (req, res) => {
    const target = await departmentService.upsertServiceTarget(req.params.id!, req.body);
    res.json({ serviceTarget: target });
  },
);

adminRouter.post(
  '/categories',
  requirePermission('category:manage'),
  validate(categorySchema),
  async (req, res) => {
    const category = await adminService.createCategory(req.auth!, req.body, requestMeta(req));
    res.status(201).json({ category });
  },
);

adminRouter.patch(
  '/categories/:id',
  requirePermission('category:manage'),
  validate(categoryUpdateSchema),
  async (req, res) => {
    const category = await adminService.updateCategory(
      req.auth!,
      req.params.id!,
      req.body,
      requestMeta(req),
    );
    res.json({ category });
  },
);

adminRouter.get('/audit-logs', requirePermission('audit:read'), async (req, res) => {
  const result = await adminService.listAuditLogs(req.auth!, {
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    action: req.query.action ? String(req.query.action) : undefined,
    entityType: req.query.entityType ? String(req.query.entityType) : undefined,
  });
  res.json(result);
});

adminRouter.get('/reports', requirePermission('export:create'), async (req, res) => {
  const query = exportQuerySchema.parse(req.query);
  const result = await adminService.exportReport(req.auth!, query.type, query.format ?? 'json', {
    from: query.from,
    to: query.to,
    departmentId: query.departmentId,
  });
  res.json(result);
});

adminRouter.get('/settings', requirePermission('settings:manage'), async (req, res) => {
  const settings = await adminService.getSettings();
  res.json({ settings });
});

adminRouter.patch(
  '/settings',
  requirePermission('settings:manage'),
  validate(settingsUpdateSchema),
  async (req, res) => {
    const settings = await adminService.updateSettings(req.auth!, req.body, requestMeta(req));
    res.json({ settings });
  },
);

/** Delivery and background-job health for the operations dashboard (PRD §14.3). */
adminRouter.get('/system/health', requirePermission('job:manage'), async (_req, res) => {
  const [pendingJobs, failedJobs, runningJobs, failedNotifications, sentNotifications] =
    await Promise.all([
      prisma.job.count({ where: { status: 'PENDING' } }),
      prisma.job.count({ where: { status: 'FAILED' } }),
      prisma.job.count({ where: { status: 'RUNNING' } }),
      prisma.notification.count({ where: { status: 'FAILED' } }),
      prisma.notification.count({ where: { status: 'SENT' } }),
    ]);
  res.json({
    jobs: { pending: pendingJobs, failed: failedJobs, running: runningJobs },
    notifications: { failed: failedNotifications, sent: sentNotifications },
    emailProvider: getConfig().EMAIL_PROVIDER,
  });
});

adminRouter.post(
  '/system/retry-failed-notifications',
  requirePermission('job:manage'),
  async (_req, res) => {
    const failed = await prisma.notification.findMany({
      where: { status: 'FAILED' },
      select: { id: true },
      take: 200,
    });
    const retryBatch = Date.now().toString(36);
    const result = await prisma.job.createMany({
      data: failed.map((notification) => ({
        type: 'NOTIFICATION_DELIVERY' as const,
        payload: { notificationId: notification.id },
        dedupeKey: `deliver-retry:${notification.id}:${retryBatch}`,
      })),
      skipDuplicates: true,
    });
    res.json({ queued: result.count });
  },
);

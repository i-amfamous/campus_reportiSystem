import type { Router } from 'express';
import { createRouter } from '../lib/router';
import { idParamSchema, ticketListQuerySchema } from '@campus-resolve/shared';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import * as departmentService from '../modules/departments/department.service';
import { listSelectableOfficers } from '../modules/tickets/routing.service';

export const departmentRouter: Router = createRouter();

departmentRouter.use(requireAuth);

departmentRouter.get('/', async (req, res) => {
  const departments = await departmentService.listDepartments(req.auth!);
  res.json({ items: departments });
});

departmentRouter.get('/categories', async (req, res) => {
  const categories = await departmentService.listCategories(req.auth!);
  res.json({ items: categories });
});

departmentRouter.get('/:id/staff', validate(idParamSchema, 'params'), async (req, res) => {
  const result = await departmentService.listDepartmentStaff(req.params.id!);
  res.json(result);
});

departmentRouter.get('/:id/officers', validate(idParamSchema, 'params'), async (req, res) => {
  const officers = await listSelectableOfficers(req.params.id!);
  res.json({
    items: officers.map((officer) => ({
      id: officer.user.id,
      fullName: officer.user.fullName,
      departmentRole: officer.departmentRole,
    })),
  });
});

departmentRouter.get(
  '/:id/tickets',
  validate(idParamSchema, 'params'),
  validate(ticketListQuerySchema, 'query'),
  async (req, res) => {
    const result = await departmentService.getDepartmentTickets(
      req.auth!,
      req.params.id!,
      req.query as never,
    );
    res.json(result);
  },
);

departmentRouter.get('/:id/analytics', validate(idParamSchema, 'params'), async (req, res) => {
  const metrics = await departmentService.getDepartmentAnalytics(req.auth!, req.params.id!, {
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
  });
  res.json({ metrics });
});

departmentRouter.get('/:id/workload', validate(idParamSchema, 'params'), async (req, res) => {
  const workload = await departmentService.getStaffWorkload(req.auth!, req.params.id!);
  res.json({ items: workload });
});

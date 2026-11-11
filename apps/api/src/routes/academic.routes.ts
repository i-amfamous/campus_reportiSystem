import type { Router } from 'express';
import { academicPeriodSchema, academicPeriodUpdateSchema, idParamSchema } from '@campus-resolve/shared';
import { createRouter } from '../lib/router';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { requestMeta } from '../lib/request';
import * as academicService from '../modules/academic/academic.service';

export const academicRouter: Router = createRouter();

academicRouter.use(requireAuth);

academicRouter.get('/', async (_req, res) => {
  const [items, current] = await Promise.all([
    academicService.listAcademicPeriods(),
    academicService.getCurrentAcademicPeriod(),
  ]);
  res.json({ items, current });
});

academicRouter.get('/current', async (_req, res) => {
  res.json({ period: await academicService.getCurrentAcademicPeriod() });
});

academicRouter.post(
  '/',
  requirePermission('settings:institution'),
  validate(academicPeriodSchema),
  async (req, res) => {
    const period = await academicService.createAcademicPeriod(
      req.auth!,
      req.body,
      requestMeta(req),
    );
    res.status(201).json({ period });
  },
);

academicRouter.patch(
  '/:id',
  requirePermission('settings:institution'),
  validate(idParamSchema, 'params'),
  validate(academicPeriodUpdateSchema),
  async (req, res) => {
    const period = await academicService.updateAcademicPeriod(
      req.auth!,
      req.params.id!,
      req.body,
      requestMeta(req),
    );
    res.json({ period });
  },
);

academicRouter.post(
  '/:id/current',
  requirePermission('settings:institution'),
  validate(idParamSchema, 'params'),
  async (req, res) => {
    const period = await academicService.setCurrentAcademicPeriod(
      req.auth!,
      req.params.id!,
      requestMeta(req),
    );
    res.json({ period });
  },
);

academicRouter.delete(
  '/:id',
  requirePermission('settings:institution'),
  validate(idParamSchema, 'params'),
  async (req, res) => {
    await academicService.deleteAcademicPeriod(req.auth!, req.params.id!, requestMeta(req));
    res.status(204).end();
  },
);

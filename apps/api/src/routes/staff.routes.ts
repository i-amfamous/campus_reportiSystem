import type { Router } from 'express';
import { createRouter } from '../lib/router';
import {
  assignTicketSchema,
  changeStatusSchema,
  postNoteSchema,
  resolveTicketSchema,
  ticketListQuerySchema,
} from '@campus-resolve/shared';
import { validate } from '../middleware/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { requestMeta } from '../lib/request';
import * as ticketService from '../modules/tickets/ticket.service';
import * as adminService from '../modules/admin/admin.service';

export const staffRouter: Router = createRouter();

staffRouter.use(requireAuth);

staffRouter.get('/tickets', validate(ticketListQuerySchema, 'query'), async (req, res) => {
  const result = await ticketService.listTickets(req.auth!, req.query as never);
  res.json(result);
});

staffRouter.post('/tickets/:id/acknowledge', async (req, res) => {
  const ticket = await ticketService.acknowledgeTicket(req.auth!, req.params.id!);
  res.json({ ticket });
});

staffRouter.patch('/tickets/:id/status', validate(changeStatusSchema), async (req, res) => {
  const ticket = await ticketService.changeStatus(
    req.auth!,
    req.params.id!,
    req.body.status,
    req.body.note,
  );
  res.json({ ticket });
});

staffRouter.patch('/tickets/:id/assign', validate(assignTicketSchema), async (req, res) => {
  const ticket = await ticketService.assignTicket(
    req.auth!,
    req.params.id!,
    req.body.assignedToId ?? null,
    req.body.reason,
  );
  await adminService.writeAudit(
    req.auth!,
    'TICKET_ASSIGNED',
    'Ticket',
    req.params.id,
    { assignedToId: req.body.assignedToId ?? null },
    requestMeta(req),
  );
  res.json({ ticket });
});

staffRouter.post('/tickets/:id/notes', validate(postNoteSchema), async (req, res) => {
  const note = await ticketService.postInternalNote(req.auth!, req.params.id!, req.body.body);
  res.status(201).json({ note });
});

staffRouter.post('/tickets/:id/resolve', validate(resolveTicketSchema), async (req, res) => {
  const ticket = await ticketService.resolveTicket(
    req.auth!,
    req.params.id!,
    req.body.resolutionSummary,
  );
  res.json({ ticket });
});

staffRouter.get('/queue', requirePermission('ticket:read:department'), async (req, res) => {
  const result = await ticketService.listTickets(req.auth!, {
    page: 1,
    pageSize: 50,
    departmentId: req.auth!.departments[0]?.departmentId,
  });
  res.json(result);
});

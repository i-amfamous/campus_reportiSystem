import type { Router } from 'express';
import { createRouter } from '../lib/router';
import multer from 'multer';
import {
  attachmentIdParamSchema,
  createTicketSchema,
  escalateTicketSchema,
  feedbackSchema,
  idParamSchema,
  postMessageSchema,
  reopenTicketSchema,
  ticketListQuerySchema,
  withdrawTicketSchema,
} from '@campus-resolve/shared';
import { validate } from '../middleware/validate';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { getConfig } from '../config/env';
import { badRequest } from '../lib/errors';
import * as ticketService from '../modules/tickets/ticket.service';
import * as attachmentService from '../modules/tickets/attachment.service';
import { listNotifications } from '../modules/notifications/notification.service';

export const ticketRouter: Router = createRouter();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getConfig().STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
});

ticketRouter.post(
  '/',
  requireAuth,
  requireVerifiedEmail,
  validate(createTicketSchema),
  async (req, res) => {
    const ticket = await ticketService.createTicket(req.auth!, req.body);
    res.status(201).json({
      id: ticket.id,
      referenceNumber: ticket.referenceNumber,
      status: ticket.status,
      departmentId: ticket.departmentId,
      assignedToId: ticket.assignedToId,
      message: 'Your report has been received.',
    });
  },
);

ticketRouter.get('/', requireAuth, validate(ticketListQuerySchema, 'query'), async (req, res) => {
  const result = await ticketService.listTickets(req.auth!, req.query as never);
  res.json(result);
});

ticketRouter.get('/:id', requireAuth, validate(idParamSchema, 'params'), async (req, res) => {
  const ticket = await ticketService.getTicketForUser(req.auth!, req.params.id!);
  res.json({ ticket });
});

ticketRouter.post(
  '/:id/messages',
  requireAuth,
  validate(idParamSchema, 'params'),
  validate(postMessageSchema),
  async (req, res) => {
    const message = await ticketService.postMessage(req.auth!, req.params.id!, req.body.body);
    res.status(201).json({ message });
  },
);

ticketRouter.post(
  '/:id/attachments',
  requireAuth,
  validate(idParamSchema, 'params'),
  upload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('No file was uploaded.');
    const attachment = await attachmentService.addAttachment(req.auth!, req.params.id!, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
    res.status(201).json({ attachment });
  },
);

ticketRouter.post(
  '/:id/reopen',
  requireAuth,
  validate(idParamSchema, 'params'),
  validate(reopenTicketSchema),
  async (req, res) => {
    const ticket = await ticketService.reopenTicket(req.auth!, req.params.id!, req.body.reason);
    res.json({ ticket });
  },
);

ticketRouter.post(
  '/:id/escalate',
  requireAuth,
  validate(idParamSchema, 'params'),
  validate(escalateTicketSchema),
  async (req, res) => {
    const ticket = await ticketService.escalateTicket(
      req.auth!,
      req.params.id!,
      req.body.reason,
      req.body.targetUserId ?? null,
    );
    res.json({ ticket });
  },
);

ticketRouter.post(
  '/:id/withdraw',
  requireAuth,
  validate(idParamSchema, 'params'),
  validate(withdrawTicketSchema),
  async (req, res) => {
    const ticket = await ticketService.withdrawTicket(req.auth!, req.params.id!, req.body.reason);
    res.json({ ticket });
  },
);

ticketRouter.post(
  '/:id/feedback',
  requireAuth,
  validate(idParamSchema, 'params'),
  validate(feedbackSchema),
  async (req, res) => {
    const feedback = await ticketService.submitFeedback(
      req.auth!,
      req.params.id!,
      req.body.rating,
      req.body.comment,
    );
    res.status(201).json({ feedback });
  },
);

ticketRouter.get(
  '/:id/attachments/:attachmentId/download',
  requireAuth,
  validate(attachmentIdParamSchema, 'params'),
  async (req, res) => {
    const attachment = await attachmentService.getAttachmentForDownload(
      req.auth!,
      req.params.attachmentId!,
    );
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${attachment.filename.replace(/"/g, '')}"`,
    );
    res.setHeader('Content-Length', String(attachment.buffer.byteLength));
    res.send(attachment.buffer);
  },
);

export const notificationRouter: Router = createRouter();

notificationRouter.get('/', requireAuth, async (req, res) => {
  const notifications = await listNotifications(req.auth!.userId, 50);
  res.json({
    items: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      status: notification.status,
      ticketId: notification.ticketId,
      createdAt: notification.createdAt,
      sentAt: notification.sentAt,
    })),
  });
});

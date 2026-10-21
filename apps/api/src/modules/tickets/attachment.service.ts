import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { storageProvider, validateUpload } from '../../services/storage.service';
import * as policy from './ticket.policy';
import type { AuthContext } from '../auth/auth.types';

export interface UploadedAttachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}

export async function addAttachment(
  auth: AuthContext,
  ticketId: string,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
): Promise<UploadedAttachment> {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound('Ticket not found.');
  if (!policy.canUploadAttachment(auth, ticket)) {
    throw forbidden('You cannot attach files to this ticket.');
  }
  if (['CLOSED', 'WITHDRAWN', 'RESOLVED'].includes(ticket.status)) {
    throw badRequest('Attachments cannot be added to a closed, withdrawn or resolved ticket.');
  }

  validateUpload(file.buffer, file.mimetype, file.originalname);

  const stored = await storageProvider.save(file.buffer, file.originalname, file.mimetype);

  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      uploadedById: auth.userId,
      storageKey: stored.storageKey,
      originalFilename: stored.originalFilename,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      checksum: stored.checksum,
    },
  });

  await prisma.ticketHistory.create({
    data: {
      ticketId,
      actorId: auth.userId,
      actionType: 'ATTACHMENT_ADDED',
      newValue: stored.originalFilename,
      reason: 'Supporting document attached.',
    },
  });

  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    createdAt: attachment.createdAt,
  };
}

export interface AttachmentDownload {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export async function getAttachmentForDownload(
  auth: AuthContext,
  attachmentId: string,
): Promise<AttachmentDownload> {
  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      ticket: {
        select: { id: true, studentId: true, departmentId: true, assignedToId: true, status: true },
      },
    },
  });
  if (!attachment) throw notFound('Attachment not found.');

  // Resource-level authorization on every download (PRD §19).
  if (!policy.canDownloadAttachment(auth, attachment.ticket)) {
    throw forbidden('You do not have access to this attachment.');
  }

  const buffer = await storageProvider.read(attachment.storageKey);
  return {
    buffer,
    mimeType: attachment.mimeType,
    filename: attachment.originalFilename,
  };
}

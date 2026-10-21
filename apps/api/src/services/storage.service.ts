import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storageRoot, getConfig } from '../config/env';
import { badRequest, payloadTooLarge, unsupportedMediaType } from '../lib/errors';

export interface StoredFile {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
}

export interface StorageProvider {
  save(buffer: Buffer, filename: string, mimeType: string): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'text/plain': ['txt', 'log', 'csv'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-excel': ['xls'],
};

/**
 * Magic-number sniffing so a renamed executable cannot masquerade as an
 * accepted document type (PRD §19).
 */
function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 4).toString('hex') === '25504446') return 'application/pdf';
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (
    buffer.subarray(0, 4).toString('hex') === 'd0cf11e0' ||
    buffer.subarray(0, 2).toString('hex') === '504b'
  ) {
    return 'application/octet-stream';
  }
  const head = buffer.subarray(0, 64).toString('utf8');
  // eslint-disable-next-line no-control-regex
  if (!/[\x00-\x08\x0E-\x1F]/.test(head)) return 'text/plain';
  return null;
}

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, '_');
  const trimmed = base.replace(/^\.+/, '').slice(0, 180);
  return trimmed.length > 0 ? trimmed : 'attachment';
}

export function validateUpload(buffer: Buffer, declaredMimeType: string, filename: string): void {
  const config = getConfig();
  const maxBytes = config.STORAGE_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (buffer.byteLength > maxBytes) {
    throw payloadTooLarge(
      `Attachments must be smaller than ${config.STORAGE_MAX_FILE_SIZE_MB} MB.`,
    );
  }
  if (buffer.byteLength === 0) {
    throw badRequest('The uploaded file is empty.');
  }

  const extension = path.extname(filename).replace('.', '').toLowerCase();
  const allowedExtensions = ALLOWED_MIME_TYPES[declaredMimeType];
  if (!allowedExtensions) {
    throw unsupportedMediaType(`Files of type "${declaredMimeType}" are not accepted.`);
  }
  if (!allowedExtensions.includes(extension)) {
    throw unsupportedMediaType(
      `The file extension ".${extension}" does not match the accepted types.`,
    );
  }

  const sniffed = sniffMimeType(buffer);
  if (!sniffed) {
    throw unsupportedMediaType('The file content could not be verified.');
  }
  if (sniffed !== 'application/octet-stream' && sniffed !== declaredMimeType) {
    throw unsupportedMediaType('The file content does not match its declared type.');
  }
}

/**
 * Local private filesystem storage.
 *
 * Files are written outside any web-served directory and can only be retrieved
 * through the authorized download endpoint (PRD §16, §19).
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(root = storageRoot()) {
    this.root = root;
  }

  private resolveKey(storageKey: string): string {
    const target = path.resolve(this.root, storageKey);
    if (!target.startsWith(path.resolve(this.root) + path.sep)) {
      throw badRequest('Invalid storage key.');
    }
    return target;
  }

  async save(buffer: Buffer, filename: string, mimeType: string): Promise<StoredFile> {
    const safeName = sanitizeFilename(filename);
    const key = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${safeName}`;
    const target = this.resolveKey(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { mode: 0o600 });
    return {
      storageKey: key,
      originalFilename: safeName,
      mimeType,
      fileSize: buffer.byteLength,
      checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    const target = this.resolveKey(storageKey);
    try {
      return await fs.readFile(target);
    } catch {
      throw badRequest('The attachment is no longer available.');
    }
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.resolveKey(storageKey);
    await fs.rm(target, { force: true });
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }
}

export const storageProvider: StorageProvider = new LocalStorageProvider();

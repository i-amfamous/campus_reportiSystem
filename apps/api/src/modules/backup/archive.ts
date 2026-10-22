/**
 * The backup archive format.
 *
 * A backup is a gzipped tar with this layout:
 *
 *   manifest.json          metadata, table row counts and a checksum
 *   data/<table>.jsonl     one JSON object per row, one table per file
 *   attachments/<key>      the attachment files referenced by the rows
 *
 * Every table is stored as JSON Lines so a single corrupt row can be found
 * without unpacking the whole archive, and so an administrator can read the
 * contents with ordinary tools.
 */
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';

export const BACKUP_FORMAT = 'campus-resolve-backup';
export const BACKUP_VERSION = 1;

export const MANIFEST_PATH = 'manifest.json';
export const DATA_PREFIX = 'data/';
export const ATTACHMENT_PREFIX = 'attachments/';

/** Marker used to round-trip 64-bit integers through JSON. */
const BIGINT_MARKER = '$bigint';

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  createdBy: { id: string; email: string; fullName: string };
  tables: { name: string; rows: number }[];
  attachments: { count: number; bytes: number };
  /** SHA-256 over every `data/*.jsonl` payload, in table order. */
  dataChecksum: string;
}

/**
 * The tables in the order they must be written and restored.
 *
 * The order is a topological sort of the foreign keys: a parent row is always
 * written before the children that point at it, so a restore can insert the
 * tables one after another without violating a constraint. Deleting runs in
 * the reverse order.
 */
export const BACKUP_TABLES = [
  'role',
  'permission',
  'rolePermission',
  'user',
  'userRole',
  'session',
  'emailVerificationToken',
  'passwordResetToken',
  'department',
  'departmentMembership',
  'departmentServiceTarget',
  'departmentBusinessHour',
  'departmentHoliday',
  'category',
  'ticket',
  'ticketMessage',
  'ticketAttachment',
  'ticketHistory',
  'escalationEvent',
  'studentFeedback',
  'notification',
  'notificationAttempt',
  'job',
  'reminderOccurrence',
  'auditLog',
  'systemSetting',
  'counter',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** The archive file name for a table, e.g. `user` → `data/user.jsonl`. */
export function dataPath(table: string): string {
  return `${DATA_PREFIX}${table}.jsonl`;
}

/** The archive file name for an attachment, e.g. `2026/x.pdf`. */
export function attachmentPath(storageKey: string): string {
  return `${ATTACHMENT_PREFIX}${storageKey}`;
}

/**
 * Serialises a row. Dates become ISO strings (JSON.stringify already does
 * that) and 64-bit integers become a tagged object, because JSON has no
 * integer type.
 */
export function serializeRow(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_key, value: unknown) =>
    typeof value === 'bigint' ? { [BIGINT_MARKER]: value.toString() } : value,
  );
}

/** Reverses {@link serializeRow}. */
export function deserializeRow(line: string): Record<string, unknown> {
  const parsed = JSON.parse(line) as unknown;
  return reviveBigInts(parsed) as Record<string, unknown>;
}

function reviveBigInts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveBigInts);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  const marker = record[BIGINT_MARKER];
  if (typeof marker === 'string') {
    return BigInt(marker);
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    output[key] = reviveBigInts(entry);
  }
  return output;
}

/** Parses a JSON Lines payload back into rows. */
export function parseRows(payload: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const line of payload.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    rows.push(deserializeRow(trimmed));
  }
  return rows;
}

/** Running SHA-256 over the data payloads, in table order. */
export class ChecksumBuilder {
  private readonly hash = crypto.createHash('sha256');

  update(payload: string): void {
    this.hash.update(payload, 'utf8');
  }

  digest(): string {
    return this.hash.digest('hex');
  }
}

/** SHA-256 of an arbitrary buffer, used for attachment integrity. */
export function bufferChecksum(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Validates a parsed manifest before anything is written to the database. */
export function assertUsableManifest(manifest: unknown): asserts manifest is BackupManifest {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('The archive has no manifest.');
  }
  const candidate = manifest as Partial<BackupManifest>;
  if (candidate.format !== BACKUP_FORMAT) {
    throw new Error(`Unsupported archive format "${String(candidate.format)}".`);
  }
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    throw new Error(`Unsupported archive version "${String(candidate.version)}".`);
  }
  if (!Array.isArray(candidate.tables)) {
    throw new Error('The archive manifest has no table list.');
  }
}

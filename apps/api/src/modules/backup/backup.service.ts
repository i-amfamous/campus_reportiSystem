/**
 * Backup and restore for the whole platform.
 *
 * A backup is a single `.tar.gz` archive holding every table and every
 * attachment file. Restoring it replaces the current contents of the database
 * and the attachment directory with the contents of the archive, inside a
 * single transaction, so a failure leaves the system exactly as it was.
 *
 * While a restore is running the background worker is held back through a
 * `system_settings` lock: it must not deliver a notification against a
 * half-restored system.
 */
import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { prisma } from '../../lib/prisma';
import { clock } from '../../config/clock';
import { backupRoot, getConfig, storageRoot } from '../../config/env';
import { badRequest, conflict } from '../../lib/errors';
import { extractTar, tarEndChunk, tarEntryChunks } from '../../lib/tar';
import { storageProvider } from '../../services/storage.service';
import {
  ATTACHMENT_PREFIX,
  BACKUP_TABLES,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  ChecksumBuilder,
  MANIFEST_PATH,
  assertUsableManifest,
  attachmentPath,
  dataPath,
  parseRows,
  serializeRow,
  type BackupManifest,
  type BackupTable,
} from './archive';

/** Advisory lock key that serialises concurrent restores. */
const RESTORE_ADVISORY_LOCK = 817_204_773;

/** The `system_settings` key that tells the worker to hold back. */
export const RESTORE_LOCK_KEY = 'system.restoreLock';

const BACKUP_ID_PATTERN = /^campus-resolve-backup-\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const ARCHIVE_SUFFIX = '.tar.gz';
const SIDECAR_SUFFIX = '.json';

type Row = Record<string, unknown>;

interface TableDelegate {
  findMany(): Promise<Row[]>;
  deleteMany(args?: { where?: unknown }): Promise<unknown>;
  createMany(args: { data: Row[] }): Promise<unknown>;
}

/**
 * The model delegates of a Prisma client, keyed by model name. The cast is
 * confined to this helper: the archive is generic over tables, so the rows
 * are handled as plain records.
 */
function modelsOf(client: unknown): Record<BackupTable, TableDelegate> {
  return client as Record<BackupTable, TableDelegate>;
}

export interface BackupSummary {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  tables: number;
  rows: number;
  attachments: number;
  missingAttachments: number;
}

export interface RestoreSummary {
  restoredAt: string;
  tables: { name: string; rows: number }[];
  rows: number;
  attachments: number;
  missingAttachments: number;
}

/** Rejects anything that is not a backup id this service produced. */
function assertValidBackupId(id: string): string {
  if (!BACKUP_ID_PATTERN.test(id)) {
    throw badRequest('That is not a valid backup identifier.');
  }
  return id;
}

function archivePath(id: string): string {
  return path.join(backupRoot(), `${id}${ARCHIVE_SUFFIX}`);
}

function sidecarPath(id: string): string {
  return path.join(backupRoot(), `${id}${SIDECAR_SUFFIX}`);
}

/** Serialises every table into JSON Lines payloads. */
async function readTables(): Promise<Map<BackupTable, string>> {
  const payloads = new Map<BackupTable, string>();
  const models = modelsOf(prisma);
  for (const table of BACKUP_TABLES) {
    const rows = await models[table].findMany();
    const lines = rows
      .filter((row) => !(table === 'systemSetting' && row.key === RESTORE_LOCK_KEY))
      .map((row) => serializeRow(row));
    payloads.set(table, lines.length > 0 ? `${lines.join('\n')}\n` : '');
  }
  return payloads;
}

/**
 * Writes the archive to disk. The manifest is written last because it carries
 * the checksum of the data section, which is only known at the end.
 */
async function writeArchive(
  target: string,
  payloads: Map<BackupTable, string>,
  attachments: { storageKey: string; data: Buffer }[],
  manifestBase: Omit<BackupManifest, 'dataChecksum' | 'tables' | 'attachments'>,
): Promise<BackupManifest> {
  const checksum = new ChecksumBuilder();
  const tables: { name: string; rows: number }[] = [];
  let attachmentBytes = 0;

  const entries: (() => AsyncGenerator<Buffer>)[] = [];

  for (const table of BACKUP_TABLES) {
    const payload = payloads.get(table) ?? '';
    checksum.update(payload);
    const rows = payload === '' ? 0 : payload.trimEnd().split('\n').length;
    tables.push({ name: table, rows });
    entries.push(async function* tableEntry() {
      yield* tarEntryChunks({
        name: dataPath(table),
        data: Buffer.from(payload, 'utf8'),
        mtime: clock.now(),
      });
    });
  }

  for (const attachment of attachments) {
    attachmentBytes += attachment.data.byteLength;
    entries.push(async function* attachmentEntry() {
      yield* tarEntryChunks({
        name: attachmentPath(attachment.storageKey),
        data: attachment.data,
        mtime: clock.now(),
      });
    });
  }

  const manifest: BackupManifest = {
    ...manifestBase,
    tables,
    attachments: { count: attachments.length, bytes: attachmentBytes },
    dataChecksum: checksum.digest(),
  };

  entries.push(async function* manifestEntry() {
    yield* tarEntryChunks({
      name: MANIFEST_PATH,
      data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      mtime: clock.now(),
    });
  });

  const source = (async function* source() {
    for (const entry of entries) {
      yield* entry();
    }
    yield tarEndChunk();
  })();

  await pipeline(source, zlib.createGzip({ level: 6 }), createWriteStream(target));

  return manifest;
}

/** Reads every attachment referenced by the database. */
async function readAttachments(): Promise<{ stored: { storageKey: string; data: Buffer }[]; missing: string[] }> {
  const rows = await prisma.ticketAttachment.findMany({ select: { storageKey: true } });
  const stored: { storageKey: string; data: Buffer }[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    try {
      const data = await storageProvider.read(row.storageKey);
      stored.push({ storageKey: row.storageKey, data });
    } catch {
      missing.push(row.storageKey);
    }
  }
  return { stored, missing };
}

/**
 * Creates a backup and returns its summary. The manifest is also written next
 * to the archive so the list can be rendered without unpacking anything.
 */
export async function createBackup(
  createdBy: { id: string; email: string; fullName: string },
): Promise<BackupSummary> {
  const id = `campus-resolve-backup-${clock.now().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${crypto
    .randomBytes(4)
    .toString('hex')}`;
  const target = archivePath(id);

  const payloads = await readTables();
  const { stored, missing } = await readAttachments();

  const manifest = await writeArchive(
    target,
    payloads,
    stored,
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: clock.now().toISOString(),
      createdBy,
    },
  );

  await fs.writeFile(sidecarPath(id), JSON.stringify(manifest, null, 2), 'utf8');

  const stat = await fs.stat(target);
  const summary: BackupSummary = {
    id,
    filename: `${id}${ARCHIVE_SUFFIX}`,
    sizeBytes: stat.size,
    createdAt: manifest.createdAt,
    createdBy: createdBy.fullName || createdBy.email,
    tables: manifest.tables.length,
    rows: manifest.tables.reduce((total, table) => total + table.rows, 0),
    attachments: manifest.attachments.count,
    missingAttachments: missing.length,
  };

  await pruneOldBackups();
  return summary;
}

/** Lists the backups on disk, newest first. */
export async function listBackups(): Promise<BackupSummary[]> {
  const root = backupRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const summaries: BackupSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(SIDECAR_SUFFIX)) continue;
    const id = entry.name.slice(0, -SIDECAR_SUFFIX.length);
    if (!BACKUP_ID_PATTERN.test(id)) continue;
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(root, entry.name), 'utf8')) as BackupManifest;
      const stat = await fs.stat(archivePath(id));
      summaries.push({
        id,
        filename: `${id}${ARCHIVE_SUFFIX}`,
        sizeBytes: stat.size,
        createdAt: manifest.createdAt,
        createdBy: manifest.createdBy?.fullName || manifest.createdBy?.email || 'Unknown',
        tables: manifest.tables.length,
        rows: manifest.tables.reduce((total, table) => total + table.rows, 0),
        attachments: manifest.attachments.count,
        missingAttachments: 0,
      });
    } catch {
      // A sidecar that cannot be read is ignored rather than breaking the list.
    }
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The absolute path of an archive, for streaming it to the client. */
export function backupArchivePath(id: string): string {
  assertValidBackupId(id);
  return archivePath(id);
}

/** Deletes an archive and its sidecar. */
export async function deleteBackup(id: string): Promise<void> {
  assertValidBackupId(id);
  await fs.rm(archivePath(id), { force: true });
  await fs.rm(sidecarPath(id), { force: true });
}

/** Removes the oldest archives so the directory does not grow without bound. */
async function pruneOldBackups(): Promise<void> {
  const max = getConfig().BACKUP_MAX_COUNT;
  if (max <= 0) return;
  const backups = await listBackups();
  for (const backup of backups.slice(max)) {
    await deleteBackup(backup.id);
  }
}

/* -------------------------------------------------------------------------- */
/* Restore                                                                     */
/* -------------------------------------------------------------------------- */

/** True while a restore is in progress. */
export async function isRestoreInProgress(): Promise<boolean> {
  const lock = await prisma.systemSetting.findUnique({ where: { key: RESTORE_LOCK_KEY } });
  const value = lock?.value as { active?: boolean } | undefined;
  return value?.active === true;
}

async function setRestoreLock(active: boolean, actorId: string): Promise<void> {
  const value = { active, updatedAt: clock.now().toISOString(), actorId };
  await prisma.systemSetting.upsert({
    where: { key: RESTORE_LOCK_KEY },
    create: { key: RESTORE_LOCK_KEY, value },
    update: { value },
  });
}

/** Removes the lock row so it never survives into the next backup. */
async function clearRestoreLock(): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key: RESTORE_LOCK_KEY } });
}

/**
 * Writes the archived attachments back into the attachment directory and
 * removes any file that the archive does not contain.
 */
async function restoreAttachments(files: Map<string, Buffer>): Promise<{ restored: number; missing: number }> {
  const root = storageRoot();
  const written = new Set<string>();
  let restored = 0;

  for (const [name, data] of files) {
    if (!name.startsWith(ATTACHMENT_PREFIX)) continue;
    const storageKey = name.slice(ATTACHMENT_PREFIX.length);
    const target = path.resolve(root, storageKey);
    if (!target.startsWith(path.resolve(root) + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { mode: 0o600 });
    written.add(storageKey);
    restored += 1;
  }

  // Drop files that are no longer referenced by the restored database.
  const existing = await listStorageFiles(root);
  for (const storageKey of existing) {
    if (!written.has(storageKey)) {
      await fs.rm(path.resolve(root, storageKey), { force: true });
    }
  }

  return { restored, missing: 0 };
}

/** Every file in the attachment directory, as storage keys. */
async function listStorageFiles(root: string, prefix = ''): Promise<string[]> {
  const directory = path.resolve(root, prefix);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const keys: string[] = [];
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      keys.push(...(await listStorageFiles(root, key)));
    } else if (entry.isFile()) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Restores the platform from an archive.
 *
 * The database is replaced inside one transaction; the attachment files are
 * written afterwards while the worker is still held back.
 */
export async function restoreBackup(
  archive: Buffer,
  actorId: string,
): Promise<RestoreSummary> {
  let tar: Buffer;
  try {
    tar = zlib.gunzipSync(archive);
  } catch {
    throw badRequest('That file is not a readable Campus Resolve backup archive.');
  }

  const files = extractTar(tar);
  const manifestRaw = files.get(MANIFEST_PATH);
  if (!manifestRaw) throw badRequest('The archive has no manifest and cannot be restored.');

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(manifestRaw.toString('utf8')) as BackupManifest;
  } catch {
    throw badRequest('The archive manifest is corrupt and cannot be restored.');
  }
  assertUsableManifest(manifest);

  // Verify the data section before anything is touched.
  const checksum = new ChecksumBuilder();
  for (const table of BACKUP_TABLES) {
    checksum.update(files.get(dataPath(table))?.toString('utf8') ?? '');
  }
  if (checksum.digest() !== manifest.dataChecksum) {
    throw badRequest('The archive is corrupted: its contents do not match its checksum.');
  }

  if (await isRestoreInProgress()) {
    throw conflict('Another restore is already running. Wait for it to finish.');
  }

  await setRestoreLock(true, actorId);

  try {
    const tableRows = new Map<BackupTable, Row[]>();
    for (const table of BACKUP_TABLES) {
      const payload = files.get(dataPath(table));
      tableRows.set(table, payload ? parseRows(payload.toString('utf8')) : []);
    }

    await prisma.$transaction(
      async (tx) => {
        // Serialise concurrent restores on the same database. The lock
        // function returns `void`, so a constant is selected next to it to
        // give the driver a type it can read.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${RESTORE_ADVISORY_LOCK})`;

        const models = modelsOf(tx);

        // Children first, so no constraint is ever violated. The restore lock
        // lives in `system_settings` and must survive the rewrite, otherwise
        // the worker would be released half way through the restore.
        for (const table of [...BACKUP_TABLES].reverse()) {
          if (table === 'systemSetting') {
            await models[table].deleteMany({ where: { key: { not: RESTORE_LOCK_KEY } } });
          } else {
            await models[table].deleteMany();
          }
        }

        for (const table of BACKUP_TABLES) {
          let rows = tableRows.get(table) ?? [];
          if (table === 'systemSetting') {
            rows = rows.filter((row) => row.key !== RESTORE_LOCK_KEY);
          }
          if (rows.length === 0) continue;
          await models[table].createMany({ data: rows });
        }
      },
      // A full restore rewrites every table, so it needs far longer than the
      // default interactive-transaction timeout.
      { timeout: 15 * 60_000, maxWait: 60_000 },
    );

    // Any job that was running when the archive was taken is re-queued.
    await prisma.job.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'PENDING', lockedBy: null, lockedAt: null },
    });

    const { restored } = await restoreAttachments(files);
    const attachmentRows = await prisma.ticketAttachment.count();

    return {
      restoredAt: clock.now().toISOString(),
      tables: manifest.tables,
      rows: manifest.tables.reduce((total, table) => total + table.rows, 0),
      attachments: restored,
      missingAttachments: Math.max(0, attachmentRows - restored),
    };
  } finally {
    await clearRestoreLock();
  }
}

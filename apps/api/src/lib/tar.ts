/**
 * A small, dependency-free USTAR reader and writer.
 *
 * The backup archive is a plain `.tar.gz`, so an administrator can always
 * inspect or extract it with the standard tools (`tar xzf`) even if this
 * application is no longer available. Only the subset of the format that the
 * archive needs is implemented: regular files, octal numeric fields and the
 * optional `prefix` field for long paths.
 */
import { Buffer } from 'node:buffer';

const BLOCK_SIZE = 512;
const NAME_FIELD = 100;
const PREFIX_FIELD = 155;

/** A file inside the archive. */
export interface TarEntry {
  name: string;
  data: Buffer;
  mode?: number;
  mtime?: Date;
}

function writeOctal(value: number, length: number): Buffer {
  const text = Math.max(0, Math.floor(value)).toString(8);
  if (text.length > length - 1) {
    throw new Error(`Value ${value} does not fit in ${length} octal bytes.`);
  }
  return Buffer.from(`${text.padStart(length - 1, '0')}\0`, 'ascii');
}

function readOctal(header: Buffer, offset: number, length: number): number {
  const raw = header.subarray(offset, offset + length).toString('ascii').replace(/\0.*$/, '').trim();
  if (raw === '') return 0;
  const value = parseInt(raw, 8);
  return Number.isFinite(value) ? value : 0;
}

function readString(header: Buffer, offset: number, length: number): string {
  const raw = header.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
}

/**
 * Splits a path into the ustar `prefix` and `name` fields. A name longer than
 * 100 bytes is only representable if it can be split on a directory boundary.
 */
function splitName(name: string): { prefix: string; file: string } {
  if (Buffer.byteLength(name) <= NAME_FIELD) return { prefix: '', file: name };
  const parts = name.split('/');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const prefix = parts.slice(0, index).join('/');
    const file = parts.slice(index).join('/');
    if (
      Buffer.byteLength(file) <= NAME_FIELD &&
      Buffer.byteLength(prefix) <= PREFIX_FIELD
    ) {
      return { prefix, file };
    }
  }
  throw new Error(`Path is too long for a tar archive: ${name}`);
}

function buildHeader(entry: TarEntry, size: number): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE, 0);
  const { prefix, file } = splitName(entry.name);
  const mode = entry.mode ?? 0o600;
  const mtime = Math.floor((entry.mtime ?? new Date()).getTime() / 1000);

  header.write(file, 0, NAME_FIELD, 'utf8');
  writeOctal(mode & 0o7777, 8).copy(header, 100);
  writeOctal(0, 8).copy(header, 108); // uid
  writeOctal(0, 8).copy(header, 116); // gid
  writeOctal(size, 12).copy(header, 124);
  writeOctal(mtime, 12).copy(header, 136);
  header.write('        ', 148, 8, 'ascii'); // checksum placeholder
  header.write('0', 156, 1, 'ascii'); // typeflag: regular file
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  if (prefix) header.write(prefix, 345, PREFIX_FIELD, 'utf8');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

function pad(size: number): Buffer {
  const remainder = size % BLOCK_SIZE;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK_SIZE - remainder, 0);
}

/** Serialises one entry into its header, payload and padding. */
export function tarEntryChunks(entry: TarEntry): Buffer[] {
  const size = entry.data.byteLength;
  return [buildHeader(entry, size), entry.data, pad(size)];
}

/** The two zero blocks that terminate a tar archive. */
export function tarEndChunk(): Buffer {
  return Buffer.alloc(BLOCK_SIZE * 2, 0);
}

/**
 * Reads every regular file out of an uncompressed tar archive.
 * Unknown entry types are skipped.
 */
export function extractTar(archive: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;

  while (offset + BLOCK_SIZE <= archive.byteLength) {
    const header = archive.subarray(offset, offset + BLOCK_SIZE);
    let empty = true;
    for (const byte of header) {
      if (byte !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break; // end-of-archive marker

    const name = readString(header, 0, NAME_FIELD);
    const prefix = readString(header, 345, PREFIX_FIELD);
    const size = readOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] ?? 0x30);
    offset += BLOCK_SIZE;

    const data = archive.subarray(offset, offset + size);
    offset += Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    if (offset > archive.byteLength) {
      throw new Error('The tar archive is truncated.');
    }

    if (typeflag === '0' || typeflag === '\0' || typeflag === '7') {
      const fullName = prefix ? `${prefix}/${name}` : name;
      files.set(fullName, Buffer.from(data));
    }
  }

  return files;
}

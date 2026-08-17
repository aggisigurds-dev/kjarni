/**
 * A minimal ZIP writer, store mode only.
 *
 * Binary STL is dense float data that deflate barely touches, so skipping
 * compression costs a few percent of file size and saves pulling in a
 * compression library. Produces a normal .zip that any tool can open.
 */

export interface ZipEntry {
  name: string;
  data: ArrayBuffer | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed time and date, which is what the ZIP header stores. */
function dosStamp(date: Date): { time: number; date: number } {
  return {
    time:
      (Math.floor(date.getSeconds() / 2) & 0x1f) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((date.getHours() & 0x1f) << 11),
    date:
      (date.getDate() & 0x1f) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      ((Math.max(0, date.getFullYear() - 1980) & 0x7f) << 9),
  };
}

export function createZip(entries: ZipEntry[], now = new Date()): Blob {
  const stamp = dosStamp(now);
  const encoder = new TextEncoder();
  // Blob rejects views over a SharedArrayBuffer, so the buffer type is pinned.
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = (
      entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data)
    ) as Uint8Array<ArrayBuffer>;
    const checksum = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, 0, true); // stored, not deflated
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // no extra field
    local.set(name, 30);

    chunks.push(local, data);

    const entryHeader = new Uint8Array(46 + name.length);
    const entryView = new DataView(entryHeader.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true); // version made by
    entryView.setUint16(6, 20, true); // version needed
    entryView.setUint16(8, 0, true);
    entryView.setUint16(10, 0, true);
    entryView.setUint16(12, stamp.time, true);
    entryView.setUint16(14, stamp.date, true);
    entryView.setUint32(16, checksum, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, data.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint16(30, 0, true); // extra
    entryView.setUint16(32, 0, true); // comment
    entryView.setUint16(34, 0, true); // disk number
    entryView.setUint16(36, 0, true); // internal attrs
    entryView.setUint32(38, 0, true); // external attrs
    entryView.setUint32(42, offset, true);
    entryHeader.set(name, 46);
    central.push(entryHeader);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true); // this disk
  endView.setUint16(6, 0, true); // disk with central directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true); // no comment

  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}

/** Strip characters that break on Windows, and keep names unique in the zip. */
export function safeFileName(name: string, taken: Set<string>): string {
  const base =
    name
      .replace(/\.stl$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'part';

  let candidate = `${base}.stl`;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}.stl`;
    counter++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

import { describe, expect, it } from 'vitest';
import { createZip, crc32, safeFileName } from './zip';

const FIXED = new Date(Date.UTC(2026, 0, 2, 3, 4, 6));

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('crc32', () => {
  it('matches the known checksum for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('createZip', () => {
  it('writes a readable archive with one entry per file', async () => {
    const payload = new TextEncoder().encode('solid part');
    const bytes = await bytesOf(createZip([{ name: 'a.stl', data: payload }], FIXED));
    const view = new DataView(bytes.buffer);

    expect(view.getUint32(0, true)).toBe(0x04034b50); // local header
    expect(view.getUint16(8, true)).toBe(0); // stored, not deflated
    expect(view.getUint32(14, true)).toBe(crc32(payload));

    // End-of-central-directory sits in the last 22 bytes and counts entries.
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 8, true)).toBe(1);
  });

  it('records every entry in the central directory', async () => {
    const bytes = await bytesOf(
      createZip(
        [
          { name: 'barrel.stl', data: new Uint8Array([1, 2, 3]) },
          { name: 'grip.stl', data: new Uint8Array([4, 5]) },
          { name: 'stock.stl', data: new Uint8Array([6]) },
        ],
        FIXED
      )
    );
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;

    expect(view.getUint16(end + 8, true)).toBe(3);
    expect(view.getUint16(end + 10, true)).toBe(3);
    // The central directory offset must point at a central header.
    expect(view.getUint32(view.getUint32(end + 16, true), true)).toBe(0x02014b50);
  });

  it('handles an empty archive', async () => {
    const bytes = await bytesOf(createZip([], FIXED));
    expect(bytes.length).toBe(22);
  });
});

describe('safeFileName', () => {
  it('cleans characters that break on Windows', () => {
    expect(safeFileName('bar/rel: v2?.stl', new Set())).toBe('bar-rel-_v2-.stl');
  });

  it('never repeats a name inside one archive', () => {
    const taken = new Set<string>();

    expect(safeFileName('grip', taken)).toBe('grip.stl');
    expect(safeFileName('grip', taken)).toBe('grip_2.stl');
    // Uniqueness is case-insensitive, because extracting on Windows would
    // otherwise overwrite grip.stl with GRIP.stl.
    expect(safeFileName('GRIP', taken)).toBe('GRIP_3.stl');
  });

  it('falls back to a usable name when nothing survives cleaning', () => {
    expect(safeFileName('///', new Set())).toBe('-.stl');
    expect(safeFileName('', new Set())).toBe('part.stl');
  });
});

/**
 * Reading and writing 3MF.
 *
 * 3MF is a ZIP holding an XML model, and it is what slicers actually prefer —
 * it carries units, several objects, their placement, and colours in one file,
 * none of which STL can express. Colours go out as `basematerials` so a
 * colour printer can keep Gold / Chrome / steel; surface grain that should
 * print is already baked into the mesh by `texture.ts`.
 *
 * No zip library is needed. The archive layout is simple enough to walk
 * directly, and `DecompressionStream` for the deflate is built into both the
 * browser and Node, so this costs nothing in dependencies.
 */

import { weld } from './mesh';
import { createZip } from './zip';

export interface ThreeMfObject {
  id: string;
  name: string;
  /** Triangle soup in millimetres, with any build transform applied. */
  soup: Float32Array;
  triangles: number;
}

/** Locate a file inside the zip and return its bytes, inflating if needed. */
export async function readZipEntry(buffer: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // End of central directory. Compressed data can contain those four bytes by
  // chance, so scan back for a candidate and confirm it.
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= 0 && i > buffer.byteLength - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  let entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  // ZIP64. Slicers write it routinely, and then the classic fields above are
  // all 0xFFFF / 0xFFFFFFFF sentinels with the real values in a second record
  // reached through a locator sitting just before the EOCD.
  if (entries === 0xffff || offset === 0xffffffff) {
    let locator = -1;
    for (let i = eocd - 20; i >= 0 && i > eocd - 66000; i--) {
      if (view.getUint32(i, true) === 0x07064b50) {
        locator = i;
        break;
      }
    }
    if (locator < 0) return null;

    const zip64 = Number(view.getBigUint64(locator + 8, true));
    if (zip64 + 56 > buffer.byteLength) return null;
    if (view.getUint32(zip64, true) !== 0x06064b50) return null;

    entries = Number(view.getBigUint64(zip64 + 32, true));
    offset = Number(view.getBigUint64(zip64 + 48, true));
  }
  const decoder = new TextDecoder();

  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.byteLength) return null;
    if (view.getUint32(offset, true) !== 0x02014b50) return null;

    const method = view.getUint16(offset + 10, true);
    let compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    let localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name === wanted) {
      // A ZIP64 entry parks its real sizes and offset in extra field 0x0001,
      // in the order of whichever classic fields were sentinelled.
      if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
        let at = offset + 46 + nameLength;
        const end = at + extraLength;
        while (at + 4 <= end) {
          const headerId = view.getUint16(at, true);
          const size = view.getUint16(at + 2, true);
          if (headerId === 0x0001) {
            let field = at + 4;
            if (uncompressedSize === 0xffffffff) field += 8;
            if (compressedSize === 0xffffffff) {
              compressedSize = Number(view.getBigUint64(field, true));
              field += 8;
            }
            if (localOffset === 0xffffffff) localOffset = Number(view.getBigUint64(field, true));
            break;
          }
          at += 4 + size;
        }
      }

      // The local header repeats the name and extra field, at its own lengths.
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = bytes.subarray(start, start + compressedSize);

      if (method === 0) return raw;
      if (method !== 8) return null;
      // 'deflate-raw' because a zip entry has no zlib header.
      return inflateRaw(raw);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

export interface ZipLocalEntry {
  name: string;
  localOffset: number;
  compressedSize: number;
  method: number;
}

export const ZIP_TAIL_BYTES = 256 * 1024;
export const MAX_THUMB_COMPRESSED = 2 * 1024 * 1024;

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEocd(view: DataView, length: number): number {
  for (let i = length - 22; i >= 0 && i > length - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

/** Prefer a slicer thumbnail, then the small plate picture Bambu leaves. */
export function pick3mfPreviewName(names: string[]): string | undefined {
  return (
    names.find((name) => /(?:^|\/)thumbnail\.(png|jpe?g|webp)$/i.test(name)) ??
    names.find((name) => /thumbnail/i.test(name) && /\.(png|jpe?g|webp)$/i.test(name)) ??
    names.find((name) => /(?:^|\/)plate_\d+_small\.(png|jpe?g|webp)$/i.test(name)) ??
    names.find((name) => /(?:^|\/)plate_\d+\.(png|jpe?g|webp)$/i.test(name)) ??
    names.find((name) => /^Metadata\/[^/]+\.(png|jpe?g|webp)$/i.test(name))
  );
}

function walkCentralDirectory(
  bytes: Uint8Array,
  fileToView: (fileOffset: number) => number | null,
  cdFileOffset: number,
  entries: number
): ZipLocalEntry[] {
  const view = viewOf(bytes);
  const decoder = new TextDecoder();
  const found: ZipLocalEntry[] = [];
  let fileOffset = cdFileOffset;

  for (let i = 0; i < entries; i++) {
    const at = fileToView(fileOffset);
    if (at == null || at + 46 > bytes.length) break;
    if (view.getUint32(at, true) !== 0x02014b50) break;

    const method = view.getUint16(at + 10, true);
    let compressedSize = view.getUint32(at + 20, true);
    const uncompressedSize = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let localOffset = view.getUint32(at + 42, true);
    if (at + 46 + nameLength > bytes.length) break;
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
      let fieldAt = at + 46 + nameLength;
      const end = fieldAt + extraLength;
      while (fieldAt + 4 <= end && fieldAt + 4 <= bytes.length) {
        const headerId = view.getUint16(fieldAt, true);
        const size = view.getUint16(fieldAt + 2, true);
        if (headerId === 0x0001) {
          let field = fieldAt + 4;
          if (uncompressedSize === 0xffffffff) field += 8;
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(view.getBigUint64(field, true));
            field += 8;
          }
          if (localOffset === 0xffffffff) localOffset = Number(view.getBigUint64(field, true));
          break;
        }
        fieldAt += 4 + size;
      }
    }

    found.push({ name, localOffset, compressedSize, method });
    fileOffset += 46 + nameLength + extraLength + commentLength;
  }
  return found;
}

function cdFromEocd(
  bytes: Uint8Array,
  eocd: number,
  fileToView: (fileOffset: number) => number | null
): { entries: number; offset: number } | null {
  const view = viewOf(bytes);
  let entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries !== 0xffff && offset !== 0xffffffff) return { entries, offset };

  let locator = -1;
  for (let i = eocd - 20; i >= 0 && i > eocd - 66000; i--) {
    if (view.getUint32(i, true) === 0x07064b50) {
      locator = i;
      break;
    }
  }
  if (locator < 0) return null;
  const zip64File = Number(view.getBigUint64(locator + 8, true));
  const zip64 = fileToView(zip64File);
  if (zip64 == null || zip64 + 56 > bytes.length) return null;
  if (view.getUint32(zip64, true) !== 0x06064b50) return null;
  return {
    entries: Number(view.getBigUint64(zip64 + 32, true)),
    offset: Number(view.getBigUint64(zip64 + 48, true)),
  };
}

/**
 * Read the zip tail (last ~256 KB of a 3MF) and find the slicer picture
 * without pulling the mesh. Used so a 90 MB Bambu file can still preview.
 */
export function locateZipThumbnailInTail(
  tail: Uint8Array,
  fileSize: number
): ZipLocalEntry | { needFrom: number } | undefined {
  const view = viewOf(tail);
  const eocd = findEocd(view, tail.length);
  if (eocd < 0) return undefined;
  const tailStart = fileSize - tail.length;
  const fileToView = (fileOffset: number) => {
    const at = fileOffset - tailStart;
    return at >= 0 ? at : null;
  };
  const cd = cdFromEocd(tail, eocd, fileToView);
  if (!cd) return undefined;
  if (fileToView(cd.offset) == null) return { needFrom: cd.offset };
  const entries = walkCentralDirectory(tail, fileToView, cd.offset, cd.entries);
  const hit = pick3mfPreviewName(entries.map((entry) => entry.name));
  if (!hit) return undefined;
  return entries.find((entry) => entry.name === hit);
}

async function inflateRaw(raw: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(copy);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw'));
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
    total += (value as Uint8Array).length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function readZipLocalPayload(
  slice: Uint8Array,
  compressedSize: number,
  method: number
): Promise<Uint8Array | null> {
  if (slice.length < 30) return null;
  const view = viewOf(slice);
  if (view.getUint32(0, true) !== 0x04034b50) return null;
  const nameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const start = 30 + nameLength + extraLength;
  if (start + compressedSize > slice.length) return null;
  const raw = slice.subarray(start, start + compressedSize);
  if (method === 0) return raw;
  if (method !== 8) return null;
  return inflateRaw(raw);
}

function imageDataUrl(bytes: Uint8Array, name: string): string | undefined {
  if (bytes.length < 8) return undefined;
  const mime = /\.jpe?g$/i.test(name)
    ? 'image/jpeg'
    : /\.webp$/i.test(name)
      ? 'image/webp'
      : 'image/png';
  return bytesToDataUrl(bytes, mime);
}

/** Pull only the thumbnail bytes from a 3MF, via Range requests. */
export async function peek3mfThumbnailFromRanges(
  fileSize: number,
  getRange: (start: number, endInclusive: number) => Promise<Uint8Array>
): Promise<string | undefined> {
  if (fileSize < 22) return undefined;
  const tailStart = Math.max(0, fileSize - ZIP_TAIL_BYTES);
  let located = locateZipThumbnailInTail(await getRange(tailStart, fileSize - 1), fileSize);
  if (located && 'needFrom' in located) {
    located = locateZipThumbnailInTail(await getRange(located.needFrom, fileSize - 1), fileSize);
  }
  if (!located || 'needFrom' in located) return undefined;
  if (located.compressedSize <= 0 || located.compressedSize > MAX_THUMB_COMPRESSED) return undefined;
  const slice = await getRange(
    located.localOffset,
    located.localOffset + 30 + 1024 + located.compressedSize - 1
  );
  const bytes = await readZipLocalPayload(slice, located.compressedSize, located.method);
  if (!bytes) return undefined;
  return imageDataUrl(bytes, located.name);
}

/** Central-directory names only — used to find a slicer thumbnail without guessing. */
export function listZipEntryNames(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= 0 && i > buffer.byteLength - 66000; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  let entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || offset === 0xffffffff) {
    let locator = -1;
    for (let i = eocd - 20; i >= 0 && i > eocd - 66000; i--) {
      if (view.getUint32(i, true) === 0x07064b50) {
        locator = i;
        break;
      }
    }
    if (locator < 0) return [];
    const zip64 = Number(view.getBigUint64(locator + 8, true));
    if (zip64 + 56 > buffer.byteLength) return [];
    if (view.getUint32(zip64, true) !== 0x06064b50) return [];
    entries = Number(view.getBigUint64(zip64 + 32, true));
    offset = Number(view.getBigUint64(zip64 + 48, true));
  }

  const decoder = new TextDecoder();
  const names: string[] = [];
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.byteLength) break;
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Slicers (Bambu, Prusa, Cura) almost always stash a PNG of the build in the
 * 3MF. Drive cannot show that picture — we can, without meshing the file.
 */
export async function extract3mfThumbnail(buffer: ArrayBuffer): Promise<string | undefined> {
  const hit = pick3mfPreviewName(listZipEntryNames(buffer));
  if (!hit) return undefined;
  const bytes = await readZipEntry(buffer, hit);
  if (!bytes) return undefined;
  return imageDataUrl(bytes, hit);
}

/**
 * A 3MF transform is 12 numbers: a 3x3 basis in rows, then a translation.
 * The convention is row-vector, so a point is transformed as `p * M + t`.
 */
type Matrix = number[];

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function parseMatrix(source: string | null): Matrix | null {
  if (!source) return null;
  const numbers = source.trim().split(/\s+/).map(Number);
  if (numbers.length < 12 || numbers.some((n) => !Number.isFinite(n))) return null;
  return numbers.slice(0, 12);
}

/** Apply `first`, then `then`. */
function compose(first: Matrix, then: Matrix): Matrix {
  const out: Matrix = Array.from({ length: 12 }, () => 0);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] =
        first[row * 3] * then[col] +
        first[row * 3 + 1] * then[3 + col] +
        first[row * 3 + 2] * then[6 + col];
    }
  }
  for (let col = 0; col < 3; col++) {
    out[9 + col] =
      first[9] * then[col] +
      first[10] * then[3 + col] +
      first[11] * then[6 + col] +
      then[9 + col];
  }
  return out;
}

function transformSoup(soup: Float32Array, m: Matrix): Float32Array {
  const out = new Float32Array(soup.length);
  for (let i = 0; i + 2 < soup.length; i += 3) {
    const x = soup[i];
    const y = soup[i + 1];
    const z = soup[i + 2];
    out[i] = x * m[0] + y * m[3] + z * m[6] + m[9];
    out[i + 1] = x * m[1] + y * m[4] + z * m[7] + m[10];
    out[i + 2] = x * m[2] + y * m[5] + z * m[8] + m[11];
  }
  return out;
}

const OBJECT_RE = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
const VERTEX_RE = /<vertex\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/g;
const TRIANGLE_RE = /<triangle\b[^>]*\bv1="(\d+)"[^>]*\bv2="(\d+)"[^>]*\bv3="(\d+)"/g;
const COMPONENT_RE = /<component\b([^>]*?)\/?>/g;
const ITEM_RE = /<item\b([^>]*?)\/?>/g;

const attr = (source: string, name: string): string | null => {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source);
  return match ? match[1] : null;
};

/** Millimetres per unit, for the few units 3MF allows. */
const UNIT_SCALE: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

interface Node {
  id: string;
  name: string;
  /** Triangle soup in the object's own space, if it carries a mesh. */
  soup: Float32Array | null;
  /** Child objects with their placement, if it is an assembly. */
  children: { id: string; matrix: Matrix }[];
}

/** Pull the mesh out of one object body, expanding the indexed vertex table. */
function readMesh(body: string): Float32Array | null {
  const coords: number[] = [];
  VERTEX_RE.lastIndex = 0;
  let vertex: RegExpExecArray | null;
  while ((vertex = VERTEX_RE.exec(body)) !== null) {
    coords.push(Number(vertex[1]), Number(vertex[2]), Number(vertex[3]));
  }
  if (coords.length === 0) return null;

  const out: number[] = [];
  TRIANGLE_RE.lastIndex = 0;
  let triangle: RegExpExecArray | null;
  while ((triangle = TRIANGLE_RE.exec(body)) !== null) {
    for (let c = 1; c <= 3; c++) {
      const at = Number(triangle[c]) * 3;
      // A corrupt index would otherwise silently write NaNs.
      if (at + 2 >= coords.length) continue;
      out.push(coords[at], coords[at + 1], coords[at + 2]);
    }
  }
  return out.length > 0 ? new Float32Array(out) : null;
}

/**
 * Parse a 3MF into one soup per mesh, placed where the build puts it.
 *
 * The nesting is the part that matters. A 3MF object is either a mesh or an
 * assembly of other objects, each with its own transform, and those nest
 * several levels deep in practice — a slicer will happily export a part whose
 * mesh coordinates are in some private unit, with the conversion living two
 * levels up in the tree. Reading the meshes alone gives geometry that is the
 * wrong size by whatever factor those transforms carried, so the tree is
 * walked from the build items down and the matrices composed on the way.
 */
export async function parse3mf(buffer: ArrayBuffer): Promise<ThreeMfObject[]> {
  const raw = await readZipEntry(buffer, '3D/3dmodel.model');
  if (!raw) throw new Error('Not a readable 3MF: no 3D/3dmodel.model inside.');

  const xml = new TextDecoder().decode(raw);

  const title = /<metadata\b[^>]*name="Title"[^>]*>([^<]*)<\/metadata>/.exec(xml)?.[1].trim() ?? '';

  const unit = attr(xml.slice(0, 2000), 'unit');
  const scale = unit ? UNIT_SCALE[unit] ?? 1 : 1;
  const root: Matrix =
    scale === 1 ? IDENTITY : [scale, 0, 0, 0, scale, 0, 0, 0, scale, 0, 0, 0];

  const nodes = new Map<string, Node>();
  OBJECT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OBJECT_RE.exec(xml)) !== null) {
    const id = attr(match[1], 'id') ?? String(nodes.size + 1);
    const body = match[2];

    const children: Node['children'] = [];
    COMPONENT_RE.lastIndex = 0;
    let component: RegExpExecArray | null;
    while ((component = COMPONENT_RE.exec(body)) !== null) {
      const child = attr(component[1], 'objectid');
      if (child) {
        children.push({ id: child, matrix: parseMatrix(attr(component[1], 'transform')) ?? IDENTITY });
      }
    }

    nodes.set(id, {
      id,
      name: attr(match[1], 'name') ?? '',
      soup: readMesh(body),
      children,
    });
  }

  const objects: ThreeMfObject[] = [];

  /** Walk one branch, carrying the accumulated placement down to the meshes. */
  const emit = (id: string, matrix: Matrix, label: string, seen: Set<string>): void => {
    const node = nodes.get(id);
    // A malformed file can reference a missing object, or point back at an
    // ancestor; either would otherwise recurse forever.
    if (!node || seen.has(id)) return;

    const name = node.name || label;
    if (node.soup) {
      const soup = transformSoup(node.soup, matrix);
      objects.push({ id, name, soup, triangles: Math.floor(soup.length / 9) });
    }

    const next = new Set(seen).add(id);
    for (const child of node.children) emit(child.id, compose(child.matrix, matrix), name, next);
  };

  ITEM_RE.lastIndex = 0;
  let item: RegExpExecArray | null;
  let items = 0;
  while ((item = ITEM_RE.exec(xml)) !== null) {
    const id = attr(item[1], 'objectid');
    if (!id) continue;
    items++;
    emit(id, compose(parseMatrix(attr(item[1], 'transform')) ?? IDENTITY, root), title || `Object ${id}`, new Set());
  }

  // No build section, or one that referenced nothing we have: fall back to
  // every mesh in the file, unplaced. Better than refusing the file outright.
  if (items === 0 || objects.length === 0) {
    for (const node of nodes.values()) {
      if (!node.soup) continue;
      const soup = transformSoup(node.soup, root);
      objects.push({
        id: node.id,
        name: node.name || `Object ${node.id}`,
        soup,
        triangles: Math.floor(soup.length / 9),
      });
    }
  }

  if (objects.length === 0) throw new Error('The 3MF holds no readable mesh.');

  // A file that names nothing leaves every mesh sharing one inherited label,
  // which is useless in a parts list. Number those, and only those.
  const counts = new Map<string, number>();
  for (const object of objects) counts.set(object.name, (counts.get(object.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const object of objects) {
    if ((counts.get(object.name) ?? 0) < 2) continue;
    const n = (seen.get(object.name) ?? 0) + 1;
    seen.set(object.name, n);
    object.name = `${object.name} ${n}`;
  }

  return objects;
}

export const is3mf = (fileName: string): boolean => /\.3mf$/i.test(fileName);

export interface ThreeMfExportPart {
  name: string;
  soup: Float32Array;
  color: string;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function displayColor(hex: string): string {
  const raw = hex.trim().replace('#', '');
  const rgb =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  return `#${rgb.toUpperCase()}FF`;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rel0" Target="/3D/3dmodel.model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

/**
 * Write a colour 3MF. Each part is its own object with a `basematerials`
 * swatch, so Bambu / Prusa / Cura can map Gold and Chrome to a filament
 * instead of flattening everything to grey plastic.
 */
export function exportColored3mf(parts: ThreeMfExportPart[], title = '3dwork'): Blob {
  const palette: string[] = [];
  const indexOf = new Map<string, number>();
  for (const part of parts) {
    const key = displayColor(part.color || '#888888');
    if (!indexOf.has(key)) {
      indexOf.set(key, palette.length);
      palette.push(key);
    }
  }

  const bases = palette
    .map((color, i) => `      <base name="Colour ${i + 1}" displaycolor="${color}"/>`)
    .join('\n');

  const objects: string[] = [];
  const items: string[] = [];

  parts.forEach((part, i) => {
    const objectId = i + 2;
    const { mesh } = weld(part.soup);
    const vertices: string[] = [];
    for (let v = 0; v < mesh.positions.length; v += 3) {
      vertices.push(
        `        <vertex x="${fmt(mesh.positions[v])}" y="${fmt(mesh.positions[v + 1])}" z="${fmt(mesh.positions[v + 2])}"/>`
      );
    }
    const triangles: string[] = [];
    for (let t = 0; t < mesh.indices.length; t += 3) {
      triangles.push(
        `        <triangle v1="${mesh.indices[t]}" v2="${mesh.indices[t + 1]}" v3="${mesh.indices[t + 2]}"/>`
      );
    }
    const pindex = indexOf.get(displayColor(part.color || '#888888')) ?? 0;
    const name = xmlEscape(part.name || `Part ${i + 1}`);
    objects.push(`    <object id="${objectId}" name="${name}" type="model" pid="1" pindex="${pindex}">
      <mesh>
        <vertices>
${vertices.join('\n')}
        </vertices>
        <triangles>
${triangles.join('\n')}
        </triangles>
      </mesh>
    </object>`);
    items.push(`    <item objectid="${objectId}"/>`);
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${xmlEscape(title)}</metadata>
  <resources>
    <basematerials id="1">
${bases}
    </basematerials>
${objects.join('\n')}
  </resources>
  <build>
${items.join('\n')}
  </build>
</model>
`;

  return createZip([
    { name: '[Content_Types].xml', data: new TextEncoder().encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: new TextEncoder().encode(RELS) },
    { name: '3D/3dmodel.model', data: new TextEncoder().encode(xml) },
  ]);
}

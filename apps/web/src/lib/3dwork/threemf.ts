/**
 * Reading 3MF.
 *
 * 3MF is a ZIP holding an XML model, and it is what slicers actually prefer —
 * it carries units, several objects, and their placement in one file, none of
 * which STL can express.
 *
 * No zip library is needed. The archive layout is simple enough to walk
 * directly, and `DecompressionStream` for the deflate is built into both the
 * browser and Node, so this costs nothing in dependencies.
 */

export interface ThreeMfObject {
  id: string;
  name: string;
  /** Triangle soup in millimetres, with any build transform applied. */
  soup: Float32Array;
  triangles: number;
}

/** Locate a file inside the zip and return its bytes, inflating if needed. */
async function readZipEntry(buffer: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
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

      // 'deflate-raw' because a zip entry has no zlib header. The source is a
      // ReadableStream rather than a Blob: Blob.stream() is missing in some
      // non-browser runtimes, while ReadableStream is everywhere we run.
      const source = new ReadableStream<BufferSource>({
        start(controller) {
          controller.enqueue(raw);
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
      let at2 = 0;
      for (const chunk of chunks) {
        out.set(chunk, at2);
        at2 += chunk.length;
      }
      return out;
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
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

/**
 * STL reading and writing.
 *
 * STL files are a flat triangle soup: every triangle carries its own three
 * corners, with no shared vertex table. Both the binary and the ASCII flavour
 * are parsed into the same `RawMesh` so the rest of the workbench never has to
 * care which one came off disk.
 */

export interface RawMesh {
  /** Triangle soup: 9 floats (3 corners x xyz) per triangle. */
  positions: Float32Array;
  /** Per-triangle normals as written in the file, 3 floats per triangle. */
  fileNormals: Float32Array;
  triangles: number;
}

const BINARY_HEADER_BYTES = 80;

/** A binary STL is exactly 80 header + 4 count + 50 bytes per triangle. */
function looksBinary(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < BINARY_HEADER_BYTES + 4) return false;
  const view = new DataView(buffer);
  const triangles = view.getUint32(BINARY_HEADER_BYTES, true);
  return buffer.byteLength === BINARY_HEADER_BYTES + 4 + triangles * 50;
}

function parseBinary(buffer: ArrayBuffer): RawMesh {
  const view = new DataView(buffer);
  const triangles = view.getUint32(BINARY_HEADER_BYTES, true);
  const positions = new Float32Array(triangles * 9);
  const fileNormals = new Float32Array(triangles * 3);

  let offset = BINARY_HEADER_BYTES + 4;
  for (let t = 0; t < triangles; t++) {
    fileNormals[t * 3] = view.getFloat32(offset, true);
    fileNormals[t * 3 + 1] = view.getFloat32(offset + 4, true);
    fileNormals[t * 3 + 2] = view.getFloat32(offset + 8, true);
    offset += 12;

    for (let corner = 0; corner < 3; corner++) {
      const p = t * 9 + corner * 3;
      positions[p] = view.getFloat32(offset, true);
      positions[p + 1] = view.getFloat32(offset + 4, true);
      positions[p + 2] = view.getFloat32(offset + 8, true);
      offset += 12;
    }
    offset += 2; // attribute byte count, unused
  }

  return { positions, fileNormals, triangles };
}

const FACET_NORMAL = /facet\s+normal\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)/g;
const VERTEX = /vertex\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)/g;

function parseAscii(text: string): RawMesh {
  const verts: number[] = [];
  const normals: number[] = [];

  VERTEX.lastIndex = 0;
  FACET_NORMAL.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = VERTEX.exec(text)) !== null) {
    verts.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  while ((match = FACET_NORMAL.exec(text)) !== null) {
    normals.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  // Trailing partial triangles happen in truncated files; drop them rather
  // than handing downstream code a ragged array.
  const triangles = Math.floor(verts.length / 9);
  const positions = new Float32Array(verts.slice(0, triangles * 9));
  const fileNormals = new Float32Array(triangles * 3);
  for (let t = 0; t < triangles && t * 3 + 2 < normals.length; t++) {
    fileNormals[t * 3] = normals[t * 3];
    fileNormals[t * 3 + 1] = normals[t * 3 + 1];
    fileNormals[t * 3 + 2] = normals[t * 3 + 2];
  }

  return { positions, fileNormals, triangles };
}

/** Triangle count from the first 84 bytes of a binary STL — no mesh load. */
export function peekBinaryStlTriangles(buffer: ArrayBuffer, fileSize?: number): number | null {
  if (buffer.byteLength < BINARY_HEADER_BYTES + 4) return null;
  const triangles = new DataView(buffer).getUint32(BINARY_HEADER_BYTES, true);
  if (!Number.isFinite(triangles) || triangles <= 0 || triangles > 200_000_000) return null;
  if (fileSize != null && fileSize !== BINARY_HEADER_BYTES + 4 + triangles * 50) return null;
  return triangles;
}

export function parseStl(buffer: ArrayBuffer): RawMesh {
  if (looksBinary(buffer)) return parseBinary(buffer);

  const text = new TextDecoder().decode(buffer);
  if (/^\s*solid/i.test(text) && /facet/i.test(text)) return parseAscii(text);

  // Some exporters write a binary file whose triangle count disagrees with the
  // byte length. If it is not readable ASCII, binary is the better guess.
  if (buffer.byteLength > BINARY_HEADER_BYTES + 4) return parseBinary(buffer);

  throw new Error('Not a readable STL file.');
}

function triangleNormal(p: Float32Array, i: number, out: Float32Array): void {
  const ax = p[i + 3] - p[i];
  const ay = p[i + 4] - p[i + 1];
  const az = p[i + 5] - p[i + 2];
  const bx = p[i + 6] - p[i];
  const by = p[i + 7] - p[i + 1];
  const bz = p[i + 8] - p[i + 2];

  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;

  const len = Math.hypot(nx, ny, nz);
  if (len > 0) {
    nx /= len;
    ny /= len;
    nz /= len;
  }
  out[0] = nx;
  out[1] = ny;
  out[2] = nz;
}

/**
 * Write one binary STL from any number of triangle soups. Passing several
 * meshes is how the workbench bakes a multi-part assembly into a single file.
 */
export function exportBinaryStl(meshes: Float32Array[], header = 'kjarni 3dwork'): ArrayBuffer {
  let triangles = 0;
  for (const mesh of meshes) triangles += Math.floor(mesh.length / 9);

  const buffer = new ArrayBuffer(BINARY_HEADER_BYTES + 4 + triangles * 50);
  const view = new DataView(buffer);

  const headerBytes = new TextEncoder().encode(header).slice(0, BINARY_HEADER_BYTES);
  new Uint8Array(buffer, 0, headerBytes.length).set(headerBytes);
  view.setUint32(BINARY_HEADER_BYTES, triangles, true);

  const normal = new Float32Array(3);
  let offset = BINARY_HEADER_BYTES + 4;
  for (const mesh of meshes) {
    const count = Math.floor(mesh.length / 9);
    for (let t = 0; t < count; t++) {
      const i = t * 9;
      triangleNormal(mesh, i, normal);
      view.setFloat32(offset, normal[0], true);
      view.setFloat32(offset + 4, normal[1], true);
      view.setFloat32(offset + 8, normal[2], true);
      offset += 12;
      for (let c = 0; c < 9; c++) {
        view.setFloat32(offset, mesh[i + c], true);
        offset += 4;
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
  }

  return buffer;
}

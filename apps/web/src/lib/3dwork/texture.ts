/**
 * Printable surface texture — real millimetres of displacement, not a shader.
 *
 * A JPEG wrapped on a mesh dies at the slicer. Raising and lowering vertices
 * along their normals becomes geometry, so an STL or 3MF still has the knurl,
 * the brushed grooves, the gold grain. Depth is kept in the 0.2–0.4 mm band
 * that a 0.4 mm nozzle can actually print.
 */

import { computeBounds, toSoup, weld, type IndexedMesh } from './mesh';

export type PrintTextureKind = 'brushed' | 'knurl' | 'stipple' | 'diamond';

export interface PrintTextureSpec {
  kind: PrintTextureKind;
  /** Repeat size of the pattern, mm. */
  spacingMm: number;
  /** How far a vertex moves along its normal, mm. Positive = proud of the surface. */
  depthMm: number;
  /** Hard cap so a 200 mm cube with a 0.5 mm grain cannot freeze the tab. */
  maxTriangles?: number;
}

export const DEFAULT_TEXTURE: PrintTextureSpec = {
  kind: 'brushed',
  spacingMm: 1.6,
  depthMm: 0.28,
};

export const TEXTURE_LABELS: Record<PrintTextureKind, string> = {
  brushed: 'Brushed grooves',
  knurl: 'Knurl',
  stipple: 'Stipple / grain',
  diamond: 'Diamond plate',
};

export interface TextureReport {
  soup: Float32Array;
  triangles: number;
  beforeTriangles: number;
  kind: PrintTextureKind;
  depthMm: number;
  spacingMm: number;
}

const MAX_TRIANGLES = 220_000;
const MAX_SPLIT_DEPTH = 10;

export function textureForFinish(finishId: string | undefined | null): PrintTextureSpec {
  if (finishId === 'gold') return { kind: 'stipple', spacingMm: 1.4, depthMm: 0.22 };
  if (finishId === 'brushed-steel') return { kind: 'brushed', spacingMm: 1.5, depthMm: 0.25 };
  return { ...DEFAULT_TEXTURE };
}

/**
 * Subdivide any triangle whose longest edge is above `maxEdgeMm`, stopping
 * when the budget would be blown. Shared vertices are not welded here — the
 * caller welds after, so midpoints on a split edge meet again.
 */
export function tessellateSoup(
  soup: Float32Array,
  maxEdgeMm: number,
  maxTriangles = MAX_TRIANGLES
): Float32Array {
  const maxEdgeSq = Math.max(maxEdgeMm, 0.2) ** 2;
  const out: number[] = [];
  const triangles = Math.floor(soup.length / 9);

  const split = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    depth: number
  ): void => {
    const ab = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    const bc = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
    const ca = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
    const longest = Math.max(ab, bc, ca);
    const remaining = maxTriangles - out.length / 9;
    if (remaining <= 0) return;
    if (longest <= maxEdgeSq || depth >= MAX_SPLIT_DEPTH || remaining < 4) {
      out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      return;
    }
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const mz = (az + bz) * 0.5;
    const nx = (bx + cx) * 0.5;
    const ny = (by + cy) * 0.5;
    const nz = (bz + cz) * 0.5;
    const ox = (cx + ax) * 0.5;
    const oy = (cy + ay) * 0.5;
    const oz = (cz + az) * 0.5;
    split(ax, ay, az, mx, my, mz, ox, oy, oz, depth + 1);
    split(bx, by, bz, nx, ny, nz, mx, my, mz, depth + 1);
    split(cx, cy, cz, ox, oy, oz, nx, ny, nz, depth + 1);
    split(mx, my, mz, nx, ny, nz, ox, oy, oz, depth + 1);
  };

  for (let t = 0; t < triangles; t++) {
    const i = t * 9;
    split(
      soup[i],
      soup[i + 1],
      soup[i + 2],
      soup[i + 3],
      soup[i + 4],
      soup[i + 5],
      soup[i + 6],
      soup[i + 7],
      soup[i + 8],
      0
    );
    if (out.length / 9 >= maxTriangles) break;
  }

  return new Float32Array(out);
}

function vertexNormals(mesh: IndexedMesh): Float32Array {
  const count = mesh.positions.length / 3;
  const nx = new Float64Array(count);
  const ny = new Float64Array(count);
  const nz = new Float64Array(count);
  const p = mesh.positions;
  const idx = mesh.indices;

  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    const ax = p[a * 3];
    const ay = p[a * 3 + 1];
    const az = p[a * 3 + 2];
    const ux = p[b * 3] - ax;
    const uy = p[b * 3 + 1] - ay;
    const uz = p[b * 3 + 2] - az;
    const vx = p[c * 3] - ax;
    const vy = p[c * 3 + 1] - ay;
    const vz = p[c * 3 + 2] - az;
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    nx[a] += fx;
    ny[a] += fy;
    nz[a] += fz;
    nx[b] += fx;
    ny[b] += fy;
    nz[b] += fz;
    nx[c] += fx;
    ny[c] += fy;
    nz[c] += fz;
  }

  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const length = Math.hypot(nx[i], ny[i], nz[i]);
    if (length > 1e-12) {
      out[i * 3] = nx[i] / length;
      out[i * 3 + 1] = ny[i] / length;
      out[i * 3 + 2] = nz[i] / length;
    } else {
      out[i * 3 + 1] = 1;
    }
  }
  return out;
}

/** 0..1 hash. Deterministic, no tables. */
function hash3(ix: number, iy: number, iz: number): number {
  let n = (ix * 374761393 + iy * 668265263 + iz * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const nx00 = n000 + (n100 - n000) * fx;
  const nx10 = n010 + (n110 - n010) * fx;
  const nx01 = n001 + (n101 - n001) * fx;
  const nx11 = n011 + (n111 - n011) * fx;
  const nxy0 = nx00 + (nx10 - nx00) * fy;
  const nxy1 = nx01 + (nx11 - nx01) * fy;
  return nxy0 + (nxy1 - nxy0) * fz;
}

function orthonormalTangent(nx: number, ny: number, nz: number, bx: number, by: number, bz: number) {
  let tx = by * nz - bz * ny;
  let ty = bz * nx - bx * nz;
  let tz = bx * ny - by * nx;
  let length = Math.hypot(tx, ty, tz);
  if (length < 1e-8) {
    // Brush was parallel to the normal — pick any perpendicular.
    if (Math.abs(ny) < 0.9) {
      tx = nz;
      ty = 0;
      tz = -nx;
    } else {
      tx = 0;
      ty = -nz;
      tz = ny;
    }
    length = Math.hypot(tx, ty, tz);
  }
  if (length < 1e-8) return { tx: 1, ty: 0, tz: 0, sx: 0, sy: 0, sz: 1 };
  tx /= length;
  ty /= length;
  tz /= length;
  const sx = ny * tz - nz * ty;
  const sy = nz * tx - nx * tz;
  const sz = nx * ty - ny * tx;
  return { tx, ty, tz, sx, sy, sz };
}

/**
 * Height in -1..1 for one vertex. `brush` is the world-space grain direction
 * (longest bbox axis), so brushed grooves run the same way on every face.
 */
function patternAt(
  kind: PrintTextureKind,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  spacing: number,
  brush: [number, number, number]
): number {
  const { tx, ty, tz, sx, sy, sz } = orthonormalTangent(nx, ny, nz, brush[0], brush[1], brush[2]);
  const u = (x * tx + y * ty + z * tz) / spacing;
  const v = (x * sx + y * sy + z * sz) / spacing;
  if (kind === 'brushed') return Math.sin(u * Math.PI * 2);
  if (kind === 'knurl') return Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI * 2);
  if (kind === 'diamond') {
    const a = Math.abs(Math.sin((u + v) * Math.PI));
    const b = Math.abs(Math.sin((u - v) * Math.PI));
    return a + b - 1;
  }
  // Stipple / gold grain: a couple of octaves of value noise, biased proud so
  // it prints as bumps rather than pits the nozzle cannot resolve.
  const n =
    noise3(x / spacing, y / spacing, z / spacing) * 0.65 +
    noise3(x / (spacing * 0.45), y / (spacing * 0.45), z / (spacing * 0.45)) * 0.35;
  return n * 2 - 1;
}

function longestAxis(bounds: { size: [number, number, number] }): [number, number, number] {
  const [sx, sy, sz] = bounds.size;
  if (sx >= sy && sx >= sz) return [1, 0, 0];
  if (sy >= sz) return [0, 1, 0];
  return [0, 0, 1];
}

/** Emboss `spec` onto a triangle soup. Returns a new soup; the input is untouched. */
export function applyPrintTexture(soup: Float32Array, spec: PrintTextureSpec): TextureReport {
  const beforeTriangles = Math.floor(soup.length / 9);
  const spacing = Math.max(spec.spacingMm, 0.4);
  const depth = spec.depthMm;
  const maxTriangles = spec.maxTriangles ?? MAX_TRIANGLES;

  let edge = spacing;
  let tessellated = tessellateSoup(soup, edge, maxTriangles);
  while (tessellated.length / 9 > maxTriangles && edge < spacing * 8) {
    edge *= 1.4;
    tessellated = tessellateSoup(soup, edge, maxTriangles);
  }
  const { mesh } = weld(tessellated);
  const normals = vertexNormals(mesh);
  const bounds = computeBounds(mesh.positions);
  const brush = longestAxis(bounds);

  const positions = mesh.positions.slice();
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const height = patternAt(spec.kind, px, py, pz, nx, ny, nz, spacing, brush);
    const move = height * depth;
    positions[i * 3] = px + nx * move;
    positions[i * 3 + 1] = py + ny * move;
    positions[i * 3 + 2] = pz + nz * move;
  }

  const displaced: IndexedMesh = { positions, indices: mesh.indices };
  const out = toSoup(displaced);
  return {
    soup: out,
    triangles: Math.floor(out.length / 9),
    beforeTriangles,
    kind: spec.kind,
    depthMm: depth,
    spacingMm: spacing,
  };
}

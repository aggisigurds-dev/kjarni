/**
 * Flattening a mesh into a 2D technical outline.
 *
 * Drawing every triangle edge would produce a grey mess on any real part. What
 * reads as a drawing is the *silhouette*: the edges where the surface turns
 * away from the viewer, plus any open boundary. That is what this computes.
 */

import { computeBounds, weld, type IndexedMesh } from './mesh';

/** Which way the part is flattened, named for the plane you end up looking at. */
export type ViewPlane = 'xy' | 'xz' | 'zy';

export const VIEW_PLANE_LABELS: Record<ViewPlane, string> = {
  xy: 'Side (X/Y)',
  xz: 'Top (X/Z)',
  zy: 'End (Z/Y)',
};

export interface Outline2D {
  /** Flat run of x1,y1,x2,y2 per segment, in millimetres. */
  segments: Float64Array;
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
}

/** View direction and the two axes that become the page's u and v. */
const PLANES: Record<ViewPlane, { view: [number, number, number]; u: 0 | 1 | 2; v: 0 | 1 | 2; flipU: boolean; flipV: boolean }> = {
  // Looking down -Z: X runs across the page, Y up it.
  xy: { view: [0, 0, 1], u: 0, v: 1, flipU: false, flipV: false },
  // Looking down -Y from above: X across, Z down the page.
  xz: { view: [0, 1, 0], u: 0, v: 2, flipU: false, flipV: true },
  // Looking down -X from the muzzle end: Z across, Y up.
  zy: { view: [1, 0, 0], u: 2, v: 1, flipU: true, flipV: false },
};

function faceNormals(mesh: IndexedMesh): Float64Array {
  const { positions: p, indices } = mesh;
  const normals = new Float64Array(indices.length);

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;

    const ax = p[b] - p[a];
    const ay = p[b + 1] - p[a + 1];
    const az = p[b + 2] - p[a + 2];
    const bx = p[c] - p[a];
    const by = p[c + 1] - p[a + 1];
    const bz = p[c + 2] - p[a + 2];

    normals[t] = ay * bz - az * by;
    normals[t + 1] = az * bx - ax * bz;
    normals[t + 2] = ax * by - ay * bx;
  }
  return normals;
}

/**
 * Silhouette edges for one viewing direction.
 *
 * An edge is on the silhouette when its two faces disagree about whether they
 * face the viewer. Edges with only one face are open boundaries and always
 * drawn, so a mesh with holes still produces a readable outline.
 */
export function silhouette(soup: Float32Array, plane: ViewPlane): Outline2D {
  const mesh = weld(soup).mesh;
  const normals = faceNormals(mesh);
  const { view, u, v, flipU, flipV } = PLANES[plane];

  // edge key -> the signed facing of each adjacent face
  const edges = new Map<string, number[]>();
  const { indices } = mesh;

  for (let t = 0; t < indices.length; t += 3) {
    const facing =
      normals[t] * view[0] + normals[t + 1] * view[1] + normals[t + 2] * view[2];

    for (let e = 0; e < 3; e++) {
      const a = indices[t + e];
      const b = indices[t + ((e + 1) % 3)];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const record = edges.get(key);
      if (record) record.push(facing);
      else edges.set(key, [facing]);
    }
  }

  const out: number[] = [];
  const { positions } = mesh;

  for (const [key, facings] of edges) {
    const onSilhouette =
      facings.length === 1 || (facings.length === 2 && facings[0] * facings[1] <= 0);
    if (!onSilhouette) continue;

    const [a, b] = key.split('_').map(Number);
    out.push(
      (flipU ? -1 : 1) * positions[a * 3 + u],
      (flipV ? -1 : 1) * positions[a * 3 + v],
      (flipU ? -1 : 1) * positions[b * 3 + u],
      (flipV ? -1 : 1) * positions[b * 3 + v]
    );
  }

  const segments = new Float64Array(out);

  // Bounds come from the drawn segments, not the mesh, so the page frames what
  // is actually on it.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < segments.length; i += 2) {
    if (segments[i] < minX) minX = segments[i];
    if (segments[i] > maxX) maxX = segments[i];
    if (segments[i + 1] < minY) minY = segments[i + 1];
    if (segments[i + 1] > maxY) maxY = segments[i + 1];
  }

  if (!Number.isFinite(minX)) {
    return {
      segments,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  return {
    segments,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}

/** The part's overall size on a given plane, without building the outline. */
export function planeExtent(
  soup: Float32Array,
  plane: ViewPlane
): { width: number; height: number } {
  const { u, v } = PLANES[plane];
  const bounds = computeBounds(soup);
  return { width: bounds.size[u], height: bounds.size[v] };
}

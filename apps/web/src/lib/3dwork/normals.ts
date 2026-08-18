/**
 * Smooth shading by crease angle.
 *
 * A triangle soup has no shared vertices, so the obvious `computeVertexNormals`
 * gives every triangle its own face normal and a cylinder renders as a ring of
 * hard strips however finely it is tessellated. Throwing more segments at that
 * does not fix it — it only makes the strips narrower.
 *
 * What fixes it is averaging the normals of faces that meet gently, and only
 * those. Faces meeting across a sharp edge keep their own normals, so a bore
 * rim, a cut face or a thread flank stays crisp while the round part of the
 * same mesh reads as round. Nothing here moves a vertex: the geometry is
 * untouched and only the normals change.
 */

import { weld } from './mesh';

/**
 * Past this the two faces are treated as a real edge rather than a curve.
 * 40° comfortably smooths a cylinder of any usable tessellation while leaving
 * a 45° chamfer and every 90° corner sharp.
 */
export const DEFAULT_CREASE_DEGREES = 40;

/**
 * Per-corner normals for a triangle soup, smoothed within the crease angle.
 *
 * Returns one normal per corner, in the soup's own order, ready to hand
 * straight to a `normal` buffer attribute.
 */
export function smoothNormals(soup: Float32Array, creaseDegrees = DEFAULT_CREASE_DEGREES): Float32Array {
  const corners = Math.floor(soup.length / 3);
  const triangles = Math.floor(corners / 3);
  const out = new Float32Array(soup.length);
  if (triangles === 0) return out;

  // Face normals first — every corner of a triangle starts from its own face.
  const faceX = new Float64Array(triangles);
  const faceY = new Float64Array(triangles);
  const faceZ = new Float64Array(triangles);

  for (let t = 0; t < triangles; t++) {
    const a = t * 9;
    const ux = soup[a + 3] - soup[a];
    const uy = soup[a + 4] - soup[a + 1];
    const uz = soup[a + 5] - soup[a + 2];
    const vx = soup[a + 6] - soup[a];
    const vy = soup[a + 7] - soup[a + 1];
    const vz = soup[a + 8] - soup[a + 2];

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    faceX[t] = nx;
    faceY[t] = ny;
    faceZ[t] = nz;
  }

  // Which faces meet at each position. `weld` already does the spatial hashing,
  // and memoises, so a mesh shaded twice pays for this once.
  const { mesh } = weld(soup);
  const vertexOf = new Uint32Array(corners);
  for (let i = 0; i < mesh.indices.length && i < corners; i++) {
    vertexOf[i] = mesh.indices[i];
  }

  const vertexCount = mesh.positions.length / 3;
  const counts = new Uint32Array(vertexCount + 1);
  for (let c = 0; c < corners; c++) counts[vertexOf[c] + 1]++;
  for (let v = 0; v < vertexCount; v++) counts[v + 1] += counts[v];

  // Flat adjacency in CSR form rather than an array of arrays: a real part has
  // hundreds of thousands of corners and the allocations would dominate.
  const cursor = counts.slice(0, vertexCount);
  const facesAt = new Uint32Array(corners);
  for (let c = 0; c < corners; c++) {
    const v = vertexOf[c];
    facesAt[cursor[v]++] = Math.floor(c / 3);
  }

  const threshold = Math.cos((Math.min(Math.max(creaseDegrees, 0), 180) * Math.PI) / 180);

  for (let c = 0; c < corners; c++) {
    const own = Math.floor(c / 3);
    const ox = faceX[own];
    const oy = faceY[own];
    const oz = faceZ[own];

    let sx = 0;
    let sy = 0;
    let sz = 0;

    const v = vertexOf[c];
    for (let i = counts[v]; i < counts[v + 1]; i++) {
      const other = facesAt[i];
      // Only faces bending gently away from this one join the average; the
      // rest belong to a different smoothing group and are left out.
      if (faceX[other] * ox + faceY[other] * oy + faceZ[other] * oz < threshold) continue;
      sx += faceX[other];
      sy += faceY[other];
      sz += faceZ[other];
    }

    const length = Math.hypot(sx, sy, sz);
    if (length > 0) {
      out[c * 3] = sx / length;
      out[c * 3 + 1] = sy / length;
      out[c * 3 + 2] = sz / length;
    } else {
      // Faces cancelling out exactly — keep the face normal rather than a zero,
      // which would render as a black triangle.
      out[c * 3] = ox;
      out[c * 3 + 1] = oy;
      out[c * 3 + 2] = oz;
    }
  }

  return out;
}

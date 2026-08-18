/**
 * Dual contouring — rebuilding a surface without melting it.
 *
 * Surface nets decides where the surface goes from the voxel grid alone: it
 * averages the midpoints of the cell edges that straddle the boundary. That is
 * cheap, and it is why a rebuilt part comes out looking like a candle. Two
 * things are lost. Sub-voxel position, because a midpoint is the only place the
 * surface can sit, which shows up as stair-stepping on flat angled faces. And
 * sharp features, because averaging is literally a smoothing operation.
 *
 * Dual contouring keeps both, using data the voxel grid never had. For every
 * grid edge that crosses the boundary it asks the *original triangles* where
 * exactly the crossing is and which way the surface faces there — Hermite data.
 * Each cell then places its vertex where it best satisfies all of those planes
 * at once, by least squares. Where planes meet at an angle, the solution is
 * their intersection, so a corner comes back as a corner rather than a bevel.
 *
 * The grid still decides topology, so this stays as robust to broken input as
 * the flood fill that feeds it. Only the geometry gets better.
 */

export interface HermitePlane {
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Uniform-grid index over the triangles, so finding the few candidates near a
 * grid edge does not mean testing all half a million of them.
 *
 * Stored CSR-style in flat typed arrays: `starts` gives each bucket's slice of
 * `items`. A Map of arrays would allocate a million small objects.
 */
export class TriangleIndex {
  private readonly starts: Int32Array;
  private readonly items: Int32Array;
  private readonly dims: [number, number, number];
  private readonly origin: [number, number, number];
  private readonly cell: number;

  constructor(
    soup: Float32Array,
    origin: [number, number, number],
    size: [number, number, number],
    cell: number
  ) {
    this.origin = origin;
    this.cell = cell;
    this.dims = [
      Math.max(1, Math.ceil(size[0] / cell) + 1),
      Math.max(1, Math.ceil(size[1] / cell) + 1),
      Math.max(1, Math.ceil(size[2] / cell) + 1),
    ];

    const [nx, ny, nz] = this.dims;
    const bucketCount = nx * ny * nz;
    const counts = new Int32Array(bucketCount + 1);
    const triangles = Math.floor(soup.length / 9);

    // Two passes: count per bucket, then fill. Avoids growing arrays.
    const forEachBucket = (t: number, visit: (bucket: number) => void) => {
      const at = t * 9;
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;

      for (let c = 0; c < 3; c++) {
        const x = soup[at + c * 3];
        const y = soup[at + c * 3 + 1];
        const z = soup[at + c * 3 + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }

      const x0 = Math.max(0, Math.floor((minX - origin[0]) / cell));
      const y0 = Math.max(0, Math.floor((minY - origin[1]) / cell));
      const z0 = Math.max(0, Math.floor((minZ - origin[2]) / cell));
      const x1 = Math.min(nx - 1, Math.floor((maxX - origin[0]) / cell));
      const y1 = Math.min(ny - 1, Math.floor((maxY - origin[1]) / cell));
      const z1 = Math.min(nz - 1, Math.floor((maxZ - origin[2]) / cell));

      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            visit((z * ny + y) * nx + x);
          }
        }
      }
    };

    for (let t = 0; t < triangles; t++) forEachBucket(t, (b) => counts[b + 1]++);
    for (let i = 0; i < bucketCount; i++) counts[i + 1] += counts[i];

    this.starts = counts;
    this.items = new Int32Array(counts[bucketCount]);
    const cursor = Int32Array.from(counts.subarray(0, bucketCount));
    for (let t = 0; t < triangles; t++) forEachBucket(t, (b) => {
      this.items[cursor[b]++] = t;
    });
  }

  /** Triangle indices in the buckets covering the box around a segment. */
  forEachNear(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    visit: (triangle: number) => void
  ): void {
    const [nx, ny, nz] = this.dims;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - this.origin[0]) / this.cell));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - this.origin[1]) / this.cell));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz) - this.origin[2]) / this.cell));
    const x1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) - this.origin[0]) / this.cell));
    const y1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) - this.origin[1]) / this.cell));
    const z1 = Math.min(nz - 1, Math.floor((Math.max(az, bz) - this.origin[2]) / this.cell));

    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const bucket = (z * ny + y) * nx + x;
          const end = this.starts[bucket + 1];
          for (let i = this.starts[bucket]; i < end; i++) visit(this.items[i]);
        }
      }
    }
  }
}

/**
 * Where a segment first meets a triangle, and the triangle's normal there.
 *
 * Möller–Trumbore, restricted to the segment. Returns the parameter along the
 * segment, or -1 for a miss.
 */
export function segmentTriangle(
  soup: Float32Array,
  triangle: number,
  ax: number,
  ay: number,
  az: number,
  dx: number,
  dy: number,
  dz: number
): number {
  const at = triangle * 9;
  const e1x = soup[at + 3] - soup[at];
  const e1y = soup[at + 4] - soup[at + 1];
  const e1z = soup[at + 5] - soup[at + 2];
  const e2x = soup[at + 6] - soup[at];
  const e2y = soup[at + 7] - soup[at + 1];
  const e2z = soup[at + 8] - soup[at + 2];

  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  // Parallel. Both faces count: the input's winding is not to be trusted.
  if (Math.abs(det) < 1e-12) return -1;

  const inv = 1 / det;
  const tx = ax - soup[at];
  const ty = ay - soup[at + 1];
  const tz = az - soup[at + 2];

  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return -1;

  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;

  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return -1;

  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= -1e-6 && t <= 1 + 1e-6 ? t : -1;
}

export function triangleNormal(soup: Float32Array, triangle: number): [number, number, number] {
  const at = triangle * 9;
  const e1x = soup[at + 3] - soup[at];
  const e1y = soup[at + 4] - soup[at + 1];
  const e1z = soup[at + 5] - soup[at + 2];
  const e2x = soup[at + 6] - soup[at];
  const e2y = soup[at + 7] - soup[at + 1];
  const e2z = soup[at + 8] - soup[at + 2];

  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

/**
 * Place one vertex to best satisfy a set of tangent planes, by least squares.
 *
 * Minimising the summed squared distance to every plane is what recovers sharp
 * features: on a flat patch the planes are parallel and the solution is the
 * surface, but where two or three faces meet the planes intersect at a line or
 * a point and the solution snaps to the corner.
 *
 * The system is regularised toward the average crossing so that near-degenerate
 * configurations — a flat patch, where the planes pin down only one direction —
 * stay stable instead of shooting off, and the result is clamped into its cell
 * because dual contouring gives no guarantee otherwise.
 */
export function solveQEF(
  planes: HermitePlane[],
  minX: number,
  minY: number,
  minZ: number,
  size: number
): [number, number, number] {
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const plane of planes) {
    mx += plane.px;
    my += plane.py;
    mz += plane.pz;
  }
  mx /= planes.length;
  my /= planes.length;
  mz /= planes.length;

  // Normal equations for min |A x - b|^2, built about the mass point so the
  // regularisation pulls toward it rather than toward the origin.
  let a00 = 0;
  let a01 = 0;
  let a02 = 0;
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;

  for (const plane of planes) {
    const { nx, ny, nz } = plane;
    const d = nx * (plane.px - mx) + ny * (plane.py - my) + nz * (plane.pz - mz);
    a00 += nx * nx;
    a01 += nx * ny;
    a02 += nx * nz;
    a11 += ny * ny;
    a12 += ny * nz;
    a22 += nz * nz;
    b0 += nx * d;
    b1 += ny * d;
    b2 += nz * d;
  }

  const lambda = 0.02;
  a00 += lambda;
  a11 += lambda;
  a22 += lambda;

  // 3x3 solve by Cramer's rule; the regularisation keeps it non-singular.
  const det =
    a00 * (a11 * a22 - a12 * a12) -
    a01 * (a01 * a22 - a12 * a02) +
    a02 * (a01 * a12 - a11 * a02);

  let x = 0;
  let y = 0;
  let z = 0;
  if (Math.abs(det) > 1e-12) {
    const inv = 1 / det;
    x = inv * (b0 * (a11 * a22 - a12 * a12) - a01 * (b1 * a22 - a12 * b2) + a02 * (b1 * a12 - a11 * b2));
    y = inv * (a00 * (b1 * a22 - a12 * b2) - b0 * (a01 * a22 - a12 * a02) + a02 * (a01 * b2 - b1 * a02));
    z = inv * (a00 * (a11 * b2 - b1 * a12) - a01 * (a01 * b2 - b1 * a02) + b0 * (a01 * a12 - a11 * a02));
  }

  return [
    Math.min(Math.max(mx + x, minX), minX + size),
    Math.min(Math.max(my + y, minY), minY + size),
    Math.min(Math.max(mz + z, minZ), minZ + size),
  ];
}

/**
 * Closest point on a triangle to a point, and the distance to it.
 *
 * The standard region test: project into the triangle's plane, then work out
 * which of the seven Voronoi regions (face, three edges, three corners) the
 * projection falls in and clamp accordingly.
 */
export function pointTriangleDistance(
  soup: Float32Array,
  triangle: number,
  x: number,
  y: number,
  z: number
): number {
  const at = triangle * 9;
  const ax = soup[at];
  const ay = soup[at + 1];
  const az = soup[at + 2];

  const abx = soup[at + 3] - ax;
  const aby = soup[at + 4] - ay;
  const abz = soup[at + 5] - az;
  const acx = soup[at + 6] - ax;
  const acy = soup[at + 7] - ay;
  const acz = soup[at + 8] - az;

  const apx = x - ax;
  const apy = y - ay;
  const apz = z - az;

  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);

  const bpx = x - (ax + abx);
  const bpy = y - (ay + aby);
  const bpz = z - (az + abz);
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(apx - abx * v, apy - aby * v, apz - abz * v);
  }

  const cpx = x - (ax + acx);
  const cpy = y - (ay + acy);
  const cpz = z - (az + acz);
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(apx - acx * w, apy - acy * w, apz - acz * w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return Math.hypot(bpx - (acx - abx) * w, bpy - (acy - aby) * w, bpz - (acz - abz) * w);
  }

  // Inside the face: the perpendicular distance to the plane.
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return Math.hypot(apx - abx * v - acx * w, apy - aby * v - acy * w, apz - abz * v - acz * w);
}

/** Nearest triangle to a point within the index, and its distance. */
export function nearestTriangle(
  soup: Float32Array,
  index: TriangleIndex,
  x: number,
  y: number,
  z: number,
  radius: number
): { triangle: number; distance: number } {
  let best = Infinity;
  let bestTriangle = -1;

  index.forEachNear(x - radius, y - radius, z - radius, x + radius, y + radius, z + radius, (t) => {
    const d = pointTriangleDistance(soup, t, x, y, z);
    if (d < best) {
      best = d;
      bestTriangle = t;
    }
  });

  return { triangle: bestTriangle, distance: best };
}

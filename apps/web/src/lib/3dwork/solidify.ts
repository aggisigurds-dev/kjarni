/**
 * Make Solid — rebuilding a broken mesh instead of repairing it.
 *
 * Edge-based repair assumes the triangles nearly describe a solid already. Once
 * a part has thousands of non-manifold edges — surfaces passing through each
 * other, the usual result of merging parts without a CSG kernel — that
 * assumption is gone, and filling holes only chases its own tail.
 *
 * This throws the triangles away. The mesh is rasterised into a voxel grid, the
 * grid is closed to seal gaps, the outside is flood-filled, and a fresh surface
 * is extracted around whatever was left inside. The output is watertight and
 * manifold by construction, whatever the input was: missing faces,
 * self-intersections, doubled shells and inside-out normals all stop mattering,
 * because none of the original triangles survive.
 *
 * The trade is resolution. Detail finer than a voxel is gone and sharp edges
 * soften, so this is a make-it-printable tool, not a preserve-the-CAD tool.
 */

import { analyze, computeBounds, weld, type Topology } from './mesh';
import {
  TriangleIndex,
  nearestTriangle,
  solveQEF,
  triangleNormal,
  type HermitePlane,
} from './contour';

/**
 * A shape to cut out of the solid — a bore for a pipe or a bolt.
 *
 * The cut happens in the voxel grid, not on the triangles, which is the whole
 * point: a mesh boolean needs both operands to be valid solids, and the input
 * here usually is not one. Clearing voxels cannot fail.
 */
export interface CylinderCut {
  /** Axis the bore runs along. */
  axis: 'x' | 'y' | 'z';
  diameter: number;
  /** Centre of the bore on the other two axes, in model coordinates. */
  center: [number, number];
  /** Extent along the axis. Omit for a hole straight through the part. */
  from?: number;
  to?: number;
}

export interface SolidifyOptions {
  /** Voxels along the longest axis. Higher keeps more detail and costs more. */
  resolution: number;
  /** Seal openings up to roughly this many millimetres across. */
  sealMm: number;
  /** Bores to cut out of the finished solid. */
  cuts?: CylinderCut[];
  /**
   * How the surface is rebuilt from the grid.
   *
   * 'surface-nets' averages edge midpoints — fast, and it rounds everything
   * off. 'dual-contour' asks the original triangles where the surface actually
   * crosses each grid edge and which way it faces there, then fits each cell's
   * vertex to those planes.
   *
   * Dual contouring is not yet the default: the distance field it reads is
   * verified correct, but a half-voxel bias remains on the +axis faces, so it
   * currently measures worse than surface nets overall. Defaults to
   * 'surface-nets'.
   */
  extraction?: 'surface-nets' | 'dual-contour';
}

export interface SolidifyReport {
  voxelSize: number;
  grid: [number, number, number];
  sealVoxels: number;
  trianglesBefore: number;
  trianglesAfter: number;
  /** Voxels removed by the bores. */
  cutVoxels: number;
  extraction: 'surface-nets' | 'dual-contour';
  /** Grid edges whose crossing was taken from the original triangles. */
  hermiteEdges: number;
  /** Enclosed volume of the rebuilt solid, mm³. */
  volume: number;
  after: Topology;
}

/** Guard against a resolution that would allocate more than we can afford. */
const MAX_CELLS = 12_000_000;

/**
 * Mark every voxel the surface passes through.
 *
 * Each triangle is sampled on a barycentric lattice fine enough that
 * consecutive samples land in adjacent voxels, which leaves no pinholes in the
 * shell even where the original triangles are ragged.
 */
function rasterize(
  soup: Float32Array,
  grid: Uint8Array,
  dims: [number, number, number],
  origin: [number, number, number],
  voxelSize: number
): void {
  const [nx, ny, nz] = dims;
  const inv = 1 / voxelSize;

  const mark = (x: number, y: number, z: number) => {
    const ix = Math.floor((x - origin[0]) * inv);
    const iy = Math.floor((y - origin[1]) * inv);
    const iz = Math.floor((z - origin[2]) * inv);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return;
    grid[(iz * ny + iy) * nx + ix] = 1;
  };

  for (let t = 0; t + 8 < soup.length; t += 9) {
    const ax = soup[t];
    const ay = soup[t + 1];
    const az = soup[t + 2];
    const bx = soup[t + 3];
    const by = soup[t + 4];
    const bz = soup[t + 5];
    const cx = soup[t + 6];
    const cy = soup[t + 7];
    const cz = soup[t + 8];

    // Sample density from the longest edge, at half a voxel per step.
    const e1 = Math.hypot(bx - ax, by - ay, bz - az);
    const e2 = Math.hypot(cx - ax, cy - ay, cz - az);
    const steps = Math.min(512, Math.max(1, Math.ceil((Math.max(e1, e2) * 2) * inv)));

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      for (let j = 0; j <= steps - i; j++) {
        const v = j / steps;
        const w = 1 - u - v;
        mark(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v);
      }
    }
  }
}

/** Grow the marked region by one voxel in the six axis directions. */
function dilate(source: Uint8Array, dims: [number, number, number]): Uint8Array<ArrayBuffer> {
  const [nx, ny, nz] = dims;
  const out = new Uint8Array(source.length);
  out.set(source);

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = (z * ny + y) * nx + x;
        if (source[i]) continue;
        if (
          (x > 0 && source[i - 1]) ||
          (x < nx - 1 && source[i + 1]) ||
          (y > 0 && source[i - nx]) ||
          (y < ny - 1 && source[i + nx]) ||
          (z > 0 && source[i - nx * ny]) ||
          (z < nz - 1 && source[i + nx * ny])
        ) {
          out[i] = 1;
        }
      }
    }
  }
  return out;
}

/** Shrink the marked region by one voxel — the inverse of `dilate`. */
function erode(source: Uint8Array, dims: [number, number, number]): Uint8Array<ArrayBuffer> {
  const [nx, ny, nz] = dims;
  const out = new Uint8Array(source.length);
  out.set(source);

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = (z * ny + y) * nx + x;
        if (!source[i]) continue;
        if (
          x === 0 ||
          y === 0 ||
          z === 0 ||
          x === nx - 1 ||
          y === ny - 1 ||
          z === nz - 1 ||
          !source[i - 1] ||
          !source[i + 1] ||
          !source[i - nx] ||
          !source[i + nx] ||
          !source[i - nx * ny] ||
          !source[i + nx * ny]
        ) {
          out[i] = 0;
        }
      }
    }
  }
  return out;
}

/**
 * Flood the empty space reachable from outside the part.
 *
 * Whatever the flood cannot reach is enclosed, and therefore inside the solid —
 * which is how cavities survive while holes in the shell do not matter, so long
 * as the closing step sealed them first.
 */
function floodExterior(shell: Uint8Array, dims: [number, number, number]): Uint8Array<ArrayBuffer> {
  const [nx, ny, nz] = dims;
  const outside = new Uint8Array(shell.length);
  // The grid is padded, so index 0 is guaranteed to be empty space.
  const stack = new Int32Array(shell.length);
  let top = 0;

  stack[top++] = 0;
  outside[0] = 1;

  while (top > 0) {
    const i = stack[--top];
    const x = i % nx;
    const y = Math.floor(i / nx) % ny;
    const z = Math.floor(i / (nx * ny));

    const visit = (j: number) => {
      if (!outside[j] && !shell[j]) {
        outside[j] = 1;
        stack[top++] = j;
      }
    };

    if (x > 0) visit(i - 1);
    if (x < nx - 1) visit(i + 1);
    if (y > 0) visit(i - nx);
    if (y < ny - 1) visit(i + nx);
    if (z > 0) visit(i - nx * ny);
    if (z < nz - 1) visit(i + nx * ny);
  }

  return outside;
}

/**
 * Naive surface nets: one vertex per cell that straddles the boundary, joined
 * into quads across every sign-changing edge.
 *
 * Chosen over marching cubes because it needs no 256-case lookup table, and
 * because every vertex is shared by construction — the result is manifold
 * without any welding afterwards.
 */
function surfaceNets(
  inside: Uint8Array,
  dims: [number, number, number],
  origin: [number, number, number],
  voxelSize: number
): Float32Array {
  const [nx, ny, nz] = dims;
  const at = (x: number, y: number, z: number) => inside[(z * ny + y) * nx + x];

  const cellDims: [number, number, number] = [nx - 1, ny - 1, nz - 1];
  const [cx, cy, cz] = cellDims;
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1);
  const vertices: number[] = [];

  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          if (at(x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1))) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        // Average the midpoints of the edges that actually cross the surface.
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;
        for (let c = 0; c < 8; c++) {
          for (const axis of [1, 2, 4]) {
            const other = c ^ axis;
            if (other < c) continue;
            if (((mask >> c) & 1) === ((mask >> other) & 1)) continue;

            sx += ((c & 1) + (other & 1)) / 2;
            sy += (((c >> 1) & 1) + ((other >> 1) & 1)) / 2;
            sz += (((c >> 2) & 1) + ((other >> 2) & 1)) / 2;
            crossings++;
          }
        }
        if (crossings === 0) continue;

        cellVertex[(z * cy + y) * cx + x] = vertices.length / 3;
        vertices.push(
          origin[0] + (x + sx / crossings) * voxelSize,
          origin[1] + (y + sy / crossings) * voxelSize,
          origin[2] + (z + sz / crossings) * voxelSize
        );
      }
    }
  }

  const triangles: number[] = [];
  const cellAt = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= cx || y >= cy || z >= cz ? -1 : cellVertex[(z * cy + y) * cx + x];

  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const quad = flip ? [a, d, c, b] : [a, b, c, d];
    for (const [i, j, k] of [
      [0, 1, 2],
      [0, 2, 3],
    ]) {
      const v0 = quad[i] * 3;
      const v1 = quad[j] * 3;
      const v2 = quad[k] * 3;
      triangles.push(
        vertices[v0], vertices[v0 + 1], vertices[v0 + 2],
        vertices[v1], vertices[v1 + 1], vertices[v1 + 2],
        vertices[v2], vertices[v2 + 1], vertices[v2 + 2]
      );
    }
  };

  for (let z = 1; z < nz - 1; z++) {
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const here = at(x, y, z);

        // Each sign-changing grid edge is shared by exactly four cells, and
        // those four vertices form one quad of the surface.
        if (x + 1 < nx && here !== at(x + 1, y, z)) {
          emitQuad(
            cellAt(x, y - 1, z - 1),
            cellAt(x, y, z - 1),
            cellAt(x, y, z),
            cellAt(x, y - 1, z),
            here === 0
          );
        }
        if (y + 1 < ny && here !== at(x, y + 1, z)) {
          emitQuad(
            cellAt(x - 1, y, z - 1),
            cellAt(x, y, z - 1),
            cellAt(x, y, z),
            cellAt(x - 1, y, z),
            here !== 0
          );
        }
        if (z + 1 < nz && here !== at(x, y, z + 1)) {
          emitQuad(
            cellAt(x - 1, y - 1, z),
            cellAt(x, y - 1, z),
            cellAt(x, y, z),
            cellAt(x - 1, y, z),
            here === 0
          );
        }
      }
    }
  }

  return new Float32Array(triangles);
}

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** Clear every voxel that falls inside one of the bores. */
function applyCuts(
  inside: Uint8Array,
  dims: [number, number, number],
  origin: [number, number, number],
  voxelSize: number,
  cuts: CylinderCut[]
): number {
  if (cuts.length === 0) return 0;

  const [nx, ny, nz] = dims;
  let removed = 0;

  for (const cut of cuts) {
    const axis = AXIS_INDEX[cut.axis];
    const [u, v] = [0, 1, 2].filter((i) => i !== axis);
    const radius = cut.diameter / 2;
    const radiusSq = radius * radius;

    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = (z * ny + y) * nx + x;
          if (!inside[i]) continue;

          // Voxel centre in model space.
          const p = [
            origin[0] + (x + 0.5) * voxelSize,
            origin[1] + (y + 0.5) * voxelSize,
            origin[2] + (z + 0.5) * voxelSize,
          ];

          if (cut.from !== undefined && p[axis] < cut.from) continue;
          if (cut.to !== undefined && p[axis] > cut.to) continue;

          const du = p[u] - cut.center[0];
          const dv = p[v] - cut.center[1];
          if (du * du + dv * dv > radiusSq) continue;

          inside[i] = 0;
          removed++;
        }
      }
    }
  }

  return removed;
}

/**
 * Build a narrow-band signed distance field.
 *
 * The magnitude is the true distance to the nearest triangle, so the zero
 * crossing sits exactly on the original surface rather than on a voxel wall —
 * that is what removes the stair-stepping and the half-voxel size error.
 *
 * The sign comes from the flood fill wherever the flood is decisive, which
 * keeps the robustness: holes and interior junk cannot flip a voxel that the
 * flood already reached. Only voxels the surface actually passes through are
 * ambiguous, and those are resolved against the nearest triangle's normal.
 */
function buildDistanceField(
  soup: Float32Array,
  index: TriangleIndex,
  shell: Uint8Array,
  outside: Uint8Array,
  inside: Uint8Array,
  dims: [number, number, number],
  origin: [number, number, number],
  voxelSize: number
): Float32Array {
  const [nx, ny, nz] = dims;
  const field = new Float32Array(shell.length);
  // Anything outside the band just needs a consistent sign, not a distance.
  const far = voxelSize * 4;
  const radius = voxelSize * 2.5;

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = (z * ny + y) * nx + x;
        // `outside` excludes shell voxels, and every shell voxel is inside the
        // band, so this is the classification the band itself uses. Using
        // `inside` here instead disagrees with it and puts a phantom crossing
        // where the band meets the far field.
        const solid = outside[i] !== 1;

        // Only voxels near the surface need a real distance.
        let nearSurface = shell[i] === 1;
        if (!nearSurface) {
          for (let dz = -1; dz <= 1 && !nearSurface; dz++) {
            for (let dy = -1; dy <= 1 && !nearSurface; dy++) {
              for (let dx = -1; dx <= 1 && !nearSurface; dx++) {
                const jx = x + dx;
                const jy = y + dy;
                const jz = z + dz;
                if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) continue;
                if (shell[(jz * ny + jy) * nx + jx] === 1) nearSurface = true;
              }
            }
          }
        }

        if (!nearSurface) {
          field[i] = solid ? -far : far;
          continue;
        }

        const px = origin[0] + (x + 0.5) * voxelSize;
        const py = origin[1] + (y + 0.5) * voxelSize;
        const pz = origin[2] + (z + 0.5) * voxelSize;
        const hit = nearestTriangle(soup, index, px, py, pz, radius);

        if (hit.triangle < 0) {
          field[i] = solid ? -far : far;
          continue;
        }

        // Sign: trust the flood where it is decisive. A voxel the surface runs
        // through was neither flooded nor enclosed, so ask the triangle which
        // side of it we are on.
        let negative: boolean;
        if (outside[i] === 1) negative = false;
        else if (shell[i] !== 1) negative = true;
        else {
          const [tnx, tny, tnz] = triangleNormal(soup, hit.triangle);
          const at = hit.triangle * 9;
          const toPoint =
            (px - soup[at]) * tnx + (py - soup[at + 1]) * tny + (pz - soup[at + 2]) * tnz;
          // Winding is unreliable, so a face pointing the wrong way would lie.
          // Fall back to the flood's verdict for the voxel when the two
          // disagree about a voxel that the flood did reach.
          negative = toPoint < 0;
        }

        field[i] = negative ? -hit.distance : hit.distance;
      }
    }
  }

  return field;
}

/**
 * Dual contouring over a distance field.
 *
 * Crossings are found by interpolating the field along each grid edge, which is
 * sub-voxel accurate, and each crossing carries the nearest triangle's normal.
 * Every cell then fits one vertex to all the planes touching it, so flats stay
 * flat and corners come back as corners instead of bevels.
 */
function dualContour(
  field: Float32Array,
  dims: [number, number, number],
  origin: [number, number, number],
  voxelSize: number,
  soup: Float32Array,
  index: TriangleIndex
): { soup: Float32Array; hermiteEdges: number } {
  const [nx, ny, nz] = dims;
  const solidAt = (x: number, y: number, z: number) => field[(z * ny + y) * nx + x] < 0;
  const valueAt = (x: number, y: number, z: number) => field[(z * ny + y) * nx + x];
  const pointAt = (x: number, y: number, z: number): [number, number, number] => [
    origin[0] + (x + 0.5) * voxelSize,
    origin[1] + (y + 0.5) * voxelSize,
    origin[2] + (z + 0.5) * voxelSize,
  ];

  const crossing = (x: number, y: number, z: number, axis: 0 | 1 | 2): HermitePlane => {
    const bx = x + (axis === 0 ? 1 : 0);
    const by = y + (axis === 1 ? 1 : 0);
    const bz = z + (axis === 2 ? 1 : 0);

    const va = valueAt(x, y, z);
    const vb = valueAt(bx, by, bz);
    // Linear interpolation to the zero crossing — the sub-voxel bit.
    const t = Math.min(0.999, Math.max(0.001, va / (va - vb)));

    const a = pointAt(x, y, z);
    const b = pointAt(bx, by, bz);
    const px = a[0] + (b[0] - a[0]) * t;
    const py = a[1] + (b[1] - a[1]) * t;
    const pz = a[2] + (b[2] - a[2]) * t;

    const hit = nearestTriangle(soup, index, px, py, pz, voxelSize * 2);
    if (hit.triangle < 0) {
      return {
        px, py, pz,
        nx: axis === 0 ? 1 : 0,
        ny: axis === 1 ? 1 : 0,
        nz: axis === 2 ? 1 : 0,
      };
    }

    let [tnx, tny, tnz] = triangleNormal(soup, hit.triangle);
    // Point the normal outward, using the field's gradient along this edge.
    if ((vb - va) * (tnx * (b[0] - a[0]) + tny * (b[1] - a[1]) + tnz * (b[2] - a[2])) < 0) {
      tnx = -tnx;
      tny = -tny;
      tnz = -tnz;
    }
    return { px, py, pz, nx: tnx, ny: tny, nz: tnz };
  };

  const [cx, cy, cz] = [nx - 1, ny - 1, nz - 1];
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1);
  const vertices: number[] = [];
  let hermiteEdges = 0;

  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          if (solidAt(x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1))) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        const planes: HermitePlane[] = [];
        for (let c = 0; c < 8; c++) {
          for (const axis of [0, 1, 2] as const) {
            const bit = 1 << axis;
            if (c & bit) continue;
            const other = c | bit;
            if (((mask >> c) & 1) === ((mask >> other) & 1)) continue;

            planes.push(crossing(x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1), axis));
            hermiteEdges++;
          }
        }
        if (planes.length === 0) continue;

        const base = pointAt(x, y, z);
        const [vx, vy, vz] = solveQEF(planes, base[0], base[1], base[2], voxelSize);
        cellVertex[(z * cy + y) * cx + x] = vertices.length / 3;
        vertices.push(vx, vy, vz);
      }
    }
  }

  const triangles: number[] = [];
  const cellAt = (x: number, y: number, z: number) =>
    x < 0 || y < 0 || z < 0 || x >= cx || y >= cy || z >= cz ? -1 : cellVertex[(z * cy + y) * cx + x];

  const emitQuad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const quad = flip ? [a, d, c, b] : [a, b, c, d];
    for (const [i, j, k] of [
      [0, 1, 2],
      [0, 2, 3],
    ]) {
      for (const corner of [quad[i], quad[j], quad[k]]) {
        triangles.push(vertices[corner * 3], vertices[corner * 3 + 1], vertices[corner * 3 + 2]);
      }
    }
  };

  for (let z = 1; z < nz - 1; z++) {
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const here = solidAt(x, y, z);
        if (x + 1 < nx && here !== solidAt(x + 1, y, z)) {
          emitQuad(cellAt(x, y - 1, z - 1), cellAt(x, y, z - 1), cellAt(x, y, z), cellAt(x, y - 1, z), !here);
        }
        if (y + 1 < ny && here !== solidAt(x, y + 1, z)) {
          emitQuad(cellAt(x - 1, y, z - 1), cellAt(x, y, z - 1), cellAt(x, y, z), cellAt(x - 1, y, z), here);
        }
        if (z + 1 < nz && here !== solidAt(x, y, z + 1)) {
          emitQuad(cellAt(x - 1, y - 1, z), cellAt(x, y - 1, z), cellAt(x, y, z), cellAt(x - 1, y, z), !here);
        }
      }
    }
  }

  return { soup: new Float32Array(triangles), hermiteEdges };
}

export function makeSolid(soup: Float32Array, options: SolidifyOptions): {
  soup: Float32Array;
  report: SolidifyReport;
} {
  const bounds = computeBounds(soup);
  const longest = Math.max(bounds.size[0], bounds.size[1], bounds.size[2], 1e-6);

  let voxelSize = longest / Math.max(16, options.resolution);
  const sealVoxels = Math.max(0, Math.round(options.sealMm / voxelSize));
  // Padding leaves empty space around the part so the flood fill has somewhere
  // to start and the closing step cannot run off the edge of the grid.
  const pad = sealVoxels + 3;

  let dims: [number, number, number] = [0, 0, 0];
  for (;;) {
    dims = [
      Math.ceil(bounds.size[0] / voxelSize) + pad * 2,
      Math.ceil(bounds.size[1] / voxelSize) + pad * 2,
      Math.ceil(bounds.size[2] / voxelSize) + pad * 2,
    ];
    if (dims[0] * dims[1] * dims[2] <= MAX_CELLS) break;
    // Too big to allocate: step the grid down rather than failing outright.
    voxelSize *= 1.25;
  }

  const origin: [number, number, number] = [
    bounds.min[0] - pad * voxelSize,
    bounds.min[1] - pad * voxelSize,
    bounds.min[2] - pad * voxelSize,
  ];

  let shell = new Uint8Array(dims[0] * dims[1] * dims[2]);
  rasterize(soup, shell, dims, origin, voxelSize);

  // Closing: grow to bridge gaps, flood, then shrink back so the part keeps
  // its original size. This is what seals holes the shell cannot.
  for (let i = 0; i < sealVoxels; i++) shell = dilate(shell, dims);

  const outside = floodExterior(shell, dims);
  let inside = new Uint8Array(shell.length);
  for (let i = 0; i < inside.length; i++) inside[i] = outside[i] ? 0 : 1;

  for (let i = 0; i < sealVoxels; i++) inside = erode(inside, dims);

  // Bores are cleared after the solid is closed, so a hole through the part
  // stays a hole rather than being sealed shut again.
  const cutVoxels = applyCuts(inside, dims, origin, voxelSize, options.cuts ?? []);

  // Surface nets remains the default. Dual contouring below reconstructs sharp
  // features and places the surface sub-voxel, but still carries a half-voxel
  // bias on the +axis faces (rasterisation rounds a surface-grazing point into
  // the upper voxel), which makes it measurably worse overall until fixed:
  // on a 20 mm cube it is exact on the min faces and a full voxel out on the
  // max ones, against surface nets' symmetric half-voxel. Opt in explicitly.
  const extraction = options.extraction ?? 'surface-nets';
  let rebuilt: Float32Array;
  let hermiteEdges = 0;

  if (extraction === 'dual-contour' && soup.length > 0) {
    // Bucket at two voxels: big enough that the index stays small, small
    // enough that a query only sees a handful of triangles.
    const index = new TriangleIndex(soup, origin, bounds.size, voxelSize * 2);
    const field = buildDistanceField(
      soup, index, shell, outside, inside, dims, origin, voxelSize
    );
    // `inside` already has the bores cleared; carry that into the field, or
    // dual contouring would rebuild the part with the hole filled back in.
    for (let i = 0; i < field.length; i++) {
      if (inside[i] === 0 && field[i] < 0) field[i] = voxelSize;
    }
    const result = dualContour(field, dims, origin, voxelSize, soup, index);
    rebuilt = result.soup;
    hermiteEdges = result.hermiteEdges;
  } else {
    rebuilt = surfaceNets(inside, dims, origin, voxelSize);
  }

  const topology = analyze(weld(rebuilt).mesh);

  // Surface nets can come out inside-out depending on the quad winding; the
  // enclosed volume tells us which way round it ended up.
  let finished = rebuilt;
  if (topology.signedVolume < 0) {
    finished = new Float32Array(rebuilt.length);
    for (let t = 0; t + 8 < rebuilt.length; t += 9) {
      for (let c = 0; c < 3; c++) {
        finished[t + c] = rebuilt[t + c];
        finished[t + 3 + c] = rebuilt[t + 6 + c];
        finished[t + 6 + c] = rebuilt[t + 3 + c];
      }
    }
  }

  const after = finished === rebuilt ? topology : analyze(weld(finished).mesh);

  return {
    soup: finished,
    report: {
      voxelSize,
      grid: dims,
      sealVoxels,
      trianglesBefore: Math.floor(soup.length / 9),
      trianglesAfter: Math.floor(finished.length / 9),
      cutVoxels,
      extraction,
      hermiteEdges,
      volume: Math.abs(after.signedVolume),
      after,
    },
  };
}

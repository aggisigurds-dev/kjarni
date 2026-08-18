/**
 * Outer hull extraction — keeping the surface you can see, discarding the rest.
 *
 * Make Solid rebuilds a part from a voxel grid, which fixes anything but
 * resamples the surface: threads round over, sharp edges soften. That trade is
 * only worth making when the mesh is genuinely beyond saving.
 *
 * Usually it is not. A part assembled by merging other parts is typically fine
 * on the outside and a disaster inside, because every merged component left its
 * walls buried in there. Those interior walls are what produce thousands of
 * non-manifold edges, and none of them contribute anything to a print.
 *
 * So this keeps the original triangles exactly as they are — same vertices,
 * same threads, same edges — and deletes only the ones sealed inside the part.
 * The voxel grid is used to decide what is visible, never to generate geometry.
 */

import { computeBounds } from './mesh';

export interface OuterHullOptions {
  /** Voxels along the longest axis, used only to classify visibility. */
  resolution: number;
  /** Bridge openings up to this many mm so the flood cannot leak inside. */
  sealMm: number;
}

export interface OuterHullReport {
  voxelSize: number;
  grid: [number, number, number];
  trianglesBefore: number;
  trianglesAfter: number;
  /** Triangles found sealed inside the part and dropped. */
  trianglesRemoved: number;
}

/** Mark every voxel the surface passes through. */
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
    const e1 = Math.hypot(soup[t + 3] - ax, soup[t + 4] - ay, soup[t + 5] - az);
    const e2 = Math.hypot(soup[t + 6] - ax, soup[t + 7] - ay, soup[t + 8] - az);
    const steps = Math.min(512, Math.max(1, Math.ceil(Math.max(e1, e2) * 2 * inv)));

    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      for (let j = 0; j <= steps - i; j++) {
        const v = j / steps;
        const w = 1 - u - v;
        mark(
          ax * w + soup[t + 3] * u + soup[t + 6] * v,
          ay * w + soup[t + 4] * u + soup[t + 7] * v,
          az * w + soup[t + 5] * u + soup[t + 8] * v
        );
      }
    }
  }
}

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

/** Flood the empty space reachable from outside the part. */
function floodExterior(shell: Uint8Array, dims: [number, number, number]): Uint8Array<ArrayBuffer> {
  const [nx, ny, nz] = dims;
  const outside = new Uint8Array(shell.length);
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
 * Keep only the triangles that can be reached from outside the part.
 *
 * A triangle is visible if empty exterior space sits just off one of its faces.
 * Both sides are probed because the input's normals cannot be trusted, and
 * several points across the triangle are probed because a large triangle can be
 * buried at its centre while a corner still pokes out.
 *
 * Cavities that open to the outside — bolt holes, the bore for a pipe — survive
 * automatically: the flood runs into them, so their walls are reachable. Only
 * fully sealed interior geometry is dropped.
 */
export function outerHull(soup: Float32Array, options: OuterHullOptions): {
  soup: Float32Array;
  report: OuterHullReport;
} {
  const bounds = computeBounds(soup);
  const longest = Math.max(bounds.size[0], bounds.size[1], bounds.size[2], 1e-6);

  let voxelSize = longest / Math.max(16, options.resolution);
  const sealVoxels = Math.max(0, Math.round(options.sealMm / voxelSize));
  const pad = sealVoxels + 3;

  let dims: [number, number, number] = [0, 0, 0];
  for (;;) {
    dims = [
      Math.ceil(bounds.size[0] / voxelSize) + pad * 2,
      Math.ceil(bounds.size[1] / voxelSize) + pad * 2,
      Math.ceil(bounds.size[2] / voxelSize) + pad * 2,
    ];
    if (dims[0] * dims[1] * dims[2] <= 20_000_000) break;
    voxelSize *= 1.25;
  }

  const origin: [number, number, number] = [
    bounds.min[0] - pad * voxelSize,
    bounds.min[1] - pad * voxelSize,
    bounds.min[2] - pad * voxelSize,
  ];

  let shell = new Uint8Array(dims[0] * dims[1] * dims[2]);
  rasterize(soup, shell, dims, origin, voxelSize);

  // Seal before flooding, or the flood pours through a hole and declares the
  // whole interior visible — which would keep exactly the junk we are here for.
  for (let i = 0; i < sealVoxels; i++) shell = dilate(shell, dims);
  const outside = floodExterior(shell, dims);

  const [nx, ny, nz] = dims;
  const inv = 1 / voxelSize;
  const isOutside = (x: number, y: number, z: number): boolean => {
    const ix = Math.floor((x - origin[0]) * inv);
    const iy = Math.floor((y - origin[1]) * inv);
    const iz = Math.floor((z - origin[2]) * inv);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return true;
    return outside[(iz * ny + iy) * nx + ix] === 1;
  };

  // Reach past the sealing dilation to find genuinely open space.
  const probe = (sealVoxels + 1.6) * voxelSize;
  const kept: number[] = [];
  let removed = 0;

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

    let nxv = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let nyv = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nzv = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nxv, nyv, nzv);
    if (len === 0) {
      removed++;
      continue;
    }
    nxv /= len;
    nyv /= len;
    nzv /= len;

    // Centroid plus a point pulled toward each corner.
    const samples: [number, number, number][] = [
      [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
      [(ax * 2 + bx + cx) / 4, (ay * 2 + by + cy) / 4, (az * 2 + bz + cz) / 4],
      [(ax + bx * 2 + cx) / 4, (ay + by * 2 + cy) / 4, (az + bz * 2 + cz) / 4],
      [(ax + bx + cx * 2) / 4, (ay + by + cy * 2) / 4, (az + bz + cz * 2) / 4],
    ];

    let visible = false;
    for (const [px, py, pz] of samples) {
      if (
        isOutside(px + nxv * probe, py + nyv * probe, pz + nzv * probe) ||
        isOutside(px - nxv * probe, py - nyv * probe, pz - nzv * probe)
      ) {
        visible = true;
        break;
      }
    }

    if (visible) {
      for (let c = 0; c < 9; c++) kept.push(soup[t + c]);
    } else {
      removed++;
    }
  }

  return {
    soup: new Float32Array(kept),
    report: {
      voxelSize,
      grid: dims,
      trianglesBefore: Math.floor(soup.length / 9),
      trianglesAfter: Math.floor(kept.length / 9),
      trianglesRemoved: removed,
    },
  };
}

/**
 * Fit two parts together so a later merge does not grow extra seam edges.
 *
 * Finds the pair of faces that look at each other, slides the moving part
 * until those faces are flush, then slides in-plane to maximise overlap.
 * Contact percent is that overlap against the smaller of the two faces.
 */

import { computeBounds } from './mesh';

export interface FitDelta {
  x: number;
  y: number;
  z: number;
}

export interface FitTogetherResult {
  delta: FitDelta;
  /** 0–100. How much of the smaller mating face is covered after the move. */
  contactPercent: number;
  gapClosedMm: number;
  axis: 'x' | 'y' | 'z' | 'n';
}

interface Patch {
  nx: number;
  ny: number;
  nz: number;
  offset: number;
  area: number;
  cx: number;
  cy: number;
  cz: number;
  min: [number, number, number];
  max: [number, number, number];
}

function triangleNormalArea(
  soup: Float32Array,
  t: number
): { nx: number; ny: number; nz: number; area: number } | null {
  const ax = soup[t + 3] - soup[t];
  const ay = soup[t + 4] - soup[t + 1];
  const az = soup[t + 5] - soup[t + 2];
  const bx = soup[t + 6] - soup[t];
  const by = soup[t + 7] - soup[t + 1];
  const bz = soup[t + 8] - soup[t + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  const twice = Math.hypot(nx, ny, nz);
  if (twice < 1e-18) return null;
  return { nx: nx / twice, ny: ny / twice, nz: nz / twice, area: twice / 2 };
}

function planeBasis(nx: number, ny: number, nz: number): {
  ux: number;
  uy: number;
  uz: number;
  vx: number;
  vy: number;
  vz: number;
} {
  const hx = Math.abs(nx) < 0.9 ? 1 : 0;
  const hy = Math.abs(nx) < 0.9 ? 0 : 1;
  let ux = -nz * hy;
  let uy = nz * hx;
  let uz = nx * hy - ny * hx;
  const ulen = Math.hypot(ux, uy, uz);
  ux /= ulen;
  uy /= ulen;
  uz /= ulen;
  return {
    ux,
    uy,
    uz,
    vx: ny * uz - nz * uy,
    vy: nz * ux - nx * uz,
    vz: nx * uy - ny * ux,
  };
}

/** Shift `moving` so its overlap with `fixed` is as large as possible, preferring no move. */
export function maxOverlapShift(a0: number, a1: number, b0: number, b1: number): number {
  const aLen = a1 - a0;
  const bLen = b1 - b0;
  if (!(aLen > 0) || !(bLen > 0)) return 0;
  let tMin: number;
  let tMax: number;
  if (bLen <= aLen) {
    tMin = a0 - b0;
    tMax = a1 - b1;
  } else {
    tMin = a1 - b1;
    tMax = a0 - b0;
  }
  if (tMin > tMax) {
    const swap = tMin;
    tMin = tMax;
    tMax = swap;
  }
  if (tMin <= 0 && 0 <= tMax) return 0;
  return Math.abs(tMin) <= Math.abs(tMax) ? tMin : tMax;
}

function overlapLen(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function collectPatches(soup: Float32Array): Patch[] {
  const triCount = Math.floor(soup.length / 9);
  if (triCount === 0) return [];
  const stride = Math.max(1, Math.floor(triCount / 8000));
  const buckets = new Map<
    string,
    {
      nx: number;
      ny: number;
      nz: number;
      area: number;
      cx: number;
      cy: number;
      cz: number;
      min: [number, number, number];
      max: [number, number, number];
    }
  >();

  for (let tri = 0; tri < triCount; tri += stride) {
    const t = tri * 9;
    const n = triangleNormalArea(soup, t);
    if (!n) continue;
    const cx = (soup[t] + soup[t + 3] + soup[t + 6]) / 3;
    const cy = (soup[t + 1] + soup[t + 4] + soup[t + 7]) / 3;
    const cz = (soup[t + 2] + soup[t + 5] + soup[t + 8]) / 3;
    const offset = n.nx * cx + n.ny * cy + n.nz * cz;
    const key = `${Math.round(n.nx * 20)}_${Math.round(n.ny * 20)}_${Math.round(n.nz * 20)}_${Math.round(offset * 4)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        nx: 0,
        ny: 0,
        nz: 0,
        area: 0,
        cx: 0,
        cy: 0,
        cz: 0,
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      buckets.set(key, bucket);
    }
    bucket.nx += n.nx * n.area;
    bucket.ny += n.ny * n.area;
    bucket.nz += n.nz * n.area;
    bucket.cx += cx * n.area;
    bucket.cy += cy * n.area;
    bucket.cz += cz * n.area;
    bucket.area += n.area;
    for (let k = 0; k < 3; k++) {
      const x = soup[t + k * 3];
      const y = soup[t + k * 3 + 1];
      const z = soup[t + k * 3 + 2];
      if (x < bucket.min[0]) bucket.min[0] = x;
      if (y < bucket.min[1]) bucket.min[1] = y;
      if (z < bucket.min[2]) bucket.min[2] = z;
      if (x > bucket.max[0]) bucket.max[0] = x;
      if (y > bucket.max[1]) bucket.max[1] = y;
      if (z > bucket.max[2]) bucket.max[2] = z;
    }
  }

  const patches: Patch[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.area < 1e-8) continue;
    const len = Math.hypot(bucket.nx, bucket.ny, bucket.nz);
    if (len < 1e-12) continue;
    const nx = bucket.nx / len;
    const ny = bucket.ny / len;
    const nz = bucket.nz / len;
    const cx = bucket.cx / bucket.area;
    const cy = bucket.cy / bucket.area;
    const cz = bucket.cz / bucket.area;
    patches.push({
      nx,
      ny,
      nz,
      offset: nx * cx + ny * cy + nz * cz,
      area: bucket.area,
      cx,
      cy,
      cz,
      min: bucket.min,
      max: bucket.max,
    });
  }
  patches.sort((a, b) => b.area - a.area);
  return patches.slice(0, 16);
}

function projectAabb(
  min: [number, number, number],
  max: [number, number, number],
  dx: number,
  dy: number,
  dz: number,
  ux: number,
  uy: number,
  uz: number,
  vx: number,
  vy: number,
  vz: number
): { u0: number; u1: number; v0: number; v1: number } {
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const x of [min[0] + dx, max[0] + dx]) {
    for (const y of [min[1] + dy, max[1] + dy]) {
      for (const z of [min[2] + dz, max[2] + dz]) {
        const u = x * ux + y * uy + z * uz;
        const v = x * vx + y * vy + z * vz;
        if (u < u0) u0 = u;
        if (u > u1) u1 = u;
        if (v < v0) v0 = v;
        if (v > v1) v1 = v;
      }
    }
  }
  return { u0, u1, v0, v1 };
}

function dominantAxis(nx: number, ny: number, nz: number): 'x' | 'y' | 'z' | 'n' {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ax >= 0.9 && ax >= ay && ax >= az) return 'x';
  if (ay >= 0.9 && ay >= ax && ay >= az) return 'y';
  if (az >= 0.9 && az >= ax && az >= ay) return 'z';
  return 'n';
}

function fitAabbBoxes(
  fixed: { min: [number, number, number]; max: [number, number, number] },
  moving: { min: [number, number, number]; max: [number, number, number] }
): FitTogetherResult {
  const axes = [0, 1, 2] as const;
  let best: FitTogetherResult | null = null;

  for (const i of axes) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    for (const dir of [1, -1] as const) {
      const delta: [number, number, number] = [0, 0, 0];
      if (dir === 1) delta[i] = fixed.max[i] - moving.min[i];
      else delta[i] = fixed.min[i] - moving.max[i];
      delta[j] = maxOverlapShift(fixed.min[j], fixed.max[j], moving.min[j], moving.max[j]);
      delta[k] = maxOverlapShift(fixed.min[k], fixed.max[k], moving.min[k], moving.max[k]);
      const overlapJ = overlapLen(
        fixed.min[j],
        fixed.max[j],
        moving.min[j] + delta[j],
        moving.max[j] + delta[j]
      );
      const overlapK = overlapLen(
        fixed.min[k],
        fixed.max[k],
        moving.min[k] + delta[k],
        moving.max[k] + delta[k]
      );
      const contact = overlapJ * overlapK;
      const faceA = (fixed.max[j] - fixed.min[j]) * (fixed.max[k] - fixed.min[k]);
      const faceB = (moving.max[j] - moving.min[j]) * (moving.max[k] - moving.min[k]);
      const denom = Math.max(1e-12, Math.min(faceA, faceB));
      const percent = Math.max(0, Math.min(100, (100 * contact) / denom));
      const gap = Math.hypot(delta[0], delta[1], delta[2]);
      const betterContact = !best || percent > best.contactPercent + 0.5;
      const sameContactCloser =
        !!best &&
        Math.abs(percent - best.contactPercent) <= 0.5 &&
        gap + 1e-6 < best.gapClosedMm;
      if (!best || betterContact || sameContactCloser) {
        best = {
          delta: { x: delta[0], y: delta[1], z: delta[2] },
          contactPercent: percent,
          gapClosedMm: gap,
          axis: i === 0 ? 'x' : i === 1 ? 'y' : 'z',
        };
      }
    }
  }

  return best ?? { delta: { x: 0, y: 0, z: 0 }, contactPercent: 0, gapClosedMm: 0, axis: 'x' };
}

/**
 * Translate `moving` onto `fixed` so the best-facing pair of faces becomes flush
 * with as much overlap as possible.
 */
export function fitTogether(fixed: Float32Array, moving: Float32Array): FitTogetherResult {
  const a = collectPatches(fixed);
  const b = collectPatches(moving);
  let bestScore = -1;
  let best: FitTogetherResult | null = null;

  for (const pa of a) {
    for (const pb of b) {
      const facing = pa.nx * pb.nx + pa.ny * pb.ny + pa.nz * pb.nz;
      if (facing > -0.92) continue;
      const nDotP = pa.nx * pb.cx + pa.ny * pb.cy + pa.nz * pb.cz;
      const tAlong = pa.offset - nDotP;
      let tx = tAlong * pa.nx;
      let ty = tAlong * pa.ny;
      let tz = tAlong * pa.nz;
      const basis = planeBasis(pa.nx, pa.ny, pa.nz);
      const projA = projectAabb(pa.min, pa.max, 0, 0, 0, basis.ux, basis.uy, basis.uz, basis.vx, basis.vy, basis.vz);
      const projB = projectAabb(
        pb.min,
        pb.max,
        tx,
        ty,
        tz,
        basis.ux,
        basis.uy,
        basis.uz,
        basis.vx,
        basis.vy,
        basis.vz
      );
      const su = maxOverlapShift(projA.u0, projA.u1, projB.u0, projB.u1);
      const sv = maxOverlapShift(projA.v0, projA.v1, projB.v0, projB.v1);
      tx += su * basis.ux + sv * basis.vx;
      ty += su * basis.uy + sv * basis.vy;
      tz += su * basis.uz + sv * basis.vz;
      const projB2 = projectAabb(
        pb.min,
        pb.max,
        tx,
        ty,
        tz,
        basis.ux,
        basis.uy,
        basis.uz,
        basis.vx,
        basis.vy,
        basis.vz
      );
      const contact =
        overlapLen(projA.u0, projA.u1, projB2.u0, projB2.u1) *
        overlapLen(projA.v0, projA.v1, projB2.v0, projB2.v1);
      const similarity = Math.min(pa.area, pb.area) / Math.max(pa.area, pb.area);
      const toBx = pb.cx - pa.cx;
      const toBy = pb.cy - pa.cy;
      const toBz = pb.cz - pa.cz;
      const approach = toBx * pa.nx + toBy * pa.ny + toBz * pa.nz;
      const score = contact * similarity * (approach >= -1e-4 ? 1 : 0.12);
      const gap = Math.hypot(tx, ty, tz);
      const better =
        score > bestScore * 1.02 ||
        (score >= bestScore * 0.98 && best !== null && gap < best.gapClosedMm - 1e-6) ||
        (best === null);
      if (better && score >= bestScore) {
        bestScore = score;
        const denom = Math.max(1e-12, Math.min(pa.area, pb.area));
        best = {
          delta: { x: tx, y: ty, z: tz },
          contactPercent: Math.max(0, Math.min(100, (100 * contact) / denom)),
          gapClosedMm: gap,
          axis: dominantAxis(pa.nx, pa.ny, pa.nz),
        };
      }
    }
  }

  if (best && bestScore > 1e-4) return best;

  const fb = computeBounds(fixed);
  const mb = computeBounds(moving);
  return fitAabbBoxes({ min: fb.min, max: fb.max }, { min: mb.min, max: mb.max });
}

/**
 * Drop a part onto the table (Y=0) so it sits flush and upright.
 *
 * Picks the largest planar face, rotates that face onto the floor, then
 * lowers (or lifts) the part until the bottom is on Y=0. XZ stays put so
 * it does not slide sideways while it falls.
 */

import * as THREE from 'three';
import { computeBounds } from './mesh';
import type { Vec3 } from './project';

const DEG = Math.PI / 180;
const DOWN = new THREE.Vector3(0, -1, 0);

export interface SettlePose {
  rotation: Vec3;
  position: Vec3;
  /** World min-Y before the drop. Positive = hovering; negative = through the floor. */
  droppedMm: number;
  /** Degrees we rotated to put a face on the floor. */
  tiltedDeg: number;
}

function poseSoup(
  soup: Float32Array,
  rotation: Vec3,
  scale: Vec3,
  position: Vec3
): Float32Array {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(position.x, position.y, position.z),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x * DEG, rotation.y * DEG, rotation.z * DEG, 'XYZ')
    ),
    new THREE.Vector3(scale.x, scale.y, scale.z)
  );
  const out = new Float32Array(soup.length);
  const point = new THREE.Vector3();
  for (let i = 0; i + 2 < soup.length; i += 3) {
    point.set(soup[i], soup[i + 1], soup[i + 2]).applyMatrix4(matrix);
    out[i] = point.x;
    out[i + 1] = point.y;
    out[i + 2] = point.z;
  }
  return out;
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

interface Patch {
  nx: number;
  ny: number;
  nz: number;
  area: number;
}

function collectPatches(soup: Float32Array): Patch[] {
  const triCount = Math.floor(soup.length / 9);
  if (triCount === 0) return [];
  const stride = Math.max(1, Math.floor(triCount / 8000));
  const buckets = new Map<string, { nx: number; ny: number; nz: number; area: number }>();

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
      bucket = { nx: 0, ny: 0, nz: 0, area: 0 };
      buckets.set(key, bucket);
    }
    bucket.nx += n.nx * n.area;
    bucket.ny += n.ny * n.area;
    bucket.nz += n.nz * n.area;
    bucket.area += n.area;
  }

  const patches: Patch[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.area < 1e-8) continue;
    const len = Math.hypot(bucket.nx, bucket.ny, bucket.nz);
    if (len < 1e-12) continue;
    patches.push({
      nx: bucket.nx / len,
      ny: bucket.ny / len,
      nz: bucket.nz / len,
      area: bucket.area,
    });
  }
  patches.sort((a, b) => b.area - a.area);
  return patches.slice(0, 16);
}

function eulerFromQuat(q: THREE.Quaternion): Vec3 {
  const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { x: euler.x / DEG, y: euler.y / DEG, z: euler.z / DEG };
}

function quatFromEuler(rotation: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation.x * DEG, rotation.y * DEG, rotation.z * DEG, 'XYZ')
  );
}

function poseFromRotation(
  soup: Float32Array,
  rotation: Vec3,
  scale: Vec3,
  keepCenter: { x: number; z: number },
  droppedMm: number,
  tiltedDeg: number
): SettlePose {
  const atOrigin = poseSoup(soup, rotation, scale, { x: 0, y: 0, z: 0 });
  const bounds = computeBounds(atOrigin);
  return {
    rotation,
    position: {
      x: keepCenter.x - bounds.center[0],
      y: -bounds.min[1],
      z: keepCenter.z - bounds.center[2],
    },
    droppedMm,
    tiltedDeg,
  };
}

/**
 * Rotate `soup` so a face sits on Y=0, then translate so the bottom is on the
 * floor. `worldPos` is the current origin in table space.
 */
export function settleOnFloor(
  soup: Float32Array,
  transform: { rotation: Vec3; scale: Vec3 },
  worldPos: Vec3
): SettlePose {
  const { rotation, scale } = transform;
  const world = poseSoup(soup, rotation, scale, worldPos);
  const now = computeBounds(world);
  const keepCenter = { x: now.center[0], z: now.center[2] };
  const droppedMm = now.min[1];

  const identity = poseFromRotation(soup, rotation, scale, keepCenter, droppedMm, 0);
  let best = identity;
  let bestScore = -1;

  const oriented = poseSoup(soup, rotation, scale, { x: 0, y: 0, z: 0 });
  const patches = collectPatches(oriented);
  let currentSupport = 0;
  for (const patch of patches) {
    if (patch.ny < -0.98) currentSupport += patch.area;
  }
  // Only prefer the current attitude when a face is already flush with down.
  if (currentSupport > 0) bestScore = currentSupport * 1.2;

  const currentQ = quatFromEuler(rotation);
  const n = new THREE.Vector3();
  const qDelta = new THREE.Quaternion();

  for (const patch of patches) {
    n.set(patch.nx, patch.ny, patch.nz);
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const angle = n.angleTo(DOWN);
    qDelta.setFromUnitVectors(n, DOWN);
    const newRot = eulerFromQuat(qDelta.clone().multiply(currentQ));
    const candidate = poseFromRotation(
      soup,
      newRot,
      scale,
      keepCenter,
      droppedMm,
      (angle * 180) / Math.PI
    );
    const score = patch.area * (1.1 - angle / Math.PI);
    const closer =
      Math.abs(score - bestScore) <= bestScore * 0.02 + 1e-6 &&
      candidate.tiltedDeg + 1e-4 < best.tiltedDeg;
    if (score > bestScore * 1.02 || closer || bestScore < 0) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/** Apply a settle pose — used by tests to check the part actually sits on Y=0. */
export function settledSoup(
  soup: Float32Array,
  transform: { rotation: Vec3; scale: Vec3 },
  pose: SettlePose
): Float32Array {
  return poseSoup(soup, pose.rotation, transform.scale, pose.position);
}

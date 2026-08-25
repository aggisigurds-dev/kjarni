/**
 * Fine placement for the bench: 1 mm / 1° steps, a millimetre grid, and a
 * magnetic snap that pulls a dragged part onto a neighbour's face, flush
 * alignment, centre, or a slot anchor.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

export const MOVE_STEP_PRESETS = [0.1, 1, 5, 10] as const;
export const ROTATE_STEP_PRESETS = [1, 5, 15, 90] as const;

export const DEFAULT_MOVE_STEP = 1;
export const DEFAULT_ROTATE_STEP = 1;
export const DEFAULT_MAGNET_MM = 12;

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export function snapNumber(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  return Math.round(value / step) * step;
}

/**
 * Snap a rotation in degrees to the step grid, with a magnetic pull onto
 * 90° / 180° / 270° so a part that is almost square actually lands square.
 */
export function snapAngle(degrees: number, step: number, magnet = 3): number {
  if (!Number.isFinite(degrees)) return degrees;
  const cardinals = [0, 90, 180, 270, 360, -90, -180, -270, -360];
  for (const card of cardinals) {
    if (Math.abs(degrees - card) <= magnet) return card;
  }
  return snapNumber(degrees, step);
}

export function snapVec(value: Vec3, step: number): Vec3 {
  return {
    x: snapNumber(value.x, step),
    y: snapNumber(value.y, step),
    z: snapNumber(value.z, step),
  };
}

export function aabbSize(box: Aabb): [number, number, number] {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

export function aabbCenter(box: Aabb): [number, number, number] {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

export function shiftAabb(box: Aabb, delta: Vec3): Aabb {
  return {
    min: [box.min[0] + delta.x, box.min[1] + delta.y, box.min[2] + delta.z],
    max: [box.max[0] + delta.x, box.max[1] + delta.y, box.max[2] + delta.z],
  };
}

/** True when the two boxes overlap or touch on every axis. */
export function aabbOverlap(a: Aabb, b: Aabb, epsilon = 1e-6): boolean {
  return (
    a.min[0] <= b.max[0] + epsilon &&
    a.max[0] >= b.min[0] - epsilon &&
    a.min[1] <= b.max[1] + epsilon &&
    a.max[1] >= b.min[1] - epsilon &&
    a.min[2] <= b.max[2] + epsilon &&
    a.max[2] >= b.min[2] - epsilon
  );
}

export type SnapKind = 'face' | 'flush' | 'center' | 'grid' | 'anchor';

export interface SnapHit {
  axis: Axis;
  kind: SnapKind;
  delta: number;
}

export interface SnapResult {
  delta: Vec3;
  hits: SnapHit[];
}

interface Candidate {
  delta: number;
  kind: SnapKind;
}

function bestCandidate(candidates: Candidate[], magnet: number): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.delta)) continue;
    if (Math.abs(candidate.delta) > magnet) continue;
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) best = candidate;
  }
  return best;
}

/**
 * Snap a moving AABB against neighbours, slot anchors, and an optional grid.
 *
 * Each axis is independent. A magnetic hit (face / flush / centre / anchor)
 * wins over the grid on that axis; axes with nothing nearby fall back to the
 * millimetre grid so a free drag still lands on a round number.
 */
export function snapTranslation(
  moving: Aabb,
  neighbors: Aabb[],
  options: { grid?: number; magnet?: number; anchors?: Vec3[]; axes?: Axis[] } = {}
): SnapResult {
  const grid = options.grid ?? DEFAULT_MOVE_STEP;
  const magnet = options.magnet ?? DEFAULT_MAGNET_MM;
  const anchors = options.anchors ?? [];
  const locked = new Set(options.axes ?? AXES);
  const center = aabbCenter(moving);
  const delta: Vec3 = { x: 0, y: 0, z: 0 };
  const hits: SnapHit[] = [];

  for (const axis of AXES) {
    if (!locked.has(axis)) continue;
    const i = AXIS_INDEX[axis];
    const candidates: Candidate[] = [];

    for (const other of neighbors) {
      const otherCenter = aabbCenter(other);
      candidates.push(
        { delta: other.max[i] - moving.min[i], kind: 'face' },
        { delta: other.min[i] - moving.max[i], kind: 'face' },
        { delta: other.min[i] - moving.min[i], kind: 'flush' },
        { delta: other.max[i] - moving.max[i], kind: 'flush' },
        { delta: otherCenter[i] - center[i], kind: 'center' }
      );
    }

    for (const anchor of anchors) {
      const value = axis === 'x' ? anchor.x : axis === 'y' ? anchor.y : anchor.z;
      candidates.push({ delta: value - center[i], kind: 'anchor' });
    }

    const magnetHit = bestCandidate(candidates, magnet);
    if (magnetHit) {
      delta[axis] = magnetHit.delta;
      hits.push({ axis, kind: magnetHit.kind, delta: magnetHit.delta });
      continue;
    }

    if (grid > 0) {
      const snapped = snapNumber(moving.min[i], grid) - moving.min[i];
      if (snapped !== 0) {
        delta[axis] = snapped;
        hits.push({ axis, kind: 'grid', delta: snapped });
      }
    }
  }

  return { delta, hits };
}

/** Apply a snap result to a world position. */
export function applySnap(position: Vec3, snap: SnapResult): Vec3 {
  return {
    x: position.x + snap.delta.x,
    y: position.y + snap.delta.y,
    z: position.z + snap.delta.z,
  };
}

export function snapHint(hits: SnapHit[]): string | null {
  if (hits.length === 0) return null;
  const useful = hits.filter((hit) => hit.kind !== 'grid');
  if (useful.length === 0) return 'grid 1 mm';
  const labels = useful.map((hit) => `${hit.kind} ${hit.axis.toUpperCase()}`);
  return labels.join(' · ');
}

const DEG = Math.PI / 180;

/**
 * World-axis-aligned box of a local AABB after position / Euler XYZ / scale.
 * Uses the eight corners so a rotated part still magnets on its true extents.
 */
export function orientedAabb(
  local: Aabb,
  position: Vec3,
  rotationDeg: Vec3,
  scale: Vec3
): Aabb {
  const cx = Math.cos(rotationDeg.x * DEG);
  const sx = Math.sin(rotationDeg.x * DEG);
  const cy = Math.cos(rotationDeg.y * DEG);
  const sy = Math.sin(rotationDeg.y * DEG);
  const cz = Math.cos(rotationDeg.z * DEG);
  const sz = Math.sin(rotationDeg.z * DEG);

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const x of [local.min[0], local.max[0]]) {
    for (const y of [local.min[1], local.max[1]]) {
      for (const z of [local.min[2], local.max[2]]) {
        let px = x * scale.x;
        let py = y * scale.y;
        let pz = z * scale.z;
        // Euler XYZ, same order the viewport uses.
        let y1 = py * cx - pz * sx;
        let z1 = py * sx + pz * cx;
        py = y1;
        pz = z1;
        let x2 = px * cy + pz * sy;
        z1 = -px * sy + pz * cy;
        px = x2;
        pz = z1;
        x2 = px * cz - py * sz;
        y1 = px * sz + py * cz;
        px = x2 + position.x;
        py = y1 + position.y;
        pz = pz + position.z;
        if (px < min[0]) min[0] = px;
        if (py < min[1]) min[1] = py;
        if (pz < min[2]) min[2] = pz;
        if (px > max[0]) max[0] = px;
        if (py > max[1]) max[1] = py;
        if (pz > max[2]) max[2] = pz;
      }
    }
  }

  return { min, max };
}

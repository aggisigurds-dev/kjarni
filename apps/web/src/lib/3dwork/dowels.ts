/**
 * Dowel pins for a part cut in two: matching holes bored into both cut faces,
 * and loose pins to print alongside, so the halves line up when they are glued.
 *
 * Loose pins rather than pins grown onto one half, because both halves can
 * then be printed cut face down — the flat face is the best bed a printed
 * half will ever get, and a pin sticking out of it would spoil that.
 *
 * Everything here works in the part's own coordinates, on the cross-section
 * `slicePlane` hands back: (u, v) are the two axes left once the cut axis is
 * dropped, in x, y, z order.
 */

import * as THREE from 'three';
import type { OnePiecePipe } from './one-piece';
import type { SliceAxis } from './slice';

export interface DowelSpec {
  /** Pin diameter, mm. */
  diameter: number;
  /** How deep each half is drilled, mm. */
  depth: number;
  /** How many pins to aim for; fewer are placed when the face has no room. */
  count: number;
  /** Added to the hole diameter so a printed pin slides in, mm. */
  clearance: number;
}

export const DEFAULT_DOWELS: DowelSpec = { diameter: 4, depth: 8, count: 3, clearance: 0.3 };

/** Material must extend at least this far past a hole's wall, mm. */
export const DOWEL_WALL_MM = 1.2;
/** Pins are kept at least this many diameters apart. */
const SPREAD = 2.5;
/** A bore starts this far outside the face, so it always breaks through the cap, mm. */
const OVERSHOOT = 1;
/** The pin is this much shorter than the two holes together, so it never bottoms out, mm. */
const PIN_SLACK = 1;

const AXIS_INDEX: Record<SliceAxis, number> = { x: 0, y: 1, z: 2 };

type Point2 = [number, number];
type Loop = readonly (readonly [number, number])[];

/** Even–odd rule: inside the material when an odd number of rims surround the point. */
function insideMaterial(loops: readonly Loop[], [x, y]: Point2): boolean {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [xi, yi] = loop[i];
      const [xj, yj] = loop[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from the point to any rim edge. */
function distanceToRim(loops: readonly Loop[], [x, y]: Point2): number {
  let best = Infinity;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const [ax, ay] = loop[j];
      const [bx, by] = loop[i];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const d2 = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

/**
 * Where the pins go on a cut face, in its (u, v).
 *
 * One pin goes where there is most room. Several go to the far ends first and
 * fill in between, so they hold the halves against twisting. Every pin sits in
 * material with a wall's worth to spare, and fewer come back than asked for
 * when the face is too thin for more.
 */
export function placeDowels(
  loops: readonly Loop[],
  spec: Pick<DowelSpec, 'diameter' | 'count'>
): Point2[] {
  const count = Math.floor(spec.count);
  if (count <= 0 || loops.length === 0) return [];
  const margin = spec.diameter / 2 + DOWEL_WALL_MM;

  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (const loop of loops) {
    for (const [u, v] of loop) {
      if (u < minU) minU = u;
      if (v < minV) minV = v;
      if (u > maxU) maxU = u;
      if (v > maxV) maxV = v;
    }
  }
  if (!Number.isFinite(minU)) return [];

  // Enough candidates to find the roomy spots, few enough to stay quick when
  // the rim of a dense mesh has tens of thousands of edges.
  const step = Math.max(spec.diameter / 2, Math.max(maxU - minU, maxV - minV) / 60, 0.25);
  const candidates: { p: Point2; room: number }[] = [];
  for (let u = minU + margin; u <= maxU - margin + 1e-9; u += step) {
    for (let v = minV + margin; v <= maxV - margin + 1e-9; v += step) {
      const p: Point2 = [u, v];
      if (!insideMaterial(loops, p)) continue;
      const room = distanceToRim(loops, p);
      if (room >= margin) candidates.push({ p, room });
    }
  }
  if (candidates.length === 0) return [];

  if (count === 1) {
    return [candidates.reduce((best, entry) => (entry.room > best.room ? entry : best)).p];
  }

  let cu = 0;
  let cv = 0;
  for (const entry of candidates) {
    cu += entry.p[0];
    cv += entry.p[1];
  }
  cu /= candidates.length;
  cv /= candidates.length;

  let first = candidates[0];
  let farthest = -1;
  for (const entry of candidates) {
    const d = Math.hypot(entry.p[0] - cu, entry.p[1] - cv);
    if (d > farthest) {
      farthest = d;
      first = entry;
    }
  }

  const chosen: Point2[] = [first.p];
  const apart = SPREAD * spec.diameter;
  while (chosen.length < count) {
    let best: Point2 | null = null;
    let bestGap = -1;
    for (const entry of candidates) {
      let gap = Infinity;
      for (const q of chosen) gap = Math.min(gap, Math.hypot(entry.p[0] - q[0], entry.p[1] - q[1]));
      if (gap > bestGap) {
        bestGap = gap;
        best = entry.p;
      }
    }
    if (!best || bestGap < apart) break;
    chosen.push(best);
  }
  return chosen;
}

/** A point on the cut plane, from its (u, v) and where the plane sits, in part coordinates. */
export function pointOnPlane(
  axis: SliceAxis,
  along: number,
  [u, v]: readonly [number, number]
): [number, number, number] {
  const index = AXIS_INDEX[axis];
  const [ui, vi] = [0, 1, 2].filter((i) => i !== index);
  const out: [number, number, number] = [0, 0, 0];
  out[index] = along;
  out[ui] = u;
  out[vi] = v;
  return out;
}

/** The kernel's stock runs along +X; this turns +X onto the cut axis. */
function axisRotation(axis: SliceAxis): THREE.Matrix4 {
  if (axis === 'y') return new THREE.Matrix4().makeRotationZ(Math.PI / 2);
  if (axis === 'z') return new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  return new THREE.Matrix4();
}

function frameAt(axis: SliceAxis, point: [number, number, number]): number[] {
  const matrix = new THREE.Matrix4().makeTranslation(point[0], point[1], point[2]);
  matrix.multiply(axisRotation(axis));
  return Array.from(matrix.elements);
}

/**
 * The holes for each half, as pipes for the one-piece kernel, in the part's
 * own coordinates. The clearance is already in the diameter, so the job's own
 * pipe gap should be 0. `lower` is the half on the low side of the plane —
 * `slicePlane`'s `cut` piece — and `upper` the other.
 */
export function dowelHoles(
  points: readonly (readonly [number, number])[],
  axis: SliceAxis,
  position: number,
  spec: DowelSpec
): { lower: OnePiecePipe[]; upper: OnePiecePipe[] } {
  const length = spec.depth + OVERSHOOT;
  const diameter = spec.diameter + spec.clearance;
  const hole = (point: readonly [number, number], centre: number, index: number): OnePiecePipe => ({
    name: `Dowel hole ${index + 1}`,
    diameter,
    length,
    matrix: frameAt(axis, pointOnPlane(axis, centre, point)),
  });
  return {
    lower: points.map((point, i) => hole(point, position - spec.depth / 2 + OVERSHOOT / 2, i)),
    upper: points.map((point, i) => hole(point, position + spec.depth / 2 - OVERSHOOT / 2, i)),
  };
}

/** How long a pin is printed: the two holes together, less the slack that keeps it from bottoming out. */
export function pinLength(spec: Pick<DowelSpec, 'depth'>): number {
  return Math.max(2 * spec.depth - PIN_SLACK, 2);
}

/** A pin to print: a plain cylinder along the cut axis, centred on its own origin. */
export function pinSoup(spec: Pick<DowelSpec, 'diameter' | 'depth'>, axis: SliceAxis): Float32Array {
  const radius = spec.diameter / 2;
  // three's cylinder stands along Y.
  const geometry = new THREE.CylinderGeometry(radius, radius, pinLength(spec), 48);
  if (axis === 'x') geometry.rotateZ(Math.PI / 2);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  const flat = geometry.toNonIndexed();
  const soup = new Float32Array(flat.getAttribute('position').array as ArrayLike<number>);
  geometry.dispose();
  flat.dispose();
  return soup;
}

/**
 * Boring a cylinder through a part, without resampling it.
 *
 * The voxel path can cut a hole through anything, but it rebuilds the whole
 * surface at grain size to do it — which is far too high a price when all you
 * wanted was a pipe through the middle.
 *
 * A cylinder is an exact mathematical shape, so it does not need a grid. Every
 * triangle the bore misses is passed through untouched. Triangles it crosses
 * are split where the edge meets the cylinder, which is the root of a quadratic
 * and therefore exact. The wall of the hole is then generated analytically, so
 * it is perfectly round regardless of how coarse the surrounding mesh is.
 *
 * The one approximation is the rim: the cut across a triangle is drawn as a
 * straight chord rather than the true conic, exactly as the plane cut does.
 * That error is second order in triangle size and vanishes on a dense mesh.
 */

import { computeBounds } from './mesh';

export type BoreAxis = 'x' | 'y' | 'z';

export interface BoreOptions {
  axis: BoreAxis;
  diameter: number;
  /** Centre of the bore on the other two axes, in model coordinates. */
  center: [number, number];
  /** Facets around the generated wall. */
  segments?: number;
}

export interface BoreReport {
  trianglesBefore: number;
  trianglesAfter: number;
  /** Triangles wholly inside the bore, removed. */
  trianglesRemoved: number;
  /** Triangles the bore crossed and split. */
  trianglesSplit: number;
  /** Triangles generated for the hole wall. */
  wallTriangles: number;
  /** Rim loops that ran right around the bore — one per entry or exit. */
  encirclingLoops: number;
  /** Rim loops that did not close, and so could not be walled. */
  openLoops: number;
}

const AXIS_INDEX: Record<BoreAxis, number> = { x: 0, y: 1, z: 2 };

type Vertex = [number, number, number];

export function boreCylinder(soup: Float32Array, options: BoreOptions): {
  soup: Float32Array;
  report: BoreReport;
} {
  const axis = AXIS_INDEX[options.axis];
  const [u, v] = [0, 1, 2].filter((i) => i !== axis);
  const radius = Math.max(options.diameter, 0) / 2;
  const segments = Math.max(12, options.segments ?? 96);
  const [cu, cv] = options.center;

  /** Squared distance from the bore axis. */
  const radial = (p: Vertex) => (p[u] - cu) ** 2 + (p[v] - cv) ** 2;

  /**
   * Where the segment a→b crosses the cylinder wall.
   *
   * |p(t) - centre|² = R² is a quadratic in t. With one endpoint inside and
   * one outside there is exactly one root in [0, 1].
   */
  const crossing = (a: Vertex, b: Vertex): Vertex => {
    const du = b[u] - a[u];
    const dv = b[v] - a[v];
    const ou = a[u] - cu;
    const ov = a[v] - cv;

    const qa = du * du + dv * dv;
    const qb = 2 * (ou * du + ov * dv);
    const qc = ou * ou + ov * ov - radius * radius;

    let t = 0.5;
    if (Math.abs(qa) > 1e-12) {
      const disc = qb * qb - 4 * qa * qc;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        const t1 = (-qb - root) / (2 * qa);
        const t2 = (-qb + root) / (2 * qa);
        // Whichever root lies on the segment.
        t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : 0.5;
      }
    }
    t = Math.min(1, Math.max(0, t));

    const point: Vertex = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
    // Pin it exactly onto the cylinder, so the rim and the generated wall meet
    // without a seam.
    const pu = point[u] - cu;
    const pv = point[v] - cv;
    const len = Math.hypot(pu, pv) || 1;
    point[u] = cu + (pu / len) * radius;
    point[v] = cv + (pv / len) * radius;
    return point;
  };

  /**
   * Split triangles that are large compared to the bore before cutting.
   *
   * The cut is detected by vertices falling on opposite sides of the cylinder.
   * A triangle much bigger than the bore can swallow it whole — every corner
   * outside, the hole entirely within the face — and the cut would be missed.
   * Subdividing near the bore guarantees the crossing shows up at a vertex.
   * Triangles away from the bore are never touched.
   */
  const prepared: number[] = [];
  const limit = Math.max(radius / 3, 1e-3);

  const subdivide = (a: Vertex, b: Vertex, c: Vertex, depth: number): void => {
    const longest = Math.max(
      Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]),
      Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])
    );

    // Only bother where the triangle could actually reach the cylinder.
    const near =
      Math.min(radial(a), radial(b), radial(c)) < (radius + longest) ** 2 &&
      Math.max(radial(a), radial(b), radial(c)) > 0;

    if (depth >= 6 || longest <= limit || !near) {
      prepared.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      return;
    }

    const mid = (p: Vertex, q: Vertex): Vertex => [
      (p[0] + q[0]) / 2,
      (p[1] + q[1]) / 2,
      (p[2] + q[2]) / 2,
    ];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);

    subdivide(a, ab, ca, depth + 1);
    subdivide(ab, b, bc, depth + 1);
    subdivide(ca, bc, c, depth + 1);
    subdivide(ab, bc, ca, depth + 1);
  };

  for (let t = 0; t + 8 < soup.length; t += 9) {
    subdivide(
      [soup[t], soup[t + 1], soup[t + 2]],
      [soup[t + 3], soup[t + 4], soup[t + 5]],
      [soup[t + 6], soup[t + 7], soup[t + 8]],
      0
    );
  }
  const work = new Float32Array(prepared);

  const kept: number[] = [];
  const push = (a: Vertex, b: Vertex, c: Vertex) => {
    kept.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // Rim edges, recorded as (angle, axial) pairs on the cylinder.
  const rim: [[number, number], [number, number]][] = [];
  const onWall = (p: Vertex): [number, number] => [
    Math.atan2(p[v] - cv, p[u] - cu),
    p[axis],
  ];

  let removed = 0;
  let split = 0;
  const rSq = radius * radius;

  for (let t = 0; t + 8 < work.length; t += 9) {
    const verts: Vertex[] = [
      [work[t], work[t + 1], work[t + 2]],
      [work[t + 3], work[t + 4], work[t + 5]],
      [work[t + 6], work[t + 7], work[t + 8]],
    ];
    const outside = verts.map((p) => radial(p) >= rSq);
    const count = outside.filter(Boolean).length;

    if (count === 3) {
      push(verts[0], verts[1], verts[2]);
      continue;
    }
    if (count === 0) {
      removed++;
      continue;
    }

    split++;
    const lone = outside.findIndex(
      (s, i) => s !== outside[(i + 1) % 3] && s !== outside[(i + 2) % 3]
    );
    const a = verts[lone];
    const b = verts[(lone + 1) % 3];
    const c = verts[(lone + 2) % 3];

    const ab = crossing(a, b);
    const ac = crossing(a, c);

    if (outside[lone]) {
      // Only the lone corner survives.
      push(a, ab, ac);
      rim.push([onWall(ab), onWall(ac)]);
    } else {
      // The lone corner is the part inside the bore; the other two survive.
      push(ab, b, c);
      push(ab, c, ac);
      rim.push([onWall(ac), onWall(ab)]);
    }
  }

  // --- Build the wall.
  //
  // Unwrapped, the cylinder is a flat strip in (angle, axial). The rim edges
  // trace where the part's surface meets it. A hole straight through leaves one
  // loop running all the way round per entry and per exit, and the wall is the
  // band of cylinder between consecutive loops.
  const bounds = computeBounds(soup);
  const tolerance = Math.max(bounds.diagonal * 1e-6, 1e-6);
  const key = (p: [number, number]) =>
    `${Math.round(p[0] / 1e-4)}_${Math.round(p[1] / tolerance)}`;

  const next = new Map<string, [[number, number], [number, number]][]>();
  for (const edge of rim) {
    const k = key(edge[0]);
    const list = next.get(k);
    if (list) list.push(edge);
    else next.set(k, [edge]);
  }

  const encircling: { axialMean: number; points: [number, number][] }[] = [];
  let openLoops = 0;

  for (const start of Array.from(next.keys())) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const points: [number, number][] = [];
      let currentKey = start;
      let closed = false;

      for (let guard = 0; guard < rim.length + 4; guard++) {
        const options2 = next.get(currentKey);
        if (!options2 || options2.length === 0) break;
        const edge = options2.pop() as [[number, number], [number, number]];
        if (options2.length === 0) next.delete(currentKey);

        points.push(edge[0]);
        currentKey = key(edge[1]);
        if (currentKey === start) {
          closed = true;
          break;
        }
      }

      if (!closed || points.length < 3) {
        if (points.length > 0) openLoops++;
        continue;
      }

      // Total turning tells us whether the loop goes round the bore.
      let winding = 0;
      for (let i = 0; i < points.length; i++) {
        let d = points[(i + 1) % points.length][0] - points[i][0];
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        winding += d;
      }

      if (Math.abs(Math.abs(winding) - Math.PI * 2) < 1) {
        const axialMean = points.reduce((sum, p) => sum + p[1], 0) / points.length;
        encircling.push({ axialMean, points });
      } else {
        // A rim that does not go round the bore bounds a patch rather than a
        // band. Left unwalled rather than guessed at.
        openLoops++;
      }
    }
  }

  // Pair the loops up the axis: material sits between the first and second,
  // the third and fourth, and so on.
  encircling.sort((p, q) => p.axialMean - q.axialMean);
  let wallTriangles = 0;

  const wallPoint = (angle: number, along: number): Vertex => {
    const point: Vertex = [0, 0, 0];
    point[axis] = along;
    point[u] = cu + Math.cos(angle) * radius;
    point[v] = cv + Math.sin(angle) * radius;
    return point;
  };

  /** Axial position of a loop at a given angle, by nearest sample. */
  const axialAt = (points: [number, number][], angle: number): number => {
    let best = Infinity;
    let value = points[0][1];
    for (const [a2, along] of points) {
      let d = Math.abs(a2 - angle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < best) {
        best = d;
        value = along;
      }
    }
    return value;
  };

  for (let i = 0; i + 1 < encircling.length; i += 2) {
    const low = encircling[i];
    const high = encircling[i + 1];

    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2 - Math.PI;
      const a1 = ((s + 1) / segments) * Math.PI * 2 - Math.PI;

      const p0 = wallPoint(a0, axialAt(low.points, a0));
      const p1 = wallPoint(a1, axialAt(low.points, a1));
      const p2 = wallPoint(a1, axialAt(high.points, a1));
      const p3 = wallPoint(a0, axialAt(high.points, a0));

      // Wound to face inward, toward the bore axis: this is a hole, so its
      // surface faces the empty space in the middle.
      push(p0, p2, p1);
      push(p0, p3, p2);
      wallTriangles += 2;
    }
  }

  return {
    soup: new Float32Array(kept),
    report: {
      trianglesBefore: Math.floor(soup.length / 9),
      trianglesAfter: kept.length / 9,
      trianglesRemoved: removed,
      trianglesSplit: split,
      wallTriangles,
      encirclingLoops: encircling.length,
      openLoops,
    },
  };
}

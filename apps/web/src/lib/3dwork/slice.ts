/**
 * Plane cutting — splitting a part without resampling it.
 *
 * Unlike Make Solid, nothing here goes near a voxel grid. Triangles wholly on
 * the keep side are passed through untouched, and only the ones straddling the
 * plane are split, by exact arithmetic on the original vertices. Every surface
 * that was not cut comes out bit-for-bit identical, so threads and sharp edges
 * survive a cut in a way they never survive a rebuild.
 *
 * The cut face is then capped, which is the only new geometry produced: the
 * edges left lying on the plane are chained into loops and triangulated flat.
 */

import { computeBounds } from './mesh';

export type SliceAxis = 'x' | 'y' | 'z';

export interface SliceOptions {
  axis: SliceAxis;
  /** Where the plane sits along the axis, in model coordinates. */
  position: number;
  /** Close the exposed cross-section with a flat face. */
  cap?: boolean;
}

export interface SlicePiece {
  soup: Float32Array;
  triangles: number;
}

export interface SliceReport {
  trianglesBefore: number;
  /** Triangles that had to be split because they crossed the plane. */
  trianglesSplit: number;
  /** Triangles generated to close each side's cut face. */
  capTriangles: number;
  /** Closed loops found in the cross-section. */
  capLoops: number;
  /** Loops that could not be closed and were left open. */
  openLoops: number;
}

const AXIS_INDEX: Record<SliceAxis, number> = { x: 0, y: 1, z: 2 };

type Vertex = [number, number, number];

/** Where the plane crosses the segment a→b. */
function intersect(a: Vertex, b: Vertex, axis: number, position: number): Vertex {
  const t = (position - a[axis]) / (b[axis] - a[axis]);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function pushTriangle(out: number[], a: Vertex, b: Vertex, c: Vertex): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/**
 * Ear clipping for one cross-section loop, in the plane's 2D coordinates.
 *
 * A fan would be wrong here: a cut through a real part is rarely convex, and
 * fanning a concave outline produces triangles hanging outside the material.
 */
function triangulateLoop(loop: [number, number][]): [number, number][][] {
  const points = loop.slice();
  const out: [number, number][][] = [];

  // Signed area tells us the winding, so the ear test knows which side is in.
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) points.reverse();

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]) => {
    const d1 = cross(a, b, p);
    const d2 = cross(b, c, p);
    const d3 = cross(c, a, p);
    return d1 >= 0 && d2 >= 0 && d3 >= 0;
  };

  let guard = points.length * points.length + 16;
  while (points.length > 3 && guard-- > 0) {
    let clipped = false;

    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];

      if (cross(a, b, c) <= 0) continue; // reflex corner, not an ear

      let blocked = false;
      for (let j = 0; j < points.length; j++) {
        const p = points[j];
        if (p === a || p === b || p === c) continue;
        if (inside(p, a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      out.push([a, b, c]);
      points.splice(i, 1);
      clipped = true;
      break;
    }

    // Degenerate outline that no ear fits: stop rather than spin.
    if (!clipped) break;
  }

  if (points.length === 3) out.push([points[0], points[1], points[2]]);
  return out;
}

/** Chain the cut edges into closed rims. */
function buildLoops(edges: [number, number][][], tolerance: number): {
  loops: [number, number][][];
  open: number;
} {
  const key = (p: [number, number]) =>
    `${Math.round(p[0] / tolerance)}_${Math.round(p[1] / tolerance)}`;

  const next = new Map<string, [number, number][][]>();
  for (const edge of edges) {
    const k = key(edge[0]);
    const list = next.get(k);
    if (list) list.push(edge);
    else next.set(k, [edge]);
  }

  const loops: [number, number][][] = [];
  let open = 0;

  // Snapshot the keys: the walk below deletes entries as it consumes them.
  const starts = Array.from(next.keys());
  for (const start of starts) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop: [number, number][] = [];
      let currentKey = start;
      let closed = false;

      for (let guard = 0; guard < edges.length + 4; guard++) {
        const options = next.get(currentKey);
        if (!options || options.length === 0) break;

        const edge = options.pop() as [number, number][];
        if (options.length === 0) next.delete(currentKey);

        loop.push(edge[0]);
        currentKey = key(edge[1]);
        if (currentKey === start) {
          closed = true;
          break;
        }
      }

      if (closed && loop.length >= 3) loops.push(loop);
      else if (loop.length > 0) open++;
    }
  }

  return { loops, open };
}

/**
 * Cut a mesh with an axis-aligned plane, returning both halves.
 *
 * Caps are built per side with opposite winding, so each piece closes its own
 * cross-section and stays a solid in its own right.
 */
export function slicePlane(soup: Float32Array, options: SliceOptions): {
  keep: SlicePiece;
  cut: SlicePiece;
  report: SliceReport;
} {
  const axis = AXIS_INDEX[options.axis];
  const { position, cap = true } = options;

  const below: number[] = [];
  const above: number[] = [];
  // Cut edges projected to the plane's other two axes, for capping.
  const [u, v] = [0, 1, 2].filter((i) => i !== axis);
  const rim: [number, number][][] = [];
  let split = 0;

  for (let t = 0; t + 8 < soup.length; t += 9) {
    const verts: Vertex[] = [
      [soup[t], soup[t + 1], soup[t + 2]],
      [soup[t + 3], soup[t + 4], soup[t + 5]],
      [soup[t + 6], soup[t + 7], soup[t + 8]],
    ];
    const side = verts.map((p) => p[axis] >= position);
    const count = side.filter(Boolean).length;

    if (count === 3) {
      pushTriangle(above, verts[0], verts[1], verts[2]);
      continue;
    }
    if (count === 0) {
      pushTriangle(below, verts[0], verts[1], verts[2]);
      continue;
    }

    split++;

    // Rotate so the odd vertex out is first, which collapses the two cases
    // (one above / two above) into a single piece of geometry.
    const lone = side.findIndex((s, i) => s !== side[(i + 1) % 3] && s !== side[(i + 2) % 3]);
    const a = verts[lone];
    const b = verts[(lone + 1) % 3];
    const c = verts[(lone + 2) % 3];

    const ab = intersect(a, b, axis, position);
    const ac = intersect(a, c, axis, position);

    const loneAbove = side[lone];
    if (loneAbove) {
      pushTriangle(above, a, ab, ac);
      pushTriangle(below, ab, b, c);
      pushTriangle(below, ab, c, ac);
    } else {
      pushTriangle(below, a, ab, ac);
      pushTriangle(above, ab, b, c);
      pushTriangle(above, ab, c, ac);
    }

    // The new edge lies on the plane; direction is taken so the rim winds
    // consistently around the cross-section.
    rim.push(
      loneAbove
        ? [[ac[u], ac[v]], [ab[u], ab[v]]]
        : [[ab[u], ab[v]], [ac[u], ac[v]]]
    );
  }

  let capTriangles = 0;
  let capLoops = 0;
  let openLoops = 0;

  if (cap && rim.length > 0) {
    const bounds = computeBounds(soup);
    const tolerance = Math.max(bounds.diagonal * 1e-6, 1e-6);
    const { loops, open } = buildLoops(rim, tolerance);
    openLoops = open;
    capLoops = loops.length;

    for (const loop of loops) {
      for (const triangle of triangulateLoop(loop)) {
        const point = (p: [number, number]): Vertex => {
          const out: Vertex = [0, 0, 0];
          out[axis] = position;
          out[u] = p[0];
          out[v] = p[1];
          return out;
        };
        const [p0, p1, p2] = triangle.map(point);
        // triangulateLoop normalises each loop to counter-clockwise in (u, v),
        // whose normal points along +axis. That is outward for the piece below
        // the plane, and inward for the piece above it, so the upper cap is
        // the one that gets reversed.
        pushTriangle(below, p0, p1, p2);
        pushTriangle(above, p0, p2, p1);
        capTriangles += 2;
      }
    }
  }

  return {
    keep: { soup: new Float32Array(above), triangles: above.length / 9 },
    cut: { soup: new Float32Array(below), triangles: below.length / 9 },
    report: {
      trianglesBefore: Math.floor(soup.length / 9),
      trianglesSplit: split,
      capTriangles,
      capLoops,
      openLoops,
    },
  };
}

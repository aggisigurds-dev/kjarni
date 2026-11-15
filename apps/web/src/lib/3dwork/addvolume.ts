/**
 * Add volume — reinforce an inner corner.
 *
 * Given a triangle soup and a point the user clicked, find the concave edge
 * (kverk) nearest the click, and build one clean 45° chamfer wedge that fills
 * that corner. The wedge is returned as its own soup; the caller unions it into
 * the part with the one-piece kernel, so the result is watertight and printable
 * — not loose triangles laid on top.
 *
 * Everything is in the part's LOCAL space (the space `soupOfPart` returns and
 * `updateActiveGeometry` writes back), so the part's transform is untouched.
 */

export type Vec3 = [number, number, number];

export interface ConcaveEdge {
  a: Vec3;
  b: Vec3;
  /** Outward normals of the two faces meeting at the edge. */
  n1: Vec3;
  n2: Vec3;
}

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const addv = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const mul = (p: Vec3, s: number): Vec3 => [p[0] * s, p[1] * s, p[2] * s];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p: Vec3, q: Vec3): Vec3 => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const len = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);
const nrm = (p: Vec3): Vec3 => {
  const l = len(p) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};
const triNormal = (a: Vec3, b: Vec3, c: Vec3): Vec3 => nrm(cross(sub(b, a), sub(c, a)));
const vkey = (x: number, y: number, z: number) =>
  `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;

/**
 * Every concave edge in the soup: an edge shared by exactly two triangles whose
 * fold is a valley (inner corner), between `minDeg` and `maxDeg` of bend.
 */
export function findConcaveEdges(soup: Float32Array, minDeg = 40, maxDeg = 135): ConcaveEdge[] {
  const edges = new Map<string, { a: Vec3; b: Vec3; faces: { n: Vec3; apex: Vec3 }[] }>();
  const nTri = Math.floor(soup.length / 9);
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const p: [Vec3, Vec3, Vec3] = [
      [soup[o], soup[o + 1], soup[o + 2]],
      [soup[o + 3], soup[o + 4], soup[o + 5]],
      [soup[o + 6], soup[o + 7], soup[o + 8]],
    ];
    const n = triNormal(p[0], p[1], p[2]);
    for (let e = 0; e < 3; e++) {
      const va = p[e];
      const vb = p[(e + 1) % 3];
      const apex = p[(e + 2) % 3];
      const ka = vkey(...va);
      const kb = vkey(...vb);
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      let rec = edges.get(key);
      if (!rec) {
        rec = { a: va, b: vb, faces: [] };
        edges.set(key, rec);
      }
      rec.faces.push({ n, apex });
    }
  }
  const out: ConcaveEdge[] = [];
  for (const rec of edges.values()) {
    if (rec.faces.length !== 2) continue;
    const [f1, f2] = rec.faces;
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot(f1.n, f2.n)))) * 180) / Math.PI;
    if (ang < minDeg || ang > maxDeg) continue;
    const mid = mul(addv(rec.a, rec.b), 0.5);
    // Concave: each face's far vertex sits on the +normal side of the other face.
    const concave = dot(sub(f1.apex, mid), f2.n) > 0 && dot(sub(f2.apex, mid), f1.n) > 0;
    if (!concave) continue;
    out.push({ a: rec.a, b: rec.b, n1: f1.n, n2: f2.n });
  }
  return out;
}

/** How far `p` is from the segment a–b. */
function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const span = dot(ab, ab);
  const t = span > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / span)) : 0;
  return len(sub(p, addv(a, mul(ab, t))));
}

/** Edges within this of each other in direction belong to one straight corner (cos 3°). */
const STRAIGHT_COS = 0.9986;
/** Where two corners meet, an edge further off the nearest one's line than this is the other corner (cos 40°). */
const SAME_CORNER_COS = 0.766;

/**
 * The concave edges of the corner at `point`: those passing within `radiusMm`
 * of it. Measured to the edge itself, not its midpoint — a flat-walled part has
 * one long edge down a corner, and a tap anywhere along it must find it.
 *
 * One corner at a time: from the nearest edge, the edges joined to it end to
 * end that run its way. The far side of a narrow slot is another corner, and so
 * is the one that turns away where two meet.
 */
export function concaveEdgesNear(
  soup: Float32Array,
  point: Vec3,
  radiusMm: number,
  minDeg = 40,
  maxDeg = 135
): ConcaveEdge[] {
  const near = findConcaveEdges(soup, minDeg, maxDeg)
    .map((edge) => ({ edge, distance: distanceToSegment(point, edge.a, edge.b) }))
    .filter((hit) => hit.distance <= radiusMm)
    .sort((p, q) => p.distance - q.distance);
  if (near.length === 0) return [];

  const along = nrm(sub(near[0].edge.b, near[0].edge.a));
  const ends = (edge: ConcaveEdge) => [vkey(...edge.a), vkey(...edge.b)];
  const corner = [near[0].edge];
  const reached = new Set(ends(near[0].edge));
  const rest = near
    .slice(1)
    .map((hit) => hit.edge)
    .filter((edge) => Math.abs(dot(nrm(sub(edge.b, edge.a)), along)) >= SAME_CORNER_COS);
  for (let grew = true; grew; ) {
    grew = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!ends(rest[i]).some((key) => reached.has(key))) continue;
      for (const key of ends(rest[i])) reached.add(key);
      corner.push(rest[i]);
      rest.splice(i, 1);
      grew = true;
    }
  }
  return corner;
}

/**
 * One 45° chamfer wedge that fills the corner formed by a cluster of concave
 * edges. Averages a local frame from the cluster and sweeps a single triangular
 * prism along it, sunk slightly into the material so the union bonds cleanly.
 * Returns an empty soup when there is nothing to fill.
 */
export function buildCornerWedge(edges: ConcaveEdge[], sizeMm: number): Float32Array {
  if (edges.length === 0 || sizeMm <= 0) return new Float32Array(0);
  const ref = nrm(sub(edges[0].b, edges[0].a));
  let dir: Vec3 = [0, 0, 0];
  let N1: Vec3 = [0, 0, 0];
  let N2: Vec3 = [0, 0, 0];
  let ctr: Vec3 = [0, 0, 0];
  for (const e of edges) {
    let d = nrm(sub(e.b, e.a));
    if (dot(d, ref) < 0) d = mul(d, -1);
    dir = addv(dir, d);
    // Which face comes first depends on the order the triangles arrived in. Pair
    // each edge's faces with the first edge's before averaging, or the two blur.
    const swapped =
      dot(e.n1, edges[0].n1) + dot(e.n2, edges[0].n2) < dot(e.n1, edges[0].n2) + dot(e.n2, edges[0].n1);
    N1 = addv(N1, swapped ? e.n2 : e.n1);
    N2 = addv(N2, swapped ? e.n1 : e.n2);
    ctr = addv(ctr, mul(addv(e.a, e.b), 0.5));
  }
  const k = edges.length;
  dir = nrm(dir);
  const n1 = nrm(N1);
  const n2 = nrm(N2);
  ctr = mul(ctr, 1 / k);
  if (len(dir) < 1e-6) return new Float32Array(0);

  // Span the wedge along the corner. A straight corner is filled end to end, so
  // one long edge gets a wedge its own length. A curved one keeps to the middles
  // of its edges, a little past: a straight wedge strays from an arc at its ends.
  const straight = edges.every((e) => Math.abs(dot(nrm(sub(e.b, e.a)), dir)) >= STRAIGHT_COS);
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of edges) {
    for (const end of straight ? [e.a, e.b] : [mul(addv(e.a, e.b), 0.5)]) {
      const t = dot(sub(end, ctr), dir);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  const past = straight ? 0 : 0.3;
  const A = addv(ctr, mul(dir, lo - past));
  const B = addv(ctr, mul(dir, hi + past));

  // Tangents into each face, away from the corner.
  let u1 = cross(dir, n1);
  if (dot(u1, n2) < 0) u1 = mul(u1, -1);
  u1 = nrm(u1);
  let u2 = cross(dir, n2);
  if (dot(u2, n1) < 0) u2 = mul(u2, -1);
  u2 = nrm(u2);
  const bis = nrm(addv(n1, n2)); // outward bisector; sink the corner inward for a solid bond

  const cs = (E: Vec3): [Vec3, Vec3, Vec3] => [
    sub(E, mul(bis, 0.3)),
    addv(E, mul(u1, sizeMm)),
    addv(E, mul(u2, sizeMm)),
  ];
  const [P0, Q0, R0] = cs(A);
  const [P1, Q1, R1] = cs(B);

  const out: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c);
  tri(P0, Q0, R0);
  tri(P1, R1, Q1); // caps
  tri(P0, Q0, Q1);
  tri(P0, Q1, P1);
  tri(Q0, R0, R1);
  tri(Q0, R1, Q1);
  tri(R0, P0, P1);
  tri(R0, P1, R1);
  return Float32Array.from(out);
}

/** Convenience: from a clicked point, build the wedge for the corner there. */
export function cornerWedgeAt(
  soup: Float32Array,
  point: Vec3,
  sizeMm: number,
  radiusMm = 2.5
): { wedge: Float32Array; edges: ConcaveEdge[] } {
  const edges = concaveEdgesNear(soup, point, radiusMm);
  return { wedge: buildCornerWedge(edges, sizeMm), edges };
}

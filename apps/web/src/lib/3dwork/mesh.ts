/**
 * Mesh topology and repair.
 *
 * STL carries no connectivity at all, so every meaningful check — is it
 * watertight, are the normals consistent, is there a hole — starts by welding
 * the triangle soup back into an indexed mesh. `autoFix` runs that whole
 * pipeline and reports what it changed.
 */

export interface IndexedMesh {
  /** Unique vertices, 3 doubles each. */
  positions: Float64Array;
  /** Triangle corners as indices into `positions`. */
  indices: Uint32Array;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
  diagonal: number;
}

export interface Topology {
  triangles: number;
  vertices: number;
  /** Edges used by exactly one triangle — the rim of a hole. */
  boundaryEdges: number;
  /** Edges shared by three or more triangles — geometry that cannot be printed. */
  nonManifoldEdges: number;
  /** Edges whose two triangles wind the same way, i.e. one of them is flipped. */
  inconsistentEdges: number;
  holes: number;
  watertight: boolean;
  /** Signed volume in model units cubed. Negative means inside-out. */
  signedVolume: number;
  area: number;
  bounds: Bounds;
}

export interface FixOptions {
  weldTolerance?: number;
  fillHoles?: boolean;
  /** Boundary loops longer than this are left alone — a guessed patch would lie. */
  maxHoleEdges?: number;
  dropToTable?: boolean;
  centerOnTable?: boolean;
  /** Drop disconnected shells under 1% of the largest shell's area. Default true. */
  dropDust?: boolean;
}

export interface FixReport {
  weldedVertices: number;
  removedDegenerate: number;
  removedDuplicateTriangles: number;
  flippedTriangles: number;
  filledHoles: number;
  unfilledHoles: number;
  invertedSolid: boolean;
  /** Tiny disconnected shells (scan dust) that were dropped. */
  removedShells: number;
  /** True when a slightly looser weld was used to close hairline cracks. */
  crackWeld: boolean;
  /** False when the mesh was already clean — callers should not save a version. */
  changed: boolean;
  before: Topology;
  after: Topology;
}

export function computeBounds(positions: ArrayLike<number>): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX)) {
    const zero: [number, number, number] = [0, 0, 0];
    return { min: zero, max: zero, size: zero, center: zero, diagonal: 0 };
  }

  const size: [number, number, number] = [maxX - minX, maxY - minY, maxZ - minZ];
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size,
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    diagonal: Math.hypot(size[0], size[1], size[2]),
  };
}

function defaultTolerance(bounds: Bounds): number {
  return Math.max(bounds.diagonal * 1e-6, 1e-6);
}

/**
 * Spatial hash for one grid cell.
 *
 * Integer mixing rather than a `"x,y,z"` string: welding a 190k-triangle part
 * probes 27 cells per corner, and building 15 million short-lived strings was
 * the single slowest thing in the app. Hash collisions are harmless because
 * every candidate is still distance-checked below.
 */
function cellHash(x: number, y: number, z: number): number {
  return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;
}

/** Welding the same geometry twice is common; the result is immutable. */
const weldCache = new WeakMap<Float32Array, { mesh: IndexedMesh; welded: number }>();

/**
 * Weld a triangle soup into an indexed mesh. Vertices are bucketed on a grid of
 * `tolerance` cells; each candidate also checks the 26 neighbouring cells so
 * that two points straddling a cell boundary still merge.
 *
 * Results for the default tolerance are memoised against the input array, since
 * measurement, repair and the 2D outline all weld the same part.
 */
export function weld(soup: Float32Array, tolerance?: number): { mesh: IndexedMesh; welded: number } {
  if (tolerance === undefined) {
    const cached = weldCache.get(soup);
    if (cached) return cached;
  }

  const bounds = computeBounds(soup);
  const tol = tolerance ?? defaultTolerance(bounds);
  const tolSq = tol * tol;
  const inv = 1 / tol;

  const buckets = new Map<number, number[]>();
  const corners = Math.floor(soup.length / 3);
  const indices = new Uint32Array(corners);

  // Grown by hand rather than via push() on a plain array: this is the hot loop.
  let positions = new Float64Array(Math.max(3, corners * 3));
  let vertexCount = 0;

  for (let c = 0; c < corners; c++) {
    const x = soup[c * 3];
    const y = soup[c * 3 + 1];
    const z = soup[c * 3 + 2];
    const gx = Math.floor(x * inv);
    const gy = Math.floor(y * inv);
    const gz = Math.floor(z * inv);

    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx++) {
      for (let dy = -1; dy <= 1 && found < 0; dy++) {
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          const bucket = buckets.get(cellHash(gx + dx, gy + dy, gz + dz));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const candidate = bucket[i];
            const ox = positions[candidate * 3] - x;
            const oy = positions[candidate * 3 + 1] - y;
            const oz = positions[candidate * 3 + 2] - z;
            if (ox * ox + oy * oy + oz * oz <= tolSq) {
              found = candidate;
              break;
            }
          }
        }
      }
    }

    if (found < 0) {
      found = vertexCount++;
      positions[found * 3] = x;
      positions[found * 3 + 1] = y;
      positions[found * 3 + 2] = z;

      const key = cellHash(gx, gy, gz);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(found);
      else buckets.set(key, [found]);
    }
    indices[c] = found;
  }

  const result = {
    mesh: { positions: positions.subarray(0, vertexCount * 3), indices },
    welded: corners - vertexCount,
  };

  if (tolerance === undefined) weldCache.set(soup, result);
  return result;
}

export function toSoup(mesh: IndexedMesh): Float32Array {
  const soup = new Float32Array(mesh.indices.length * 3);
  for (let i = 0; i < mesh.indices.length; i++) {
    const v = mesh.indices[i] * 3;
    soup[i * 3] = mesh.positions[v];
    soup[i * 3 + 1] = mesh.positions[v + 1];
    soup[i * 3 + 2] = mesh.positions[v + 2];
  }
  return soup;
}

function triangleArea(p: Float64Array, a: number, b: number, c: number): number {
  const ax = p[b * 3] - p[a * 3];
  const ay = p[b * 3 + 1] - p[a * 3 + 1];
  const az = p[b * 3 + 2] - p[a * 3 + 2];
  const bx = p[c * 3] - p[a * 3];
  const by = p[c * 3 + 1] - p[a * 3 + 1];
  const bz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = ay * bz - az * by;
  const ny = az * bx - ax * bz;
  const nz = ax * by - ay * bx;
  return Math.hypot(nx, ny, nz) / 2;
}

/** Sum of signed tetrahedron volumes; exact for any closed surface. */
export function signedVolume(mesh: IndexedMesh): number {
  const { positions: p, indices } = mesh;
  let total = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    total +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) +
      p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return total / 6;
}

export function surfaceArea(mesh: IndexedMesh): number {
  let total = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    total += triangleArea(mesh.positions, mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]);
  }
  return total;
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

interface EdgeRecord {
  /** Triangle indices (t/3) that use this edge. */
  triangles: number[];
  /** How many of them traverse it low->high. */
  forward: number;
}

function buildEdges(indices: Uint32Array): Map<string, EdgeRecord> {
  const edges = new Map<string, EdgeRecord>();
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e];
      const b = indices[t + ((e + 1) % 3)];
      const key = edgeKey(a, b);
      let record = edges.get(key);
      if (!record) {
        record = { triangles: [], forward: 0 };
        edges.set(key, record);
      }
      record.triangles.push(t / 3);
      if (a < b) record.forward++;
    }
  }
  return edges;
}

/** Walk the one-sided edges into closed rims. Each rim is one hole. */
function boundaryLoops(indices: Uint32Array, edges: Map<string, EdgeRecord>): number[][] {
  const next = new Map<number, number[]>();
  for (const [key, record] of edges) {
    if (record.triangles.length !== 1) continue;
    const [a, b] = key.split('_').map(Number);
    // Recover the direction the owning triangle walks this edge.
    const t = record.triangles[0] * 3;
    let from = a;
    let to = b;
    for (let e = 0; e < 3; e++) {
      if (indices[t + e] === b && indices[t + ((e + 1) % 3)] === a) {
        from = b;
        to = a;
        break;
      }
    }
    const list = next.get(from);
    if (list) list.push(to);
    else next.set(from, [to]);
  }

  const loops: number[][] = [];
  while (next.size > 0) {
    const start = next.keys().next().value as number;
    const loop: number[] = [];
    let current = start;

    while (true) {
      const options = next.get(current);
      if (!options || options.length === 0) break;
      const step = options.pop() as number;
      if (options.length === 0) next.delete(current);
      loop.push(current);
      current = step;
      if (current === start) break;
      if (loop.length > indices.length) break; // corrupt data guard
    }

    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function analyze(mesh: IndexedMesh): Topology {
  const edges = buildEdges(mesh.indices);
  let boundary = 0;
  let nonManifold = 0;
  let inconsistent = 0;

  for (const record of edges.values()) {
    if (record.triangles.length === 1) boundary++;
    else if (record.triangles.length > 2) nonManifold++;
    // A well-wound pair traverses the edge once each way, so forward === 1.
    else if (record.forward !== 1) inconsistent++;
  }

  return {
    triangles: mesh.indices.length / 3,
    vertices: mesh.positions.length / 3,
    boundaryEdges: boundary,
    nonManifoldEdges: nonManifold,
    inconsistentEdges: inconsistent,
    holes: boundary === 0 ? 0 : boundaryLoops(mesh.indices, edges).length,
    watertight: boundary === 0 && nonManifold === 0 && inconsistent === 0,
    signedVolume: signedVolume(mesh),
    area: surfaceArea(mesh),
    bounds: computeBounds(mesh.positions),
  };
}

function triangleLongestEdge(p: Float64Array, a: number, b: number, c: number): number {
  const d = (i: number, j: number) =>
    Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 1] - p[j * 3 + 1], p[i * 3 + 2] - p[j * 3 + 2]);
  return Math.max(d(a, b), d(b, c), d(c, a));
}

function triangleIsJunk(p: Float64Array, a: number, b: number, c: number, minArea: number): boolean {
  if (a === b || b === c || a === c) return true;
  const area = triangleArea(p, a, b, c);
  if (area <= minArea) return true;
  const longest = triangleLongestEdge(p, a, b, c);
  if (longest === 0) return true;
  const height = (2 * area) / longest;
  // Needles: almost-collinear corners that still have a non-zero cross product.
  return height <= Math.max(1e-8, longest * 1e-5);
}

function dropDegenerate(
  mesh: IndexedMesh,
  minArea = 0
): {
  indices: Uint32Array;
  degenerate: number;
  duplicates: number;
} {
  const kept: number[] = [];
  const seen = new Set<string>();
  let degenerate = 0;
  let duplicates = 0;

  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t];
    const b = mesh.indices[t + 1];
    const c = mesh.indices[t + 2];

    if (triangleIsJunk(mesh.positions, a, b, c, minArea)) {
      degenerate++;
      continue;
    }
    // Same three corners in any winding is a duplicate face.
    const key = [a, b, c].sort((x, y) => x - y).join('_');
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    kept.push(a, b, c);
  }

  return { indices: new Uint32Array(kept), degenerate, duplicates };
}

/** Groups of triangles that share any edge — one shell each. */
function triangleComponents(indices: Uint32Array): number[][] {
  const triangleCount = indices.length / 3;
  const neighbours: number[][] = Array.from({ length: triangleCount }, () => []);
  for (const record of buildEdges(indices).values()) {
    const ts = record.triangles;
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        neighbours[ts[i]].push(ts[j]);
        neighbours[ts[j]].push(ts[i]);
      }
    }
  }

  const seen = new Uint8Array(triangleCount);
  const components: number[][] = [];
  for (let seed = 0; seed < triangleCount; seed++) {
    if (seen[seed]) continue;
    seen[seed] = 1;
    const stack = [seed];
    const component: number[] = [];
    while (stack.length > 0) {
      const t = stack.pop() as number;
      component.push(t);
      for (const other of neighbours[t]) {
        if (seen[other]) continue;
        seen[other] = 1;
        stack.push(other);
      }
    }
    components.push(component);
  }
  return components;
}

/**
 * Drop disconnected dust: anything under 1% of the largest shell's area.
 * The largest shell is always kept, even if the whole mesh is tiny.
 */
function dropDust(mesh: IndexedMesh): { indices: Uint32Array; removedShells: number } {
  const components = triangleComponents(mesh.indices);
  if (components.length <= 1) return { indices: mesh.indices, removedShells: 0 };

  const areas = components.map((component) => {
    let area = 0;
    for (const t of component) {
      area += triangleArea(
        mesh.positions,
        mesh.indices[t * 3],
        mesh.indices[t * 3 + 1],
        mesh.indices[t * 3 + 2]
      );
    }
    return area;
  });
  const largest = Math.max(...areas);
  const cutoff = largest * 0.01;
  const kept: number[] = [];
  let removedShells = 0;

  for (let i = 0; i < components.length; i++) {
    if (areas[i] < cutoff && areas[i] !== largest) {
      removedShells++;
      continue;
    }
    for (const t of components[i]) {
      kept.push(mesh.indices[t * 3], mesh.indices[t * 3 + 1], mesh.indices[t * 3 + 2]);
    }
  }

  return { indices: new Uint32Array(kept), removedShells };
}

/** Drop unused vertices so later stats (and the next weld) stay honest. */
function compact(mesh: IndexedMesh): IndexedMesh {
  const vertexCount = mesh.positions.length / 3;
  const map = new Int32Array(vertexCount).fill(-1);
  let next = 0;
  for (let i = 0; i < mesh.indices.length; i++) {
    const v = mesh.indices[i];
    if (map[v] < 0) map[v] = next++;
  }
  if (next === vertexCount) return mesh;

  const positions = new Float64Array(next * 3);
  for (let v = 0; v < vertexCount; v++) {
    const mapped = map[v];
    if (mapped < 0) continue;
    positions[mapped * 3] = mesh.positions[v * 3];
    positions[mapped * 3 + 1] = mesh.positions[v * 3 + 1];
    positions[mapped * 3 + 2] = mesh.positions[v * 3 + 2];
  }
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < mesh.indices.length; i++) indices[i] = map[mesh.indices[i]];
  return { positions, indices };
}

function newellNormal(positions: Float64Array, loop: number[]): { x: number; y: number; z: number } {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i] * 3;
    const b = loop[(i + 1) % loop.length] * 3;
    const ax = positions[a];
    const ay = positions[a + 1];
    const az = positions[a + 2];
    const bx = positions[b];
    const by = positions[b + 1];
    const bz = positions[b + 2];
    nx += (ay - by) * (az + bz);
    ny += (az - bz) * (ax + bx);
    nz += (ax - bx) * (ay + by);
  }
  return { x: nx, y: ny, z: nz };
}

function signedPolyArea(poly: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

function pointInTri2d(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): boolean {
  const orient = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const o1 = orient(a, b, p);
  const o2 = orient(b, c, p);
  const o3 = orient(c, a, p);
  const hasNeg = o1 < -1e-14 || o2 < -1e-14 || o3 < -1e-14;
  const hasPos = o1 > 1e-14 || o2 > 1e-14 || o3 > 1e-14;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clip a (mostly) planar hole. Returns triangle indices, or null if the
 * loop is too folded for a 2D clip — caller then fans from the centroid.
 */
function triangulateLoop(positions: Float64Array, loop: number[]): number[] | null {
  if (loop.length < 3) return null;
  if (loop.length === 3) return [loop[0], loop[1], loop[2]];

  const nrm = newellNormal(positions, loop);
  const nlen = Math.hypot(nrm.x, nrm.y, nrm.z);
  if (nlen < 1e-12) return null;
  const nx = nrm.x / nlen;
  const ny = nrm.y / nlen;
  const nz = nrm.z / nlen;

  const hx = Math.abs(nx) < 0.9 ? 1 : 0;
  const hy = Math.abs(nx) < 0.9 ? 0 : 1;
  let ux = -nz * hy;
  let uy = nz * hx;
  let uz = nx * hy - ny * hx;
  const ulen = Math.hypot(ux, uy, uz);
  if (ulen < 1e-12) return null;
  ux /= ulen;
  uy /= ulen;
  uz /= ulen;
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  type P2 = { i: number; x: number; y: number };
  const origin = loop[0] * 3;
  let poly: P2[] = loop.map((i) => {
    const dx = positions[i * 3] - positions[origin];
    const dy = positions[i * 3 + 1] - positions[origin + 1];
    const dz = positions[i * 3 + 2] - positions[origin + 2];
    return { i, x: dx * ux + dy * uy + dz * uz, y: dx * vx + dy * vy + dz * vz };
  });
  if (signedPolyArea(poly) < 0) poly = poly.reverse();

  const tris: number[] = [];
  let guard = 0;
  while (poly.length > 3 && guard++ < 4000) {
    let clipped = false;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i + poly.length - 1) % poly.length];
      const b = poly[i];
      const c = poly[(i + 1) % poly.length];
      const crossZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (crossZ <= 1e-14) continue;
      let ear = true;
      for (const p of poly) {
        if (p === a || p === b || p === c) continue;
        if (pointInTri2d(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      tris.push(a.i, b.i, c.i);
      poly.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }
  if (poly.length === 3) tris.push(poly[0].i, poly[1].i, poly[2].i);
  return tris.length >= 3 ? tris : null;
}

/** Last resort for non-planar holes: fan from the centroid of the rim. */
function centroidFan(
  positions: Float64Array,
  loop: number[]
): { positions: Float64Array; indices: number[] } {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const i of loop) {
    cx += positions[i * 3];
    cy += positions[i * 3 + 1];
    cz += positions[i * 3 + 2];
  }
  const n = loop.length;
  cx /= n;
  cy /= n;
  cz /= n;

  const next = new Float64Array(positions.length + 3);
  next.set(positions);
  next[positions.length] = cx;
  next[positions.length + 1] = cy;
  next[positions.length + 2] = cz;
  const ci = positions.length / 3;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(loop[i], loop[(i + 1) % n], ci);
  return { positions: next, indices };
}

function countTinyHoles(mesh: IndexedMesh): number {
  const loops = boundaryLoops(mesh.indices, buildEdges(mesh.indices));
  return loops.filter((loop) => loop.length <= 6).length;
}

/**
 * Make every triangle agree with its neighbours. Walks the connectivity graph
 * flipping whatever disagrees, then flips the whole shell if it ended up
 * inside-out (negative volume).
 */
function orient(mesh: IndexedMesh): { indices: Uint32Array; flipped: number; inverted: boolean } {
  const indices = Uint32Array.from(mesh.indices);
  const triangleCount = indices.length / 3;
  const edges = buildEdges(indices);

  const neighbours: number[][] = Array.from({ length: triangleCount }, () => []);
  for (const record of edges.values()) {
    if (record.triangles.length !== 2) continue;
    const [x, y] = record.triangles;
    neighbours[x].push(y);
    neighbours[y].push(x);
  }

  const flip = (t: number) => {
    const tmp = indices[t * 3 + 1];
    indices[t * 3 + 1] = indices[t * 3 + 2];
    indices[t * 3 + 2] = tmp;
  };

  const sharesDirectedEdge = (a: number, b: number): boolean => {
    for (let i = 0; i < 3; i++) {
      const a0 = indices[a * 3 + i];
      const a1 = indices[a * 3 + ((i + 1) % 3)];
      for (let j = 0; j < 3; j++) {
        if (indices[b * 3 + j] === a0 && indices[b * 3 + ((j + 1) % 3)] === a1) return true;
      }
    }
    return false;
  };

  const visited = new Uint8Array(triangleCount);
  let flipped = 0;

  for (let seed = 0; seed < triangleCount; seed++) {
    if (visited[seed]) continue;
    visited[seed] = 1;
    const queue = [seed];

    while (queue.length > 0) {
      const current = queue.pop() as number;
      for (const other of neighbours[current]) {
        if (visited[other]) continue;
        visited[other] = 1;
        // Neighbours must traverse their shared edge in opposite directions.
        if (sharesDirectedEdge(current, other)) {
          flip(other);
          flipped++;
        }
        queue.push(other);
      }
    }
  }

  const inverted = signedVolume({ positions: mesh.positions, indices }) < 0;
  if (inverted) {
    for (let t = 0; t < triangleCount; t++) flip(t);
    flipped = triangleCount - flipped;
  }

  return { indices, flipped, inverted };
}

/**
 * Patch small boundary rims. Planar holes are ear-clipped (so concave rims
 * fill without covering the outside). Folded rims fall back to a centroid fan.
 * Loops longer than `maxHoleEdges` are reported, not guessed at.
 */
function fillHoles(
  mesh: IndexedMesh,
  maxHoleEdges: number
): { positions: Float64Array; indices: Uint32Array; filled: number; unfilled: number } {
  const edges = buildEdges(mesh.indices);
  const loops = boundaryLoops(mesh.indices, edges);
  let positions = mesh.positions;
  const extra: number[] = [];
  let filled = 0;
  let unfilled = 0;

  for (const loop of loops) {
    if (loop.length < 3 || loop.length > maxHoleEdges) {
      unfilled++;
      continue;
    }
    // The rim runs the way the surrounding triangles walk it, so the patch has
    // to run the other way to face outward. `orient()` re-checks after.
    const rim = [...loop].reverse();
    const clipped = triangulateLoop(positions, rim);
    if (clipped && clipped.length >= 3) {
      extra.push(...clipped);
      filled++;
      continue;
    }
    const fan = centroidFan(positions, rim);
    positions = fan.positions;
    extra.push(...fan.indices);
    filled++;
  }

  if (extra.length === 0) {
    return { positions, indices: mesh.indices, filled, unfilled };
  }

  const merged = new Uint32Array(mesh.indices.length + extra.length);
  merged.set(mesh.indices, 0);
  merged.set(extra, mesh.indices.length);
  return { positions, indices: merged, filled, unfilled };
}

function translate(positions: Float64Array, dx: number, dy: number, dz: number): void {
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] += dx;
    positions[i + 1] += dy;
    positions[i + 2] += dz;
  }
}

/**
 * The one-button repair: weld (retrying a hairline-crack tolerance if the first
 * pass leaves pinholes), drop junk and dust shells, agree on winding, patch
 * holes with ear-clip / centroid fill, and optionally sit the part on the table.
 */
export function autoFix(soup: Float32Array, options: FixOptions = {}): {
  soup: Float32Array;
  report: FixReport;
} {
  const {
    fillHoles: shouldFill = true,
    maxHoleEdges = 200,
    dropDust: shouldDropDust = true,
  } = options;

  const initial = weld(soup, options.weldTolerance);
  const before = analyze(initial.mesh);

  let welded = initial;
  let crackWeld = false;
  if (options.weldTolerance === undefined && countTinyHoles(initial.mesh) > 0) {
    const bounds = computeBounds(soup);
    const defaultTol = defaultTolerance(bounds);
    const looser = Math.min(0.15, Math.max(0.05, bounds.diagonal * 5e-4, defaultTol * 25));
    if (looser > defaultTol * 1.5) {
      const retry = weld(soup, looser);
      const vertsBefore = initial.mesh.positions.length / 3;
      const vertsAfter = retry.mesh.positions.length / 3;
      const holesAfter = analyze(retry.mesh).holes;
      if (vertsAfter >= vertsBefore * 0.45 && holesAfter < before.holes) {
        welded = retry;
        crackWeld = true;
      }
    }
  }

  const sliverArea = Math.max(1e-18, before.bounds.diagonal ** 2 * 1e-14);
  const cleaned = dropDegenerate({ positions: welded.mesh.positions, indices: welded.mesh.indices }, sliverArea);
  let mesh: IndexedMesh = { positions: welded.mesh.positions, indices: cleaned.indices };

  let removedShells = 0;
  if (shouldDropDust) {
    const dusted = dropDust(mesh);
    mesh = { positions: mesh.positions, indices: dusted.indices };
    removedShells = dusted.removedShells;
  }
  mesh = compact(mesh);

  const oriented = orient(mesh);
  mesh = { positions: mesh.positions, indices: oriented.indices };

  let filled = 0;
  let unfilled = 0;
  if (shouldFill) {
    const patched = fillHoles(mesh, maxHoleEdges);
    mesh = { positions: patched.positions, indices: patched.indices };
    filled = patched.filled;
    unfilled = patched.unfilled;
    if (filled > 0) {
      const afterFill = dropDegenerate(mesh);
      mesh = compact({ positions: mesh.positions, indices: afterFill.indices });
      const reoriented = orient(mesh);
      mesh = { positions: mesh.positions, indices: reoriented.indices };
    }
  }

  const bounds = computeBounds(mesh.positions);
  let moved = false;
  if (options.centerOnTable || options.dropToTable) {
    const dx = options.centerOnTable ? -bounds.center[0] : 0;
    const dy = options.dropToTable ? -bounds.min[1] : 0;
    const dz = options.centerOnTable ? -bounds.center[2] : 0;
    moved = Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9 || Math.abs(dz) > 1e-9;
    if (moved) {
      const positions = Float64Array.from(mesh.positions);
      translate(positions, dx, dy, dz);
      mesh = { positions, indices: mesh.indices };
    }
  }

  const changed =
    cleaned.degenerate > 0 ||
    cleaned.duplicates > 0 ||
    oriented.flipped > 0 ||
    filled > 0 ||
    oriented.inverted ||
    removedShells > 0 ||
    crackWeld ||
    moved;

  return {
    soup: toSoup(mesh),
    report: {
      weldedVertices: welded.welded,
      removedDegenerate: cleaned.degenerate,
      removedDuplicateTriangles: cleaned.duplicates,
      flippedTriangles: oriented.flipped,
      filledHoles: filled,
      unfilledHoles: unfilled,
      invertedSolid: oriented.inverted,
      removedShells,
      crackWeld,
      changed,
      before,
      after: analyze(mesh),
    },
  };
}

/** Topology summary without repairing anything. */
export function inspect(soup: Float32Array, weldTolerance?: number): Topology {
  return analyze(weld(soup, weldTolerance).mesh);
}

export interface SimplifyOptions {
  /**
   * Cluster cell size as a fraction of the bounding-box diagonal. Bigger means
   * coarser: 0.002 barely shows, 0.02 is a heavy reduction.
   */
  strength: number;
  fillHoles?: boolean;
}

export interface SimplifyReport {
  trianglesBefore: number;
  trianglesAfter: number;
  verticesBefore: number;
  verticesAfter: number;
  /** 0-1 share of triangles removed. */
  reduction: number;
  cellSize: number;
  after: Topology;
}

/**
 * Reduce triangle count by vertex clustering.
 *
 * The mesh is snapped onto a grid, every vertex in a cell becomes one vertex,
 * and the triangles that collapse to a line or point are dropped. It is
 * deliberately not quadric edge collapse: the meshes this is for are already
 * non-manifold and self-intersecting, which is exactly where edge-collapse
 * decimators fall over, and clustering does not care about topology at all.
 *
 * Two consequences worth knowing: detail smaller than the cell disappears, and
 * two surfaces closer together than the cell — thin walls, narrow gaps — merge
 * into one. Keep the cell under the thinnest wall you need to survive.
 */
export function simplify(soup: Float32Array, options: SimplifyOptions): {
  soup: Float32Array;
  report: SimplifyReport;
} {
  const bounds = computeBounds(soup);
  const cellSize = Math.max(bounds.diagonal * options.strength, 1e-6);

  const before = weld(soup);
  const clustered = weld(soup, cellSize);

  const cleaned = dropDegenerate(clustered.mesh);
  let mesh: IndexedMesh = { positions: clustered.mesh.positions, indices: cleaned.indices };

  const oriented = orient(mesh);
  mesh = { positions: mesh.positions, indices: oriented.indices };

  if (options.fillHoles) {
    const patched = fillHoles(mesh, 200);
    mesh = { positions: patched.positions, indices: patched.indices };
    if (patched.filled > 0) {
      const reoriented = orient(mesh);
      mesh = { positions: mesh.positions, indices: reoriented.indices };
    }
  }

  const trianglesBefore = before.mesh.indices.length / 3;
  const trianglesAfter = mesh.indices.length / 3;

  return {
    soup: toSoup(mesh),
    report: {
      trianglesBefore,
      trianglesAfter,
      verticesBefore: before.mesh.positions.length / 3,
      verticesAfter: mesh.positions.length / 3,
      reduction: trianglesBefore > 0 ? 1 - trianglesAfter / trianglesBefore : 0,
      cellSize,
      after: analyze(mesh),
    },
  };
}

/**
 * Rotate a Z-up model into the Y-up world the viewport uses.
 *
 * CAD and slicers treat +Z as up; three.js treats +Y as up. Without this every
 * imported part arrives lying on its side.
 */
export function zUpToYUp(soup: Float32Array): Float32Array {
  const out = new Float32Array(soup.length);
  for (let i = 0; i + 2 < soup.length; i += 3) {
    out[i] = soup[i];
    out[i + 1] = soup[i + 2];
    out[i + 2] = -soup[i + 1];
  }
  return out;
}

/**
 * Move a part onto its own origin so slot anchors mean the same thing for every
 * part, whatever coordinates it was exported in. With `dropToTable` the part
 * sits on Y=0 instead of straddling it.
 */
export function recenter(soup: Float32Array, dropToTable = false): Float32Array {
  const bounds = computeBounds(soup);
  const dx = -bounds.center[0];
  const dy = dropToTable ? -bounds.min[1] : -bounds.center[1];
  const dz = -bounds.center[2];

  const out = new Float32Array(soup.length);
  for (let i = 0; i + 2 < soup.length; i += 3) {
    out[i] = soup[i] + dx;
    out[i + 1] = soup[i + 1] + dy;
    out[i + 2] = soup[i + 2] + dz;
  }
  return out;
}

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
  /** Boundary loops longer than this are left alone — a fan fill would lie. */
  maxHoleEdges?: number;
  dropToTable?: boolean;
  centerOnTable?: boolean;
}

export interface FixReport {
  weldedVertices: number;
  removedDegenerate: number;
  removedDuplicateTriangles: number;
  flippedTriangles: number;
  filledHoles: number;
  unfilledHoles: number;
  invertedSolid: boolean;
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

function dropDegenerate(mesh: IndexedMesh): {
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

    if (a === b || b === c || a === c || triangleArea(mesh.positions, a, b, c) === 0) {
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

/** Fan-triangulate small boundary rims. Large rims are reported, not guessed at. */
function fillHoles(
  mesh: IndexedMesh,
  maxHoleEdges: number
): { indices: Uint32Array; filled: number; unfilled: number } {
  const edges = buildEdges(mesh.indices);
  const loops = boundaryLoops(mesh.indices, edges);
  const extra: number[] = [];
  let filled = 0;
  let unfilled = 0;

  for (const loop of loops) {
    if (loop.length > maxHoleEdges) {
      unfilled++;
      continue;
    }
    // The rim runs the way the surrounding triangles walk it, so the patch has
    // to run the other way to face outward.
    const rim = [...loop].reverse();
    for (let i = 1; i + 1 < rim.length; i++) {
      extra.push(rim[0], rim[i], rim[i + 1]);
    }
    filled++;
  }

  if (extra.length === 0) return { indices: mesh.indices, filled, unfilled };

  const merged = new Uint32Array(mesh.indices.length + extra.length);
  merged.set(mesh.indices, 0);
  merged.set(extra, mesh.indices.length);
  return { indices: merged, filled, unfilled };
}

function translate(positions: Float64Array, dx: number, dy: number, dz: number): void {
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] += dx;
    positions[i + 1] += dy;
    positions[i + 2] += dz;
  }
}

/**
 * The one-button repair: weld, drop junk triangles, agree on winding, patch
 * small holes, and optionally sit the part on the table.
 */
export function autoFix(soup: Float32Array, options: FixOptions = {}): {
  soup: Float32Array;
  report: FixReport;
} {
  const { fillHoles: shouldFill = true, maxHoleEdges = 200 } = options;

  const welded = weld(soup, options.weldTolerance);
  const before = analyze(welded.mesh);

  const cleaned = dropDegenerate(welded.mesh);
  let mesh: IndexedMesh = { positions: welded.mesh.positions, indices: cleaned.indices };

  const oriented = orient(mesh);
  mesh = { positions: mesh.positions, indices: oriented.indices };

  let filled = 0;
  let unfilled = 0;
  if (shouldFill) {
    const patched = fillHoles(mesh, maxHoleEdges);
    mesh = { positions: mesh.positions, indices: patched.indices };
    filled = patched.filled;
    unfilled = patched.unfilled;
    // Patches inherit the rim's winding, so re-check the shell once after.
    if (filled > 0) {
      const reoriented = orient(mesh);
      mesh = { positions: mesh.positions, indices: reoriented.indices };
    }
  }

  const bounds = computeBounds(mesh.positions);
  if (options.centerOnTable || options.dropToTable) {
    const positions = Float64Array.from(mesh.positions);
    translate(
      positions,
      options.centerOnTable ? -bounds.center[0] : 0,
      options.dropToTable ? -bounds.min[1] : 0,
      options.centerOnTable ? -bounds.center[2] : 0
    );
    mesh = { positions, indices: mesh.indices };
  }

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
    mesh = { positions: mesh.positions, indices: patched.indices };
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

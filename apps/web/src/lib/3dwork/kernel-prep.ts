/**
 * Getting an imported mesh ready for the solid kernel, without moving a vertex.
 *
 * STL and 3MF files are triangle soup: every corner carries its own copy of its
 * coordinates, faces sometimes appear twice, and exporters leave slivers whose
 * corners are bit-for-bit the same point. The boolean kernel (manifold-3d)
 * wants the opposite — shared vertices, every edge used by exactly two faces —
 * and refuses anything else.
 *
 * Everything here is exact. Corners are only joined when their bits match, so
 * no vertex moves and no detail is lost. The only geometry ever added is a cap
 * over an opening, and only when the caller asks for one.
 */

export interface KernelMesh {
  /** xyz for each vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle, counter-clockwise seen from outside. */
  indices: Uint32Array;
}

const NEGATIVE_ZERO = 0x80000000;

function tableSize(entries: number): number {
  let size = 16;
  while (size < entries * 2) size *= 2;
  return size;
}

/** A well-mixed 32-bit hash of three 32-bit words. */
function hash3(a: number, b: number, c: number): number {
  let h =
    Math.imul(a, 0x9e3779b1) ^
    Math.imul(b ^ 0x7f4a7c15, 0x85ebca77) ^
    Math.imul(c ^ 0x165667b1, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

export interface WeldReport {
  vertices: number;
  /** Triangles dropped because two of their corners became the same vertex. */
  degenerate: number;
}

/**
 * Join corners whose coordinates are identical to the bit, and drop the
 * triangles that collapse as a result. -0 and +0 count as the same coordinate.
 */
export function weldExact(soup: Float32Array): { mesh: KernelMesh; report: WeldReport } {
  const corners = Math.floor(soup.length / 9) * 3;
  // Hashing the raw float bits is exact and far cheaper than building strings.
  const bits = new Uint32Array(soup.buffer, soup.byteOffset, corners * 3);
  const mask = tableSize(corners) - 1;
  const slots = new Int32Array(mask + 1).fill(-1);
  const unique = new Uint32Array(corners * 3);
  const remap = new Uint32Array(corners);
  let vertices = 0;

  for (let corner = 0; corner < corners; corner++) {
    let x = bits[corner * 3];
    let y = bits[corner * 3 + 1];
    let z = bits[corner * 3 + 2];
    if (x === NEGATIVE_ZERO) x = 0;
    if (y === NEGATIVE_ZERO) y = 0;
    if (z === NEGATIVE_ZERO) z = 0;

    let slot = hash3(x, y, z) & mask;
    for (;;) {
      const found = slots[slot];
      if (found === -1) {
        slots[slot] = vertices;
        unique[vertices * 3] = x;
        unique[vertices * 3 + 1] = y;
        unique[vertices * 3 + 2] = z;
        remap[corner] = vertices++;
        break;
      }
      if (unique[found * 3] === x && unique[found * 3 + 1] === y && unique[found * 3 + 2] === z) {
        remap[corner] = found;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }

  const triangles = corners / 3;
  const indices = new Uint32Array(corners);
  let kept = 0;
  for (let t = 0; t < triangles; t++) {
    const a = remap[t * 3];
    const b = remap[t * 3 + 1];
    const c = remap[t * 3 + 2];
    if (a === b || b === c || c === a) continue;
    indices[kept * 3] = a;
    indices[kept * 3 + 1] = b;
    indices[kept * 3 + 2] = c;
    kept++;
  }

  // The words were copied verbatim, so reading them back as floats is lossless.
  const positions = new Float32Array(unique.buffer.slice(0, vertices * 12));
  return {
    mesh: { positions, indices: indices.slice(0, kept * 3) },
    report: { vertices, degenerate: triangles - kept },
  };
}

/**
 * Remove faces that appear more than once.
 *
 * Two copies facing the same way are one face drawn twice, so one is kept. A
 * face and its reverse are a zero-thickness wall — exporters leave them where
 * two shells touched — and cancel out entirely.
 */
export function dropDuplicateFaces(mesh: KernelMesh): { mesh: KernelMesh; duplicates: number } {
  const { indices } = mesh;
  const triangles = indices.length / 3;
  const mask = tableSize(triangles) - 1;
  const slots = new Int32Array(mask + 1).fill(-1);
  const keys = new Uint32Array(indices.length);
  const forward = new Int32Array(triangles);
  const backward = new Int32Array(triangles);
  const firstForward = new Int32Array(triangles);
  const firstBackward = new Int32Array(triangles);
  let faces = 0;

  for (let t = 0; t < triangles; t++) {
    let s0 = indices[t * 3];
    let s1 = indices[t * 3 + 1];
    let s2 = indices[t * 3 + 2];
    // Sort the corners, tracking whether the sort flipped the winding.
    let flipped = false;
    let swap: number;
    if (s0 > s1) {
      swap = s0;
      s0 = s1;
      s1 = swap;
      flipped = !flipped;
    }
    if (s1 > s2) {
      swap = s1;
      s1 = s2;
      s2 = swap;
      flipped = !flipped;
    }
    if (s0 > s1) {
      swap = s0;
      s0 = s1;
      s1 = swap;
      flipped = !flipped;
    }

    let slot = hash3(s0, s1, s2) & mask;
    let face: number;
    for (;;) {
      const found = slots[slot];
      if (found === -1) {
        slots[slot] = faces;
        keys[faces * 3] = s0;
        keys[faces * 3 + 1] = s1;
        keys[faces * 3 + 2] = s2;
        face = faces++;
        break;
      }
      if (keys[found * 3] === s0 && keys[found * 3 + 1] === s1 && keys[found * 3 + 2] === s2) {
        face = found;
        break;
      }
      slot = (slot + 1) & mask;
    }

    if (flipped) {
      if (backward[face]++ === 0) firstBackward[face] = t;
    } else if (forward[face]++ === 0) {
      firstForward[face] = t;
    }
  }

  if (faces === triangles) return { mesh, duplicates: 0 };

  const out = new Uint32Array(faces * 3);
  let kept = 0;
  for (let face = 0; face < faces; face++) {
    const net = forward[face] - backward[face];
    if (net === 0) continue;
    const t = net > 0 ? firstForward[face] : firstBackward[face];
    out[kept * 3] = indices[t * 3];
    out[kept * 3 + 1] = indices[t * 3 + 1];
    out[kept * 3 + 2] = indices[t * 3 + 2];
    kept++;
  }

  return {
    mesh: { positions: mesh.positions, indices: out.slice(0, kept * 3) },
    duplicates: triangles - kept,
  };
}

export interface BoundaryReport {
  /** Closed boundary loops, each listed in the direction its edges run in their faces. */
  loops: number[][];
  /** Edges with a face on one side only. */
  boundaryEdges: number;
  /** Edges shared by more than two faces, or used twice in the same direction. */
  nonManifoldEdges: number;
  /** Boundary chains that never came back to where they started. */
  openChains: number;
}

/** Find where the surface is open, as loops of vertex indices. */
export function findBoundaries(mesh: KernelMesh): BoundaryReport {
  const { indices } = mesh;
  const vertexCount = mesh.positions.length / 3;
  const triangles = indices.length / 3;
  const directed = new Map<number, number>();

  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t * 3 + k];
      const b = indices[t * 3 + ((k + 1) % 3)];
      const key = a * vertexCount + b;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  const outgoing = new Map<number, number[]>();

  for (const [key, uses] of directed) {
    const a = Math.floor(key / vertexCount);
    const b = key - a * vertexCount;
    const back = directed.get(b * vertexCount + a) ?? 0;

    // Judge each undirected edge once: from its lower end, or from its only side.
    if (a < b || back === 0) {
      if (uses + back > 2 || (back === 0 && uses > 1)) nonManifoldEdges++;
    }

    // Uses with no partner running the other way are open. Counting the
    // surplus, rather than only edges with no partner at all, keeps in- and
    // out-degree equal at every vertex — so each boundary walk below closes
    // even where several openings pinch through the same vertex.
    for (let surplus = uses - back; surplus > 0; surplus--) {
      boundaryEdges++;
      const list = outgoing.get(a);
      if (list) list.push(b);
      else outgoing.set(a, [b]);
    }
  }

  const loops: number[][] = [];
  let openChains = 0;

  for (const [start, list] of outgoing) {
    while (list.length > 0) {
      const loop = [start];
      let current = list.pop() as number;
      let closed = false;

      for (let guard = 0; guard <= boundaryEdges; guard++) {
        if (current === start) {
          closed = true;
          break;
        }
        loop.push(current);
        const onward = outgoing.get(current);
        if (!onward || onward.length === 0) break;
        current = onward.pop() as number;
      }

      if (closed && loop.length >= 3) loops.push(loop);
      else openChains++;
    }
  }

  return { loops, boundaryEdges, nonManifoldEdges, openChains };
}

/**
 * Triangulate a ring of vertices by ear clipping in its best-fit plane.
 *
 * Returns null when the ring is degenerate or folds over itself badly enough
 * that no ear can be found; the caller then falls back to a fan.
 */
function earClip(positions: Float32Array, ring: number[]): number[] | null {
  const n = ring.length;
  if (n === 3) return [ring[0], ring[1], ring[2]];

  // Newell's normal: the direction the ring winds counter-clockwise around.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i] * 3;
    const q = ring[(i + 1) % n] * 3;
    nx += (positions[p + 1] - positions[q + 1]) * (positions[p + 2] + positions[q + 2]);
    ny += (positions[p + 2] - positions[q + 2]) * (positions[p] + positions[q]);
    nz += (positions[p] - positions[q]) * (positions[p + 1] + positions[q + 1]);
  }
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-12) return null;
  nx /= length;
  ny /= length;
  nz /= length;

  // An in-plane basis (u, v) with u × v = n, so the ring stays counter-clockwise.
  const hx = Math.abs(nx) < 0.9 ? 1 : 0;
  const hy = hx === 1 ? 0 : 1;
  const along = hx * nx + hy * ny;
  let ux = hx - along * nx;
  let uy = hy - along * ny;
  let uz = -along * nz;
  const ul = Math.hypot(ux, uy, uz);
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = ring[i] * 3;
    xs[i] = positions[p] * ux + positions[p + 1] * uy + positions[p + 2] * uz;
    ys[i] = positions[p] * vx + positions[p + 1] * vy + positions[p + 2] * vz;
  }

  const cross = (a: number, b: number, c: number) =>
    (xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a]);

  const prev = new Int32Array(n);
  const next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    prev[i] = (i + n - 1) % n;
    next[i] = (i + 1) % n;
  }

  const out: number[] = [];
  let remaining = n;
  let i = 0;
  let stalled = 0;

  while (remaining > 3) {
    const a = prev[i];
    const c = next[i];
    let ear = cross(a, i, c) > 0;
    if (ear) {
      for (let j = next[c]; j !== a; j = next[j]) {
        if (cross(a, i, j) >= 0 && cross(i, c, j) >= 0 && cross(c, a, j) >= 0) {
          ear = false;
          break;
        }
      }
    }

    if (ear) {
      out.push(ring[a], ring[i], ring[c]);
      next[a] = c;
      prev[c] = a;
      remaining--;
      i = c;
      stalled = 0;
    } else {
      i = next[i];
      if (++stalled > remaining) return null;
    }
  }

  out.push(ring[prev[i]], ring[i], ring[next[i]]);
  return out;
}

/**
 * Cap boundary loops so the surface closes.
 *
 * Small loops are ear-clipped flat. A loop too long to clip cheaply — or one
 * that will not clip — is closed with a fan to its centre point, which is the
 * one place a new vertex is added.
 */
export function capLoops(
  mesh: KernelMesh,
  loops: number[][],
  options: { maxEarClip?: number } = {}
): { mesh: KernelMesh; capped: number; added: number } {
  const maxEarClip = options.maxEarClip ?? 400;
  const { positions } = mesh;
  const extraPositions: number[] = [];
  const extraIndices: number[] = [];
  let nextVertex = positions.length / 3;
  let capped = 0;

  for (const loop of loops) {
    if (loop.length < 3) continue;
    // A cap has to run every boundary edge the other way round.
    const ring = loop.slice().reverse();
    const clipped = ring.length <= maxEarClip ? earClip(positions, ring) : null;

    if (clipped) {
      for (const index of clipped) extraIndices.push(index);
    } else {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const vertex of ring) {
        cx += positions[vertex * 3];
        cy += positions[vertex * 3 + 1];
        cz += positions[vertex * 3 + 2];
      }
      extraPositions.push(cx / ring.length, cy / ring.length, cz / ring.length);
      const centre = nextVertex++;
      for (let k = 0; k < ring.length; k++) {
        extraIndices.push(ring[k], ring[(k + 1) % ring.length], centre);
      }
    }
    capped++;
  }

  if (capped === 0) return { mesh, capped: 0, added: 0 };

  const nextPositions = new Float32Array(positions.length + extraPositions.length);
  nextPositions.set(positions);
  nextPositions.set(extraPositions, positions.length);
  const nextIndices = new Uint32Array(mesh.indices.length + extraIndices.length);
  nextIndices.set(mesh.indices);
  nextIndices.set(extraIndices, mesh.indices.length);

  return {
    mesh: { positions: nextPositions, indices: nextIndices },
    capped,
    added: extraIndices.length / 3,
  };
}

/** Expand an indexed mesh back into a triangle soup. */
export function kernelToSoup(positions: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const soup = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i] * 3;
    soup[i * 3] = positions[p];
    soup[i * 3 + 1] = positions[p + 1];
    soup[i * 3 + 2] = positions[p + 2];
  }
  return soup;
}

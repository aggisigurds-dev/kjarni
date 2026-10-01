/**
 * The seam brush: level a seam by hand, a stroke at a time.
 *
 * A joined part keeps a trace of every seam — a ridge where a bridge stands
 * proud, a groove where the halves did not quite meet. The brush works on
 * those and on nothing else. Under each dab it finds where the part itself
 * stands, and then either shaves what stands above that, highest first, or
 * fills what lies below it, deepest first. Stroke again and the ceiling comes
 * down a little further, until the seam is level with its surroundings.
 *
 * What counts as seam is what is narrow. The surface under the brush is read
 * as a map of heights, and a disc well under half the width of the brush is
 * run over that map: whatever stands too narrow for the disc to sit on is a
 * ridge, and whatever is too narrow for it to drop into is a groove. Anything
 * the disc fits — a rail tooth, the slot beside it, the step between two
 * halves that did not line up — is the part, and stays as it is, corners and
 * all. So a seam can be levelled right across a step: each side comes down to
 * its own level.
 *
 * Three more things keep the brush from eating the part:
 *
 *  - The heights are taken off a gently curved sheet fitted to the surface, so
 *    a round body is read as round and not as one long ridge.
 *  - Where the surface is rough all over — a thread, a knurl, the facets of a
 *    coarse cylinder — that roughness is its texture, not a seam, and only
 *    what stands well clear of it moves.
 *  - Only what shows from above the surface moves, so the back of a thin wall
 *    and the floor of a hollow under it stay where they are.
 *
 * A joined mesh is long thin triangles wherever it is flat. A vertex can only
 * be moved if there is one, and moving one drags every triangle at it however
 * far that reaches. So where a dab finds seam to work on, the triangles that
 * show under the brush are first split, edge by edge at the midpoint, until
 * none is longer than a third of its radius. Every triangle on a split edge is
 * split with it, so a watertight part stays watertight, and a split changes no
 * shape by itself. A dab on a clean surface splits nothing.
 *
 * Pure — no three.js, no DOM — so it runs the same in the bench and in the
 * unit tests.
 */

import { DEFAULT_CREASE_DEGREES, smoothNormals } from './normals';

export type SeamBrushMode = 'shave' | 'fill';

export interface SeamBrushOptions {
  radiusMm: number;
  /** How far one dab lowers the ceiling, or raises the floor, mm. */
  stepMm: number;
  mode: SeamBrushMode;
}

export type Vec3 = [number, number, number];

/** How many points across the brush its direction is found from. */
const SAMPLES_ACROSS = 13;
/**
 * How many points across the height map is read at. It reaches past the brush
 * by the radius of the disc, so that the disc can be run right up to the rim.
 * A seam narrower than a fifteenth of the brush radius can slip between them.
 */
const MAP_ACROSS = 45;
/**
 * The disc that tells seam from part, as a share of the brush radius. Seam is
 * what is narrower than the disc is wide: under 0.8 of the radius.
 */
const DISC_PER_RADIUS = 0.4;
/**
 * A disc rounds the corners of what it fits. This far from where it fits, as a
 * share of its radius, the part is given back as it was — far enough for a
 * square corner, not far enough to follow a seam out from a wall.
 */
const CORNER_PER_DISC = 0.5;
/** Heights this close to where they belong are already level, mm — far finer than a print shows. */
const LEVEL_MM = 0.01;
/** The height fit never trusts a spread finer than this, mm: what stands 0.02 mm proud is a seam, not noise. */
const MIN_SPREAD_MM = 0.004;
/** Slopes within this of each other belong to one face: about two degrees. */
const SAME_SLOPE = 0.03;
/** The fit never trusts slopes to agree more closely than this. */
const MIN_SLOPE = 0.002;
/** The ceiling never starts higher above where it is headed than this, nor the floor deeper, mm. */
const HEADROOM_MM = 0.5;
/** Under a dab that has seam to work on, no edge is left longer than this share of the brush radius… */
const EDGE_PER_RADIUS = 1 / 3;
/** …but never finer than this, mm. */
const MIN_EDGE_MM = 0.2;
/**
 * One dab never splits more edges than this. A seam an exact join left can be
 * thousands of slivers deep; the next dab carries on where this one stopped.
 */
const MAX_SPLITS = 2500;
/** The brush's direction is taken from the triangles at no more than this many of the vertices under it. */
const NORMAL_VERTICES = 1500;
/** How many points across the clone stamp reads the surface, here and at the source. */
const CLONE_ACROSS = 33;
/** The clone stamp looks for its source this far either side of where it was named, mm. */
const CLONE_SEARCH_MM = 3;
/** A source leaning further than this against the brush is another face, not a patch of this one. */
const CLONE_MAX_SLOPE = 0.35;
/** Triangles per BVH leaf. */
const LEAF = 6;

interface Bvh {
  /** min xyz, max xyz per node. */
  boxes: Float32Array;
  /** Leaf: first slot in `order`. Inner node: index of the left child (right is +1). */
  first: Int32Array;
  /** Leaf: triangle count. Inner node: 0. */
  count: Int32Array;
  /** Triangle ids in leaf order. */
  order: Uint32Array;
  /** Parent of each node; -1 for the root. */
  parent: Int32Array;
  /** The leaf each triangle sits in, by triangle id less `base`. */
  leafOf: Uint32Array;
  base: number;
}

/** A tree over the triangles `base … base + size - 1` of a soup. */
function buildBvh(soup: Float32Array, base: number, size: number): Bvh {
  const order = new Uint32Array(size);
  const cx = new Float32Array(size);
  const cy = new Float32Array(size);
  const cz = new Float32Array(size);
  for (let k = 0; k < size; k++) {
    order[k] = base + k;
    const a = (base + k) * 9;
    cx[k] = (soup[a] + soup[a + 3] + soup[a + 6]) / 3;
    cy[k] = (soup[a + 1] + soup[a + 4] + soup[a + 7]) / 3;
    cz[k] = (soup[a + 2] + soup[a + 5] + soup[a + 8]) / 3;
  }
  const centre = [cx, cy, cz];

  let capacity = Math.max(1, 2 * Math.ceil(size / 2) + 1);
  let boxes = new Float32Array(capacity * 6);
  let first = new Int32Array(capacity);
  let count = new Int32Array(capacity);
  let parent = new Int32Array(capacity).fill(-1);
  let nodes = 0;
  const allocate = (from: number, to: number) => {
    if (nodes === capacity) {
      capacity *= 2;
      const nextBoxes = new Float32Array(capacity * 6);
      nextBoxes.set(boxes);
      boxes = nextBoxes;
      const nextFirst = new Int32Array(capacity);
      nextFirst.set(first);
      first = nextFirst;
      const nextCount = new Int32Array(capacity);
      nextCount.set(count);
      count = nextCount;
      const nextParent = new Int32Array(capacity).fill(-1);
      nextParent.set(parent);
      parent = nextParent;
    }
    const node = nodes++;
    first[node] = from;
    count[node] = to - from;
    return node;
  };

  // Explicit stack: a receiver has over a million triangles and the tree is deep.
  const stack: number[] = [allocate(0, size)];
  while (stack.length > 0) {
    const node = stack.pop() as number;
    const from = first[node];
    const to = from + count[node];

    const b = node * 6;
    boxes[b] = boxes[b + 1] = boxes[b + 2] = Infinity;
    boxes[b + 3] = boxes[b + 4] = boxes[b + 5] = -Infinity;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = from; i < to; i++) {
      const a = order[i] * 9;
      for (let k = 0; k < 9; k += 3) {
        for (let axis = 0; axis < 3; axis++) {
          const value = soup[a + k + axis];
          if (value < boxes[b + axis]) boxes[b + axis] = value;
          if (value > boxes[b + 3 + axis]) boxes[b + 3 + axis] = value;
        }
      }
      for (let axis = 0; axis < 3; axis++) {
        const c = centre[axis][order[i] - base];
        if (c < lo[axis]) lo[axis] = c;
        if (c > hi[axis]) hi[axis] = c;
      }
    }
    if (to - from <= LEAF) continue;

    // Split the longest spread of centres down the middle.
    let axis = 0;
    if (hi[1] - lo[1] > hi[axis] - lo[axis]) axis = 1;
    if (hi[2] - lo[2] > hi[axis] - lo[axis]) axis = 2;
    const middle = (lo[axis] + hi[axis]) / 2;
    const along = centre[axis];
    let i = from;
    let j = to - 1;
    while (i <= j) {
      if (along[order[i] - base] < middle) i++;
      else {
        const swap = order[i];
        order[i] = order[j];
        order[j] = swap;
        j--;
      }
    }
    // Centres all in one spot: cut the run in half instead.
    if (i === from || i === to) i = (from + to) >> 1;

    const left = allocate(from, i);
    const right = allocate(i, to);
    first[node] = left;
    count[node] = 0;
    parent[left] = node;
    parent[right] = node;
    stack.push(left, right);
  }

  const leafOf = new Uint32Array(size);
  for (let node = 0; node < nodes; node++) {
    for (let i = first[node]; i < first[node] + count[node]; i++) leafOf[order[i] - base] = node;
  }
  return {
    boxes: boxes.subarray(0, nodes * 6),
    first: first.subarray(0, nodes),
    count: count.subarray(0, nodes),
    order,
    parent: parent.subarray(0, nodes),
    leafOf,
    base,
  };
}

/** Re-measure the boxes around triangles whose corners moved, up to the root. */
function refitBvh(bvh: Bvh, soup: Float32Array, triangles: Iterable<number>): void {
  const leaves = new Set<number>();
  for (const triangle of triangles) leaves.add(bvh.leafOf[triangle - bvh.base]);
  const { boxes } = bvh;
  for (const leaf of leaves) {
    const b = leaf * 6;
    boxes[b] = boxes[b + 1] = boxes[b + 2] = Infinity;
    boxes[b + 3] = boxes[b + 4] = boxes[b + 5] = -Infinity;
    for (let i = bvh.first[leaf]; i < bvh.first[leaf] + bvh.count[leaf]; i++) {
      const a = bvh.order[i] * 9;
      for (let k = 0; k < 9; k += 3) {
        for (let axis = 0; axis < 3; axis++) {
          const value = soup[a + k + axis];
          if (value < boxes[b + axis]) boxes[b + axis] = value;
          if (value > boxes[b + 3 + axis]) boxes[b + 3 + axis] = value;
        }
      }
    }
    for (let node = bvh.parent[leaf]; node >= 0; node = bvh.parent[node]) {
      const left = bvh.first[node] * 6;
      const right = left + 6;
      const at = node * 6;
      let changed = false;
      for (let axis = 0; axis < 3; axis++) {
        const low = Math.min(boxes[left + axis], boxes[right + axis]);
        const high = Math.max(boxes[left + 3 + axis], boxes[right + 3 + axis]);
        if (low !== boxes[at + axis] || high !== boxes[at + 3 + axis]) changed = true;
        boxes[at + axis] = low;
        boxes[at + 3 + axis] = high;
      }
      // Nothing above an unchanged box changes either.
      if (!changed) break;
    }
  }
}

export interface SeamBrushMesh {
  /**
   * The working triangles, 9 floats each, with room to grow: only the first
   * `triangleCount` are in use. Dabs move corners and add triangles in place.
   */
  soup: Float32Array;
  /** Per-corner normals for `soup`, kept up to date by every dab. */
  normals: Float32Array;
  triangleCount: number;
  /** Goes up whenever `soup` and `normals` have been replaced by bigger arrays. */
  buffers: number;
  /**
   * Triangles whose corners or normals have been written since this was last
   * emptied. Whoever draws the mesh empties it as it uploads them.
   */
  dirty: Set<number>;
  /** The vertex each corner in use is at. */
  vertexOf: Uint32Array;
  /** Vertex positions, moved along with the soup. */
  positions: Float64Array;
  /** Where each vertex started: where a split put it, for one a split made. */
  origin: Float64Array;
  /** The two ends of the edge each vertex was split from; unused for the given ones. */
  splitFrom: Uint32Array;
  vertexCount: number;
  /** How many triangles and vertices the part came with. */
  givenTriangles: number;
  givenVertices: number;
  /** CSR: the corners each given vertex had to begin with. A split can take one away. */
  cornerStart: Uint32Array;
  corners: Uint32Array;
  /** Corners a split has added, by vertex. */
  addedCorners: Map<number, number[]>;
  /** Vertex grid on the starting positions of the given vertices. */
  cell: number;
  gridMin: Vec3;
  gridDims: Vec3;
  gridStart: Uint32Array;
  gridItems: Uint32Array;
  /** Over the given triangles — a split only ever shrinks one in place. */
  bvh: Bvh;
  /** Over the triangles splits have added; rebuilt when there are more. */
  addedBvh: Bvh | null;
  /** The furthest any vertex has moved from where it started, mm. */
  drift: number;
}

/**
 * Which corners of a soup are the same vertex: those at the very same point,
 * to the last bit, and no others.
 *
 * Not the bench's tolerance weld. A joined part has vertices a fraction of a
 * micron apart all along its seams, and a weld by distance pairs them up by
 * the order it meets them in — two corners at one point can end up on
 * different vertices. Moving those apart would open the part; moving exact
 * vertices never can.
 */
function sameVertices(soup: Float32Array, corners: number): { vertexOf: Uint32Array; positions: Float64Array } {
  // The bit patterns of the coordinates: equal floats, equal bits — but for the two zeros.
  const bits = new Uint32Array(soup.buffer, soup.byteOffset, corners * 3);
  const NEGATIVE_ZERO = 0x80000000;
  let size = 16;
  while (size < corners * 2) size *= 2;
  const mask = size - 1;
  // Open addressing: each slot holds a vertex, known by the first corner that was at it.
  const table = new Int32Array(size).fill(-1);
  const firstCorner = new Uint32Array(corners);
  const vertexOf = new Uint32Array(corners);
  let count = 0;
  for (let c = 0; c < corners; c++) {
    const x = bits[c * 3] === NEGATIVE_ZERO ? 0 : bits[c * 3];
    const y = bits[c * 3 + 1] === NEGATIVE_ZERO ? 0 : bits[c * 3 + 1];
    const z = bits[c * 3 + 2] === NEGATIVE_ZERO ? 0 : bits[c * 3 + 2];
    let slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      const vertex = table[slot];
      if (vertex < 0) {
        table[slot] = count;
        firstCorner[count] = c;
        vertexOf[c] = count++;
        break;
      }
      const o = firstCorner[vertex] * 3;
      if (
        (bits[o] === NEGATIVE_ZERO ? 0 : bits[o]) === x &&
        (bits[o + 1] === NEGATIVE_ZERO ? 0 : bits[o + 1]) === y &&
        (bits[o + 2] === NEGATIVE_ZERO ? 0 : bits[o + 2]) === z
      ) {
        vertexOf[c] = vertex;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }
  const positions = new Float64Array(count * 3);
  for (let vertex = 0; vertex < count; vertex++) {
    const o = firstCorner[vertex] * 3;
    positions[vertex * 3] = soup[o];
    positions[vertex * 3 + 1] = soup[o + 1];
    positions[vertex * 3 + 2] = soup[o + 2];
  }
  return { vertexOf, positions };
}

export function createSeamBrushMesh(given: Float32Array): SeamBrushMesh {
  const triangles = Math.floor(given.length / 9);
  const welded = sameVertices(given, triangles * 3);
  const vertices = welded.positions.length / 3;
  // Room for a good deal of splitting before the arrays have to be replaced.
  const roomTriangles = Math.ceil(triangles * 1.25) + 4096;
  const roomVertices = Math.ceil(vertices * 1.25) + 2048;

  const soup = new Float32Array(roomTriangles * 9);
  soup.set(given.subarray(0, triangles * 9));
  const normals = new Float32Array(roomTriangles * 9);
  normals.set(smoothNormals(given).subarray(0, triangles * 9));
  const vertexOf = new Uint32Array(roomTriangles * 3);
  vertexOf.set(welded.vertexOf);
  const positions = new Float64Array(roomVertices * 3);
  positions.set(welded.positions);
  const origin = new Float64Array(roomVertices * 3);
  origin.set(welded.positions);

  const cornerCount = triangles * 3;
  const cornerStart = new Uint32Array(vertices + 1);
  for (let c = 0; c < cornerCount; c++) cornerStart[vertexOf[c] + 1]++;
  for (let v = 0; v < vertices; v++) cornerStart[v + 1] += cornerStart[v];
  const cursor = cornerStart.slice(0, vertices);
  const corners = new Uint32Array(cornerCount);
  for (let c = 0; c < cornerCount; c++) corners[cursor[vertexOf[c]]++] = c;

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertices; v++) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[v * 3 + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  if (vertices === 0) min[0] = min[1] = min[2] = max[0] = max[1] = max[2] = 0;

  // Cells no finer than a millimetre, and no more than a few million of them.
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1);
  const cell = Math.max(1, span / 160);
  const gridDims: Vec3 = [
    Math.floor((max[0] - min[0]) / cell) + 1,
    Math.floor((max[1] - min[1]) / cell) + 1,
    Math.floor((max[2] - min[2]) / cell) + 1,
  ];
  const cells = gridDims[0] * gridDims[1] * gridDims[2];
  const cellOf = new Uint32Array(vertices);
  const gridStart = new Uint32Array(cells + 1);
  for (let v = 0; v < vertices; v++) {
    const gx = Math.floor((positions[v * 3] - min[0]) / cell);
    const gy = Math.floor((positions[v * 3 + 1] - min[1]) / cell);
    const gz = Math.floor((positions[v * 3 + 2] - min[2]) / cell);
    const key = gx + gridDims[0] * (gy + gridDims[1] * gz);
    cellOf[v] = key;
    gridStart[key + 1]++;
  }
  for (let k = 0; k < cells; k++) gridStart[k + 1] += gridStart[k];
  const fill = gridStart.slice(0, cells);
  const gridItems = new Uint32Array(vertices);
  for (let v = 0; v < vertices; v++) gridItems[fill[cellOf[v]]++] = v;

  return {
    soup,
    normals,
    triangleCount: triangles,
    buffers: 0,
    dirty: new Set(),
    vertexOf,
    positions,
    origin,
    splitFrom: new Uint32Array(roomVertices * 2),
    vertexCount: vertices,
    givenTriangles: triangles,
    givenVertices: vertices,
    cornerStart,
    corners,
    addedCorners: new Map(),
    cell,
    gridMin: min,
    gridDims,
    gridStart,
    gridItems,
    bvh: buildBvh(soup, 0, triangles),
    addedBvh: null,
    drift: 0,
  };
}

/** The triangles as they stand, without the room to grow. */
export function seamBrushSoup(mesh: SeamBrushMesh): Float32Array {
  return mesh.soup.slice(0, mesh.triangleCount * 9);
}

/** The corners that are at a vertex now. */
function cornersAt(mesh: SeamBrushMesh, vertex: number, into: number[]): number[] {
  into.length = 0;
  if (vertex < mesh.givenVertices) {
    for (let i = mesh.cornerStart[vertex]; i < mesh.cornerStart[vertex + 1]; i++) {
      const corner = mesh.corners[i];
      // A split may have handed this corner to the vertex it made.
      if (mesh.vertexOf[corner] === vertex) into.push(corner);
    }
  }
  const added = mesh.addedCorners.get(vertex);
  if (added) {
    for (const corner of added) if (mesh.vertexOf[corner] === vertex) into.push(corner);
  }
  return into;
}

/** Vertices within `radius` of a point, by where they are now. */
function verticesNear(mesh: SeamBrushMesh, point: Vec3, radius: number): number[] {
  // The grid holds starting positions, so reach out by however far vertices have moved.
  const reach = radius + mesh.drift;
  const { cell, gridMin, gridDims, positions } = mesh;
  const from: number[] = [];
  const to: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    from.push(Math.max(0, Math.floor((point[axis] - reach - gridMin[axis]) / cell)));
    to.push(Math.min(gridDims[axis] - 1, Math.floor((point[axis] + reach - gridMin[axis]) / cell)));
  }
  const found: number[] = [];
  const r2 = radius * radius;
  const within = (v: number) => {
    const dx = positions[v * 3] - point[0];
    const dy = positions[v * 3 + 1] - point[1];
    const dz = positions[v * 3 + 2] - point[2];
    return dx * dx + dy * dy + dz * dz <= r2;
  };
  for (let gz = from[2]; gz <= to[2]; gz++) {
    for (let gy = from[1]; gy <= to[1]; gy++) {
      for (let gx = from[0]; gx <= to[0]; gx++) {
        const key = gx + gridDims[0] * (gy + gridDims[1] * gz);
        for (let i = mesh.gridStart[key]; i < mesh.gridStart[key + 1]; i++) {
          if (within(mesh.gridItems[i])) found.push(mesh.gridItems[i]);
        }
      }
    }
  }
  // Vertices made by splits are not in the grid; there are few enough to look through.
  for (let v = mesh.givenVertices; v < mesh.vertexCount; v++) if (within(v)) found.push(v);
  return found;
}

interface RayHit {
  t: number;
  triangle: number;
}

/** Nodes waiting to be opened by a ray, with how far along it each is entered. Rays are cast one at a time. */
const RAY_STACK_NODES = new Int32Array(1024);
const RAY_STACK_ENTRY = new Float64Array(1024);

function castInto(
  bvh: Bvh,
  soup: Float32Array,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  best: RayHit
): void {
  if (bvh.order.length === 0) return;
  const pad = 1e-4;
  const ix = 1 / (dx === 0 ? 1e-30 : dx);
  const iy = 1 / (dy === 0 ? 1e-30 : dy);
  const iz = 1 / (dz === 0 ? 1e-30 : dz);
  const { boxes, first, count } = bvh;
  const nodes = RAY_STACK_NODES;
  const entries = RAY_STACK_ENTRY;
  // The nearer child is opened first, so that a hit there rules the farther
  // one out before it is opened. The root goes in unmeasured.
  let top = 0;
  nodes[0] = 0;
  entries[0] = 0;
  top = 1;

  while (top > 0) {
    top--;
    const node = nodes[top];
    if (entries[top] > best.t) continue;

    const size = count[node];
    if (size === 0) {
      // Where the ray enters each child's box, or Infinity if it misses it.
      const left = first[node];
      let b = left * 6;
      let t0 = (boxes[b] - pad - ox) * ix;
      let t1 = (boxes[b + 3] + pad - ox) * ix;
      let near = t0 < t1 ? t0 : t1;
      let far = t0 < t1 ? t1 : t0;
      t0 = (boxes[b + 1] - pad - oy) * iy;
      t1 = (boxes[b + 4] + pad - oy) * iy;
      if (t0 < t1) {
        if (t0 > near) near = t0;
        if (t1 < far) far = t1;
      } else {
        if (t1 > near) near = t1;
        if (t0 < far) far = t0;
      }
      t0 = (boxes[b + 2] - pad - oz) * iz;
      t1 = (boxes[b + 5] + pad - oz) * iz;
      if (t0 < t1) {
        if (t0 > near) near = t0;
        if (t1 < far) far = t1;
      } else {
        if (t1 > near) near = t1;
        if (t0 < far) far = t0;
      }
      const nearLeft = far < (near > 0 ? near : 0) || near > best.t ? Infinity : near;

      b += 6;
      t0 = (boxes[b] - pad - ox) * ix;
      t1 = (boxes[b + 3] + pad - ox) * ix;
      near = t0 < t1 ? t0 : t1;
      far = t0 < t1 ? t1 : t0;
      t0 = (boxes[b + 1] - pad - oy) * iy;
      t1 = (boxes[b + 4] + pad - oy) * iy;
      if (t0 < t1) {
        if (t0 > near) near = t0;
        if (t1 < far) far = t1;
      } else {
        if (t1 > near) near = t1;
        if (t0 < far) far = t0;
      }
      t0 = (boxes[b + 2] - pad - oz) * iz;
      t1 = (boxes[b + 5] + pad - oz) * iz;
      if (t0 < t1) {
        if (t0 > near) near = t0;
        if (t1 < far) far = t1;
      } else {
        if (t1 > near) near = t1;
        if (t0 < far) far = t0;
      }
      const nearRight = far < (near > 0 ? near : 0) || near > best.t ? Infinity : near;

      // A tree this deep would be a broken one; drop the far side rather than overrun.
      if (top + 2 > nodes.length) continue;
      if (nearLeft <= nearRight) {
        if (nearRight !== Infinity) {
          nodes[top] = left + 1;
          entries[top++] = nearRight;
        }
        if (nearLeft !== Infinity) {
          nodes[top] = left;
          entries[top++] = nearLeft;
        }
      } else {
        if (nearLeft !== Infinity) {
          nodes[top] = left;
          entries[top++] = nearLeft;
        }
        nodes[top] = left + 1;
        entries[top++] = nearRight;
      }
      continue;
    }
    for (let i = first[node]; i < first[node] + size; i++) {
      const triangle = bvh.order[i];
      const a = triangle * 9;
      const e1x = soup[a + 3] - soup[a];
      const e1y = soup[a + 4] - soup[a + 1];
      const e1z = soup[a + 5] - soup[a + 2];
      const e2x = soup[a + 6] - soup[a];
      const e2y = soup[a + 7] - soup[a + 1];
      const e2z = soup[a + 8] - soup[a + 2];
      // Möller–Trumbore. A ray running along a face (a slit's wall) does not count.
      const hx = dy * e2z - dz * e2y;
      const hy = dz * e2x - dx * e2z;
      const hz = dx * e2y - dy * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      const scale =
        (Math.abs(e1x) + Math.abs(e1y) + Math.abs(e1z)) * (Math.abs(e2x) + Math.abs(e2y) + Math.abs(e2z));
      if (Math.abs(det) < 1e-7 * scale) continue;
      const inverse = 1 / det;
      const sx = ox - soup[a];
      const sy = oy - soup[a + 1];
      const sz = oz - soup[a + 2];
      const u = (sx * hx + sy * hy + sz * hz) * inverse;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inverse;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inverse;
      if (t > 1e-6 && t < best.t) {
        best.t = t;
        best.triangle = triangle;
      }
    }
  }
}

/** Nearest triangle a ray meets within `maxT`. */
function castRay(
  mesh: SeamBrushMesh,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number
): RayHit | null {
  const best: RayHit = { t: maxT, triangle: -1 };
  castInto(mesh.bvh, mesh.soup, ox, oy, oz, dx, dy, dz, best);
  if (mesh.addedBvh) castInto(mesh.addedBvh, mesh.soup, ox, oy, oz, dx, dy, dz, best);
  return best.triangle < 0 ? null : best;
}

/** Every triangle whose box comes within `radius` of a point. */
function trianglesNear(mesh: SeamBrushMesh, point: Vec3, radius: number): number[] {
  const found: number[] = [];
  for (const bvh of [mesh.bvh, mesh.addedBvh]) {
    if (!bvh || bvh.order.length === 0) continue;
    const stack: number[] = [0];
    while (stack.length > 0) {
      const node = stack.pop() as number;
      const b = node * 6;
      let d2 = 0;
      for (let axis = 0; axis < 3; axis++) {
        const gap = Math.max(bvh.boxes[b + axis] - point[axis], point[axis] - bvh.boxes[b + 3 + axis], 0);
        d2 += gap * gap;
      }
      if (d2 > radius * radius) continue;
      const size = bvh.count[node];
      if (size === 0) stack.push(bvh.first[node], bvh.first[node] + 1);
      else for (let i = bvh.first[node]; i < bvh.first[node] + size; i++) found.push(bvh.order[i]);
    }
  }
  return found;
}

/** Squared distance from a point to a triangle of the soup. */
function distanceToTriangle2(soup: Float32Array, triangle: number, p: Vec3): number {
  const at = triangle * 9;
  const ax = soup[at];
  const ay = soup[at + 1];
  const az = soup[at + 2];
  const abx = soup[at + 3] - ax;
  const aby = soup[at + 4] - ay;
  const abz = soup[at + 5] - az;
  const acx = soup[at + 6] - ax;
  const acy = soup[at + 7] - ay;
  const acz = soup[at + 8] - az;
  const apx = p[0] - ax;
  const apy = p[1] - ay;
  const apz = p[2] - az;
  // Ericson, Real-Time Collision Detection: the closest point by Voronoi region,
  // as `a + s·ab + t·ac`.
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let s = 0;
  let t = 0;
  if (!(d1 <= 0 && d2 <= 0)) {
    const d3 = d1 - (abx * abx + aby * aby + abz * abz);
    const d4 = d2 - (acx * abx + acy * aby + acz * abz);
    const d5 = d1 - (abx * acx + aby * acy + abz * acz);
    const d6 = d2 - (acx * acx + acy * acy + acz * acz);
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      s = 1;
    } else if (d6 >= 0 && d5 <= d6) {
      t = 1;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      s = d1 / (d1 - d3);
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      t = d2 / (d2 - d6);
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      t = (d4 - d3) / (d4 - d3 + (d5 - d6));
      s = 1 - t;
    } else {
      const sum = va + vb + vc;
      s = sum === 0 ? 0 : vb / sum;
      t = sum === 0 ? 0 : vc / sum;
    }
  }
  const dx = apx - s * abx - t * acx;
  const dy = apy - s * aby - t * acy;
  const dz = apz - s * abz - t * acz;
  return dx * dx + dy * dy + dz * dz;
}

/** Make room for more triangles and vertices, replacing the arrays if they are full. */
function ensureRoom(mesh: SeamBrushMesh, moreTriangles: number, moreVertices: number): void {
  const needTriangles = mesh.triangleCount + moreTriangles;
  if (needTriangles * 9 > mesh.soup.length) {
    const room = Math.ceil(needTriangles * 1.5) + 4096;
    const soup = new Float32Array(room * 9);
    soup.set(mesh.soup.subarray(0, mesh.triangleCount * 9));
    mesh.soup = soup;
    const normals = new Float32Array(room * 9);
    normals.set(mesh.normals.subarray(0, mesh.triangleCount * 9));
    mesh.normals = normals;
    const vertexOf = new Uint32Array(room * 3);
    vertexOf.set(mesh.vertexOf.subarray(0, mesh.triangleCount * 3));
    mesh.vertexOf = vertexOf;
    mesh.buffers++;
  }
  const needVertices = mesh.vertexCount + moreVertices;
  if (needVertices * 3 > mesh.positions.length) {
    const room = Math.ceil(needVertices * 1.5) + 2048;
    const positions = new Float64Array(room * 3);
    positions.set(mesh.positions.subarray(0, mesh.vertexCount * 3));
    mesh.positions = positions;
    const origin = new Float64Array(room * 3);
    origin.set(mesh.origin.subarray(0, mesh.vertexCount * 3));
    mesh.origin = origin;
    const splitFrom = new Uint32Array(room * 2);
    splitFrom.set(mesh.splitFrom.subarray(0, mesh.vertexCount * 2));
    mesh.splitFrom = splitFrom;
  }
}

/** The longest edge of a triangle: which corner it starts at, and its length squared. */
function longestEdge(soup: Float32Array, triangle: number): { edge: number; length2: number } {
  let length2 = 0;
  let edge = 0;
  for (let k = 0; k < 3; k++) {
    const p = (triangle * 3 + k) * 3;
    const q = (triangle * 3 + ((k + 1) % 3)) * 3;
    const d2 = (soup[p] - soup[q]) ** 2 + (soup[p + 1] - soup[q + 1]) ** 2 + (soup[p + 2] - soup[q + 2]) ** 2;
    if (d2 > length2) {
      length2 = d2;
      edge = k;
    }
  }
  return { edge, length2 };
}

/** Every triangle that has the edge a–b, whichever way round. */
function sharingEdge(mesh: SeamBrushMesh, a: number, b: number, scratch: number[]): number[] {
  const sharing: number[] = [];
  for (const corner of cornersAt(mesh, a, scratch)) {
    const other = Math.floor(corner / 3);
    const base = other * 3;
    if (mesh.vertexOf[base] === b || mesh.vertexOf[base + 1] === b || mesh.vertexOf[base + 2] === b) {
      if (!sharing.includes(other)) sharing.push(other);
    }
  }
  return sharing;
}

/**
 * Split one edge at its midpoint in every triangle that has it, so nothing
 * opens up. Each of those triangles keeps one half in place and a new triangle
 * takes the other. Returns the triangles there are now along the edge, in
 * pairs: what is left of each, then the new one beside it.
 */
function splitEdge(mesh: SeamBrushMesh, a: number, b: number, sharing: number[], touched: Set<number>): number[] {
  ensureRoom(mesh, sharing.length, 1);
  const m = mesh.vertexCount++;
  const middle: Vec3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    middle[axis] = (mesh.positions[a * 3 + axis] + mesh.positions[b * 3 + axis]) / 2;
    mesh.positions[m * 3 + axis] = middle[axis];
    // Where it would have been had neither end ever moved.
    mesh.origin[m * 3 + axis] = (mesh.origin[a * 3 + axis] + mesh.origin[b * 3 + axis]) / 2;
  }
  mesh.splitFrom[m * 2] = a;
  mesh.splitFrom[m * 2 + 1] = b;
  const cornersOfM: number[] = [];
  mesh.addedCorners.set(m, cornersOfM);

  const pieces: number[] = [];
  for (const old of sharing) {
    // The old triangle keeps `a` and takes the midpoint in place of `b`; a new
    // one takes the midpoint in place of `a`. Both keep the winding.
    const fresh = mesh.triangleCount++;
    for (let k = 0; k < 3; k++) {
      const from = old * 3 + k;
      const to = fresh * 3 + k;
      const vertex = mesh.vertexOf[from];
      const moved = vertex === a;
      mesh.vertexOf[to] = moved ? m : vertex;
      for (let axis = 0; axis < 3; axis++) {
        mesh.soup[to * 3 + axis] = moved ? middle[axis] : mesh.soup[from * 3 + axis];
        mesh.normals[to * 3 + axis] = mesh.normals[from * 3 + axis];
      }
      if (moved) cornersOfM.push(to);
      else {
        const list = mesh.addedCorners.get(vertex);
        if (list) list.push(to);
        else mesh.addedCorners.set(vertex, [to]);
      }
    }
    for (let k = 0; k < 3; k++) {
      const corner = old * 3 + k;
      if (mesh.vertexOf[corner] !== b) continue;
      mesh.vertexOf[corner] = m;
      for (let axis = 0; axis < 3; axis++) mesh.soup[corner * 3 + axis] = middle[axis];
      cornersOfM.push(corner);
    }
    for (let k = 0; k < 3; k++) {
      touched.add(mesh.vertexOf[old * 3 + k]);
      touched.add(mesh.vertexOf[fresh * 3 + k]);
    }
    mesh.dirty.add(old);
    mesh.dirty.add(fresh);
    pieces.push(old, fresh);
  }
  return pieces;
}

/**
 * Split the triangles under the brush — within `radius` of the stretch of its
 * axis from `low` to `high` — until none has an edge longer than `maxEdge`, so
 * that whatever of the surface lies under the brush has vertices of its own to
 * be shaped by. Adds the vertices whose shading may have changed to `touched`
 * and the triangles the part came with that it made smaller to `shrunk`, and
 * returns how many edges it split.
 *
 * Only what shows from above is split: the triangles in `seen` — those the
 * height map landed on, and the pieces they are split into — and any other
 * that `showing` vouches for. A joined part is full of faces folded away just
 * under its surface, and splitting those would only make it heavier.
 *
 * A triangle is always split across its longest edge, and only once that is
 * also the longest edge of the triangle on the other side — if it is not, that
 * one is split first (Rivara's longest-edge refinement). Splitting a neighbour
 * across whatever edge happened to be shared instead cuts it into slivers, and
 * those into more slivers: twenty times the triangles for the same fineness.
 * What this leaves is fine under the brush and grows coarser away from it.
 */
function refineUnder(
  mesh: SeamBrushMesh,
  low: Vec3,
  high: Vec3,
  radius: number,
  maxEdge: number,
  seen: Set<number>,
  showing: (triangle: number) => boolean,
  touched: Set<number>,
  shrunk: Set<number>
): number {
  const limit2 = maxEdge * maxEdge;
  const radius2 = radius * radius;
  const middle: Vec3 = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
  const reach = radius + Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]) / 2;
  const under = (triangle: number) =>
    distanceToTriangle2(mesh.soup, triangle, middle) <= radius2 ||
    distanceToTriangle2(mesh.soup, triangle, low) <= radius2 ||
    distanceToTriangle2(mesh.soup, triangle, high) <= radius2;
  const work = trianglesNear(mesh, middle, reach);
  const scratch: number[] = [];
  let splits = 0;

  while (work.length > 0 && splits < MAX_SPLITS) {
    const wanted = work.pop() as number;
    if (longestEdge(mesh.soup, wanted).length2 <= limit2 || !under(wanted)) continue;
    if (!seen.has(wanted) && !showing(wanted)) continue;

    // Follow longest edges outward until one is the longest on both sides.
    const path: number[] = [wanted];
    while (path.length > 0 && splits < MAX_SPLITS) {
      const triangle = path[path.length - 1];
      const { edge, length2 } = longestEdge(mesh.soup, triangle);
      const a = mesh.vertexOf[triangle * 3 + edge];
      const b = mesh.vertexOf[triangle * 3 + ((edge + 1) % 3)];
      if (a === b) {
        path.pop();
        continue;
      }
      const sharing = sharingEdge(mesh, a, b, scratch);
      const longer =
        path.length < 64
          ? sharing.find((other) => other !== triangle && longestEdge(mesh.soup, other).length2 > length2 * (1 + 1e-9))
          : undefined;
      if (longer !== undefined) {
        path.push(longer);
        continue;
      }
      // The pieces come in pairs: what is left of each triangle, then the new one beside it.
      const pieces = splitEdge(mesh, a, b, sharing, touched);
      for (let k = 0; k < pieces.length; k += 2) {
        work.push(pieces[k], pieces[k + 1]);
        if (pieces[k] < mesh.givenTriangles) shrunk.add(pieces[k]);
        if (seen.has(pieces[k])) seen.add(pieces[k + 1]);
      }
      splits++;
      path.pop();
    }
  }
  return splits;
}

function faceNormal(soup: Float32Array, triangle: number): Vec3 {
  const a = triangle * 9;
  const ux = soup[a + 3] - soup[a];
  const uy = soup[a + 4] - soup[a + 1];
  const uz = soup[a + 5] - soup[a + 2];
  const vx = soup[a + 6] - soup[a];
  const vy = soup[a + 7] - soup[a + 1];
  const vz = soup[a + 8] - soup[a + 2];
  // Twice the area along the normal — callers that want a unit normal divide.
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function normalize(v: Vec3): Vec3 | null {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-12 ? [v[0] / length, v[1] / length, v[2] / length] : null;
}

/**
 * Which way the surface under the brush faces: the area-weighted normal of the
 * triangles around the point, leaving out those turned away from `hint`. Big
 * clean faces outweigh the small ones a seam is made of.
 */
function brushNormal(mesh: SeamBrushMesh, vertices: number[], hint: Vec3): Vec3 {
  let facing = hint;
  const scratch: number[] = [];
  // A seam can crowd tens of thousands of vertices under the brush; a spread of them says as much.
  const stride = Math.max(1, Math.ceil(vertices.length / NORMAL_VERTICES));
  for (let pass = 0; pass < 2; pass++) {
    // The second time round only what faces much the same way as the first
    // answer counts: a wall beside the brush can lean the first, not the second.
    const limit = pass === 0 ? 0 : 0.7;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    const seen = new Set<number>();
    for (let k = 0; k < vertices.length; k += stride) {
      for (const corner of cornersAt(mesh, vertices[k], scratch)) {
        const triangle = Math.floor(corner / 3);
        if (seen.has(triangle)) continue;
        seen.add(triangle);
        const n = faceNormal(mesh.soup, triangle);
        const length = Math.hypot(n[0], n[1], n[2]);
        if (length === 0) continue;
        if ((n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2]) / length <= limit) continue;
        sx += n[0];
        sy += n[1];
        sz += n[2];
      }
    }
    const next = normalize([sx, sy, sz]);
    if (!next) break;
    facing = next;
  }
  // The flank of a ridge can face well away from the surface it stands on, but
  // the face under the pointer is never turned right away from the brush: if
  // the triangles around it are, they are another face — a wall beside a thin
  // edge — and the brush works on the one it was put down on.
  return facing[0] * hint[0] + facing[1] * hint[1] + facing[2] * hint[2] > 0.4 ? facing : hint;
}

/** Two unit vectors square to `n` and to each other. */
function tangents(n: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize([
    helper[1] * n[2] - helper[2] * n[1],
    helper[2] * n[0] - helper[0] * n[2],
    helper[0] * n[1] - helper[1] * n[0],
  ]) as Vec3;
  const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

/** Solve a small dense system in place; false when it has no single answer. */
function solve(matrix: number[][], rhs: number[]): boolean {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) return false;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = matrix[row][col] / matrix[col][col];
      if (factor === 0) continue;
      for (let k = col; k < n; k++) matrix[row][k] -= factor * matrix[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let k = row + 1; k < n; k++) sum -= matrix[row][k] * rhs[k];
    rhs[row] = sum / matrix[row][row];
  }
  return true;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

interface Sheet {
  /** Height of the sheet over a point of the brush plane, from its height at the middle. */
  height: (x: number, y: number) => number;
  /** Slope of the sheet at the middle of the brush, along each tangent. */
  slope: [number, number];
}

/**
 * Fit the lie of the surface under the brush — which way it tilts and how it
 * curves — as a gently curved sheet.
 *
 * It is fitted to the slopes between neighbouring points of a height map, not
 * to the heights. Two halves standing at different levels slope the same way,
 * and the step between them is a few steep slopes among many that agree, so a
 * step does not tip the sheet the way it would tip one fitted to heights. Nor
 * does a seam: its flanks are steep, and few.
 *
 * Where two faces meet at an edge there are two slopes to choose from, and the
 * sheet takes the one most of the map has rather than something in between —
 * seen from between the two, an edge would look like a ridge.
 */
function fitSheet(map: Float32Array, across: number, half: number): Sheet | null {
  const pitch = (2 * half) / (across - 1);
  // The slope along each tangent at every point that has both neighbours.
  const room = (across - 1) * (across - 1);
  const px = new Float64Array(room);
  const py = new Float64Array(room);
  const gx = new Float64Array(room);
  const gy = new Float64Array(room);
  let n = 0;
  for (let i = 0; i + 1 < across; i++) {
    for (let j = 0; j + 1 < across; j++) {
      const h = map[i * across + j];
      const alongX = map[(i + 1) * across + j];
      const alongY = map[i * across + j + 1];
      if (!Number.isFinite(h) || !Number.isFinite(alongX) || !Number.isFinite(alongY)) continue;
      px[n] = -half + (i + 0.5) * pitch;
      py[n] = -half + (j + 0.5) * pitch;
      gx[n] = (alongX - h) / pitch;
      gy[n] = (alongY - h) / pitch;
      n++;
    }
  }
  if (n < 8) return null;

  // Start from the slope most points share: try a spread of them, keep the one with the most company.
  let a = 0;
  let b = 0;
  let company = -1;
  const stride = Math.max(1, Math.floor(n / 64));
  for (let k = 0; k < n; k += stride) {
    const kx = gx[k];
    const ky = gy[k];
    let votes = 0;
    for (let m = 0; m < n; m++) {
      if (Math.abs(gx[m] - kx) < SAME_SLOPE && Math.abs(gy[m] - ky) < SAME_SLOPE) votes++;
    }
    if (votes > company) {
      company = votes;
      a = kx;
      b = ky;
    }
  }

  // Then let it curve: the slope along x is a + c·x + d·y, along y it is
  // b + d·x + e·y. Points that do not agree lose their say, and the measure of
  // agreement is taken from the closest three in ten — so that it holds with
  // most of the map on the other side of an edge, or on other facets.
  let c = 0;
  let d = 0;
  let e = 0;
  const off = new Float64Array(n);
  let agreeing = 0;
  for (let pass = 0; pass < 6; pass++) {
    for (let m = 0; m < n; m++) {
      off[m] = Math.hypot(gx[m] - (a + c * px[m] + d * py[m]), gy[m] - (b + d * px[m] + e * py[m]));
    }
    const cut = 4.685 * Math.max(MIN_SLOPE, off.slice().sort()[Math.floor(0.3 * (n - 1))] / 0.5);
    // Least squares over both slopes at once, weighted; the sums are all it takes.
    let s1 = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    const rhs = [0, 0, 0, 0, 0];
    agreeing = 0;
    for (let m = 0; m < n; m++) {
      const r = off[m] / cut;
      if (r >= 1) continue;
      const weight = (1 - r * r) ** 2;
      if (weight > 0.5) agreeing++;
      const x = px[m];
      const y = py[m];
      s1 += weight;
      sx += weight * x;
      sy += weight * y;
      sxx += weight * x * x;
      sxy += weight * x * y;
      syy += weight * y * y;
      rhs[0] += weight * gx[m];
      rhs[1] += weight * gy[m];
      rhs[2] += weight * x * gx[m];
      rhs[3] += weight * (y * gx[m] + x * gy[m]);
      rhs[4] += weight * y * gy[m];
    }
    // A touch of damping on the curved terms so a thin strip of points cannot bend the sheet.
    const damp = 1e-9 * s1 * half * half;
    const matrix = [
      [s1, 0, sx, sy, 0],
      [0, s1, 0, sx, sy],
      [sx, 0, sxx + damp, sxy, 0],
      [sy, sx, sxy, sxx + syy + damp, sxy],
      [0, sy, 0, sxy, syy + damp],
    ];
    if (!solve(matrix, rhs)) break;
    const settled =
      Math.abs(rhs[0] - a) + Math.abs(rhs[1] - b) < 1e-7 &&
      (Math.abs(rhs[2] - c) + Math.abs(rhs[3] - d) + Math.abs(rhs[4] - e)) * half < 1e-7;
    [a, b, c, d, e] = rhs;
    if (settled) break;
  }
  if (agreeing < 4) return null;

  return {
    height: (x, y) => a * x + b * y + (c * x * x) / 2 + d * x * y + (e * y * y) / 2,
    slope: [a, b],
  };
}

/**
 * The average lie of a height map: a gently curved sheet through its heights,
 * with what stands well off the rest — a seam — given no say. Unlike
 * `fitSheet` it keeps to the middle of a texture rather than to one facet of
 * it: fitted to ripples it lies flat through them.
 */
function fitLie(map: Float32Array, across: number, half: number): Sheet | null {
  const pitch = (2 * half) / (across - 1);
  const xs: number[] = [];
  const ys: number[] = [];
  const hs: number[] = [];
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < across; j++) {
      const h = map[i * across + j];
      if (!Number.isFinite(h)) continue;
      xs.push(-half + i * pitch);
      ys.push(-half + j * pitch);
      hs.push(h);
    }
  }
  const n = hs.length;
  if (n < 6) return null;
  const terms = n >= 24 ? 6 : 3;
  const basis = (x: number, y: number): number[] => (terms === 6 ? [1, x, y, x * x, x * y, y * y] : [1, x, y]);
  let coefficients: number[] = Array.from({ length: terms }, (_, k) => (k === 0 ? median(hs) : 0));
  const height = (x: number, y: number) => {
    const b = basis(x, y);
    let sum = 0;
    for (let k = 0; k < terms; k++) sum += coefficients[k] * b[k];
    return sum;
  };
  for (let pass = 0; pass < 6; pass++) {
    const residuals = hs.map((h, k) => h - height(xs[k], ys[k]));
    const cut = 4.685 * Math.max(MIN_SPREAD_MM, 1.4826 * median(residuals.map(Math.abs)));
    const matrix = Array.from({ length: terms }, () => Array.from({ length: terms }, () => 0));
    const rhs: number[] = Array.from({ length: terms }, () => 0);
    for (let k = 0; k < n; k++) {
      const r = residuals[k] / cut;
      if (Math.abs(r) >= 1) continue;
      const weight = (1 - r * r) ** 2;
      const b = basis(xs[k], ys[k]);
      for (let row = 0; row < terms; row++) {
        rhs[row] += weight * b[row] * hs[k];
        for (let col = 0; col < terms; col++) matrix[row][col] += weight * b[row] * b[col];
      }
    }
    // A touch of damping on the curved terms so a thin strip of points cannot bend the sheet.
    for (let k = 3; k < terms; k++) matrix[k][k] += 1e-6 * half ** 4;
    if (!solve(matrix, rhs)) break;
    coefficients = rhs;
  }
  // Heights from the middle of the brush, like the sheet `fitSheet` gives.
  const middle = height(0, 0);
  return { height: (x, y) => height(x, y) - middle, slope: [coefficients[1], coefficients[2]] };
}

/** The cells of a square grid that a disc `cells` in radius covers, as offsets from its middle. */
function discOffsets(cells: number): number[] {
  const offsets: number[] = [];
  const reach = Math.floor(cells);
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      if (i * i + j * j <= cells * cells) offsets.push(i, j);
    }
  }
  return offsets;
}

/** The cell and its eight neighbours. */
const NEIGHBOURS = discOffsets(1.5);

/**
 * For every cell of a square map, the highest — or the lowest — value under a
 * disc centred on it. Cells off the edge of the map have no say.
 */
function sweep(map: Float32Array, across: number, offsets: number[], highest: boolean): Float32Array {
  const out = new Float32Array(map.length);
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < across; j++) {
      let best = highest ? -Infinity : Infinity;
      for (let k = 0; k < offsets.length; k += 2) {
        const ii = i + offsets[k];
        const jj = j + offsets[k + 1];
        if (ii < 0 || jj < 0 || ii >= across || jj >= across) continue;
        const value = map[ii * across + jj];
        if (highest ? value > best : value < best) best = value;
      }
      out[i * across + j] = best;
    }
  }
  return out;
}

/**
 * The height map with everything narrow taken off it — the ridges when
 * `ridges` is set, the grooves otherwise: what is left when a disc is slid
 * over the map from below (or from above) and only what it can reach is kept.
 * A ridge too narrow for the disc to sit under is gone; a plateau or a step is
 * still there.
 *
 * A disc rounds the corners of what it does fit, so the map is then given back
 * `corner` cells out from where the disc fitted: a square corner comes back
 * whole, and a seam running out from a wall comes back only that far.
 */
function withoutNarrow(
  map: Float32Array,
  across: number,
  disc: number[],
  corner: number,
  ridges: boolean
): Float32Array {
  const kept = sweep(sweep(map, across, disc, !ridges), across, disc, ridges);
  for (let step = 0; step < corner; step++) {
    const grown = sweep(kept, across, NEIGHBOURS, ridges);
    for (let i = 0; i < kept.length; i++) kept[i] = ridges ? Math.min(map[i], grown[i]) : Math.max(map[i], grown[i]);
  }
  // A cell says its neighbours are level too: the vertices on the edge of a
  // step sit between two cells, and belong with the side that keeps them.
  return sweep(kept, across, NEIGHBOURS, ridges);
}

/** Move a vertex and every corner at it. */
function place(mesh: SeamBrushMesh, vertex: number, x: number, y: number, z: number, scratch: number[]): void {
  mesh.positions[vertex * 3] = x;
  mesh.positions[vertex * 3 + 1] = y;
  mesh.positions[vertex * 3 + 2] = z;
  for (const corner of cornersAt(mesh, vertex, scratch)) {
    mesh.soup[corner * 3] = x;
    mesh.soup[corner * 3 + 1] = y;
    mesh.soup[corner * 3 + 2] = z;
    mesh.dirty.add(Math.floor(corner / 3));
  }
}

/** Bring the ray trees up to date with vertices that have moved. */
function refitAround(mesh: SeamBrushMesh, vertices: Iterable<number>): void {
  const given = new Set<number>();
  const added = new Set<number>();
  const scratch: number[] = [];
  for (const vertex of vertices) {
    for (const corner of cornersAt(mesh, vertex, scratch)) {
      const triangle = Math.floor(corner / 3);
      (triangle < mesh.givenTriangles ? given : added).add(triangle);
    }
  }
  if (given.size > 0) refitBvh(mesh.bvh, mesh.soup, given);
  if (added.size > 0 && mesh.addedBvh) refitBvh(mesh.addedBvh, mesh.soup, added);
}

/**
 * Where a ray first meets the mesh, in the mesh's own coordinates: the point,
 * and which way the face there looks — turned towards where the ray came from.
 */
export function seamBrushPick(
  mesh: SeamBrushMesh,
  origin: Vec3,
  direction: Vec3
): { point: Vec3; normal: Vec3 } | null {
  const d = normalize(direction);
  if (!d) return null;
  const hit = castRay(mesh, origin[0], origin[1], origin[2], d[0], d[1], d[2], Infinity);
  if (!hit) return null;
  const face = normalize(faceNormal(mesh.soup, hit.triangle)) ?? [-d[0], -d[1], -d[2]];
  const away = face[0] * d[0] + face[1] * d[1] + face[2] * d[2] > 0;
  return {
    point: [origin[0] + hit.t * d[0], origin[1] + hit.t * d[1], origin[2] + hit.t * d[2]],
    normal: away ? [-face[0], -face[1], -face[2]] : face,
  };
}

/** What one stroke of the brush has done, so that it can be taken back. */
export interface SeamBrushStroke {
  /** How many vertices there were when the stroke began. */
  vertexCount: number;
  /** Where each vertex the stroke has moved was before it. */
  before: Map<number, Vec3>;
}

export function beginSeamBrushStroke(mesh: SeamBrushMesh): SeamBrushStroke {
  return { vertexCount: mesh.vertexCount, before: new Map() };
}

/**
 * Take back a stroke — the last one made; strokes come off in the order they
 * went on. The splits it made stay: they change no shape. The vertices they
 * added go back to the middle of the edge they were split from.
 */
export function undoSeamBrushStroke(mesh: SeamBrushMesh, stroke: SeamBrushStroke): void {
  const scratch: number[] = [];
  const changed: number[] = [];
  for (const [vertex, position] of stroke.before) {
    place(mesh, vertex, position[0], position[1], position[2], scratch);
    changed.push(vertex);
  }
  // In the order they were made: an edge is always older than its midpoint.
  const { positions, splitFrom } = mesh;
  for (let vertex = stroke.vertexCount; vertex < mesh.vertexCount; vertex++) {
    const a = splitFrom[vertex * 2] * 3;
    const b = splitFrom[vertex * 2 + 1] * 3;
    const x = (positions[a] + positions[b]) / 2;
    const y = (positions[a + 1] + positions[b + 1]) / 2;
    const z = (positions[a + 2] + positions[b + 2]) / 2;
    if (x === positions[vertex * 3] && y === positions[vertex * 3 + 1] && z === positions[vertex * 3 + 2]) continue;
    place(mesh, vertex, x, y, z, scratch);
    changed.push(vertex);
  }
  refitAround(mesh, changed);
  refreshSeamBrushNormals(mesh, changed);
}

export interface SeamBrushDab {
  /** Vertices the dab moved. */
  vertices: number[];
  /** The brush normal it settled on. */
  normal: Vec3;
}

/** How deep a dab reaches either side of the surface, and how far above it its rays set out from. */
function reachOf(radius: number): { depth: number; band: number } {
  // How tall a ridge the brush shaves and how deep a groove it fills. A wider
  // brush reaches further — 3 mm takes the slit an exact join left on the
  // Valken receiver — and what lies beyond belongs to something else.
  const depth = Math.min(Math.max(radius, 1), 3);
  return { depth, band: depth + 1 };
}

/** The brush square to the surface: which way it faces, and two directions across it. */
interface Frame {
  n: Vec3;
  u: Vec3;
  v: Vec3;
}

function facesAlong(mesh: SeamBrushMesh, triangle: number, n: Vec3): boolean {
  const face = faceNormal(mesh.soup, triangle);
  return face[0] * n[0] + face[1] * n[1] + face[2] * n[2] > 0;
}

/**
 * Drop a square grid of rays onto the surface along the frame — `across`
 * points each way, `half` either side of `point` — and write into `map` the
 * height of what each lands on above the plane through `point`. A ray met from
 * behind set out from inside the part: the surface there stands higher than
 * the brush looks (Infinity). A ray that meets nothing looks into an open drop
 * (-Infinity) — unless it set out under a surface too far below to have come
 * out of. `landed` collects the triangles the rays land on.
 */
function readHeights(
  mesh: SeamBrushMesh,
  point: Vec3,
  frame: Frame,
  band: number,
  across: number,
  half: number,
  map: Float32Array,
  landed: Set<number> | null
): void {
  const { n, u, v } = frame;
  const pitch = (2 * half) / (across - 1);
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < across; j++) {
      const x = -half + i * pitch;
      const y = -half + j * pitch;
      const ox = point[0] + x * u[0] + y * v[0] + band * n[0];
      const oy = point[1] + x * u[1] + y * v[1] + band * n[1];
      const oz = point[2] + x * u[2] + y * v[2] + band * n[2];
      const hit = castRay(mesh, ox, oy, oz, -n[0], -n[1], -n[2], 2 * band);
      if (hit) {
        map[i * across + j] = facesAlong(mesh, hit.triangle, n) ? band - hit.t : Infinity;
        landed?.add(hit.triangle);
      } else {
        const over = castRay(mesh, ox, oy, oz, n[0], n[1], n[2], Infinity);
        map[i * across + j] = over && facesAlong(mesh, over.triangle, n) ? Infinity : -Infinity;
      }
    }
  }
}

function frameOf(n: Vec3): Frame {
  const [u, v] = tangents(n);
  return { n, u, v };
}

/**
 * Which way the surface under a dab faces. The face under the pointer may be
 * the flank of the very ridge being shaved, so the triangles around the point
 * lean the brush first, and a quick look at the surface squares it after —
 * to the lie `fit` finds in it. `frame` is null when there is nothing to look
 * at, or when the squaring would swing the brush round: something other than
 * the surface under the pointer has been seen.
 */
function squareTo(
  mesh: SeamBrushMesh,
  point: Vec3,
  hint: Vec3,
  radius: number,
  band: number,
  nearby: number[],
  fit: (map: Float32Array, across: number, half: number) => Sheet | null
): { frame: Frame | null; facing: Vec3 } {
  // With no vertex near — the middle of a long triangle — the hint is all there is to go on.
  const facing = brushNormal(mesh, nearby, hint);
  let n = facing;
  const glance = new Float32Array(SAMPLES_ACROSS * SAMPLES_ACROSS);
  for (let pass = 0; pass < 2; pass++) {
    const frame = frameOf(n);
    readHeights(mesh, point, frame, band, SAMPLES_ACROSS, radius, glance, null);
    const rough = fit(glance, SAMPLES_ACROSS, radius);
    if (!rough) return { frame: null, facing };
    const [su, sv] = rough.slope;
    const tilt = Math.hypot(su, sv);
    // Square enough already — or so far off that this is not the face the brush was put on.
    if (tilt < 0.02 || tilt > 1) break;
    const squared = normalize([
      n[0] - su * frame.u[0] - sv * frame.v[0],
      n[1] - su * frame.u[1] - sv * frame.v[1],
      n[2] - su * frame.u[2] - sv * frame.v[2],
    ]);
    if (!squared) break;
    n = squared;
  }
  if (n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] < 0.8) return { frame: null, facing };
  return { frame: frameOf(n), facing };
}

/** A point of the brush plane, as the frame sees a place on the mesh. */
function inFrame(frame: Frame, point: Vec3, px: number, py: number, pz: number): { x: number; y: number; above: number } {
  const dx = px - point[0];
  const dy = py - point[1];
  const dz = pz - point[2];
  const { n, u, v } = frame;
  return {
    x: dx * u[0] + dy * u[1] + dz * u[2],
    y: dx * v[0] + dy * v[1] + dz * v[2],
    above: dx * n[0] + dy * n[1] + dz * n[2],
  };
}

/** How much of a move a point this far from the middle of the brush gets: all of it over the inner half, easing off to the rim. */
function weightAt(distance: number, radius: number): number {
  const t = Math.min(1, Math.max(0, (distance / radius - 0.5) / 0.5));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Only what shows from above the surface moves: not the back of a thin wall,
 * nor the floor of a hollow under it. A point shows when the first thing seen
 * from above, at or right beside it, is no higher than the point itself.
 */
function showsIn(map: Float32Array, across: number, half: number, x: number, y: number, above: number): boolean {
  const pitch = (2 * half) / (across - 1);
  const gi = Math.round((x + half) / pitch);
  const gj = Math.round((y + half) / pitch);
  if (gi < 0 || gj < 0 || gi >= across || gj >= across) return false;
  for (let i = Math.max(0, gi - 1); i <= Math.min(across - 1, gi + 1); i++) {
    for (let j = Math.max(0, gj - 1); j <= Math.min(across - 1, gj + 1); j++) {
      if (map[i * across + j] <= above + 0.05) return true;
    }
  }
  return false;
}

/**
 * The part of a dab that shapes the mesh, once the dab knows how far each
 * point should go.
 *
 * The surface under the brush is first made fit to be shaped: every triangle
 * that shows under it is split until it is fine enough. Without that a long
 * triangle with no vertex under the brush stays standing where it was, a fin
 * over what has been shaped around it, and one with a vertex there is dragged
 * by it however far it reaches. Then every vertex under the brush is moved
 * along the normal by what `shiftOf` says — noted in the stroke first, so that
 * it can be put back.
 */
function shapeUnder(
  mesh: SeamBrushMesh,
  point: Vec3,
  frame: Frame,
  radius: number,
  depth: number,
  landed: Set<number>,
  shows: (x: number, y: number, above: number) => boolean,
  shiftOf: (x: number, y: number, above: number, distance: number) => number,
  reshade: Set<number>,
  stroke: SeamBrushStroke | undefined
): number[] {
  const { n } = frame;
  const low: Vec3 = [point[0] - depth * n[0], point[1] - depth * n[1], point[2] - depth * n[2]];
  const high: Vec3 = [point[0] + depth * n[0], point[1] + depth * n[1], point[2] + depth * n[2]];
  const shrunk = new Set<number>();
  const maxEdge = Math.max(MIN_EDGE_MM, EDGE_PER_RADIUS * radius);
  // A triangle the rays slipped past still shows if a corner of it, or its middle, does.
  const showing = (triangle: number): boolean => {
    const { soup } = mesh;
    const at = triangle * 9;
    for (let k = 0; k < 9; k += 3) {
      const corner = inFrame(frame, point, soup[at + k], soup[at + k + 1], soup[at + k + 2]);
      if (shows(corner.x, corner.y, corner.above)) return true;
    }
    const middle = inFrame(
      frame,
      point,
      (soup[at] + soup[at + 3] + soup[at + 6]) / 3,
      (soup[at + 1] + soup[at + 4] + soup[at + 7]) / 3,
      (soup[at + 2] + soup[at + 5] + soup[at + 8]) / 3
    );
    return shows(middle.x, middle.y, middle.above);
  };
  const splits = refineUnder(mesh, low, high, radius, maxEdge, landed, showing, reshade, shrunk);
  if (splits > 0) {
    // A split triangle only shrinks, so the tree over the given ones still
    // holds — but its boxes are drawn in round what is left of them, or every
    // ray past a long sliver would go on testing it. The added ones get a tree
    // of their own.
    refitBvh(mesh.bvh, mesh.soup, shrunk);
    mesh.addedBvh = buildBvh(mesh.soup, mesh.givenTriangles, mesh.triangleCount - mesh.givenTriangles);
  }

  const scratch: number[] = [];
  const moved: number[] = [];
  for (const vertex of verticesNear(mesh, point, Math.hypot(radius, depth))) {
    const at = inFrame(frame, point, mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]);
    const distance = Math.hypot(at.x, at.y);
    if (distance >= radius) continue;
    const shift = shiftOf(at.x, at.y, at.above, distance);
    // Not worth the move: the rim of the brush barely touches what it passes over.
    if (!(Math.abs(shift) >= 1e-4)) continue;
    if (stroke && vertex < stroke.vertexCount && !stroke.before.has(vertex)) {
      stroke.before.set(vertex, [
        mesh.positions[vertex * 3],
        mesh.positions[vertex * 3 + 1],
        mesh.positions[vertex * 3 + 2],
      ]);
    }
    const nx = mesh.positions[vertex * 3] + shift * n[0];
    const ny = mesh.positions[vertex * 3 + 1] + shift * n[1];
    const nz = mesh.positions[vertex * 3 + 2] + shift * n[2];
    place(mesh, vertex, nx, ny, nz, scratch);
    const drift = Math.hypot(
      nx - mesh.origin[vertex * 3],
      ny - mesh.origin[vertex * 3 + 1],
      nz - mesh.origin[vertex * 3 + 2]
    );
    if (drift > mesh.drift) mesh.drift = drift;
    moved.push(vertex);
  }
  refitAround(mesh, moved);
  return moved;
}

/**
 * One dab of the brush at a point on the surface. `hint` is the direction the
 * surface faces there: the normal of the face under the pointer. Given the
 * stroke the dab belongs to, it notes what it moves there.
 */
export function seamBrushDab(
  mesh: SeamBrushMesh,
  point: Vec3,
  hint: Vec3,
  options: SeamBrushOptions,
  stroke?: SeamBrushStroke
): SeamBrushDab {
  const radius = Math.max(options.radiusMm, 0.05);
  const { depth, band } = reachOf(radius);
  const reshade = new Set<number>();
  const finish = (moved: number[], normal: Vec3): SeamBrushDab => {
    for (const vertex of moved) reshade.add(vertex);
    if (reshade.size > 0) refreshSeamBrushNormals(mesh, reshade);
    return { vertices: moved, normal };
  };

  const nearby = verticesNear(mesh, point, Math.hypot(radius, depth));
  // Squared to the face most of the surface around it lies on, so that an edge
  // or a step under the brush is seen from one side of it, not from between.
  const { frame, facing } = squareTo(mesh, point, normalize(hint) ?? [0, 0, 1], radius, band, nearby, fitSheet);
  if (!frame) return finish([], facing);
  const { n } = frame;

  // Then the surface itself, read finely, out past the rim of the brush by the
  // radius of the disc: the map of what shows from above.
  const disc = DISC_PER_RADIUS * radius;
  const half = radius + disc;
  const mapPitch = (2 * half) / (MAP_ACROSS - 1);
  const map = new Float32Array(MAP_ACROSS * MAP_ACROSS);
  const landed = new Set<number>();
  readHeights(mesh, point, frame, band, MAP_ACROSS, half, map, landed);
  const sheet = fitSheet(map, MAP_ACROSS, half);
  if (!sheet) return finish([], n);

  // The heights are taken off the sheet — so a round body is not one long
  // ridge — and the disc is run over what is left. `belongs` is where the part
  // itself stands at each point: the map with the ridges off it when shaving,
  // with the grooves filled when filling.
  const shave = options.mode === 'shave';
  const relief = new Float32Array(map.length);
  for (let i = 0; i < MAP_ACROSS; i++) {
    for (let j = 0; j < MAP_ACROSS; j++) {
      const cell = i * MAP_ACROSS + j;
      relief[cell] = map[cell] - sheet.height(-half + i * mapPitch, -half + j * mapPitch);
    }
  }
  const discCells = discOffsets(disc / mapPitch);
  const corner = Math.ceil((CORNER_PER_DISC * disc) / mapPitch);
  const ridgeless = withoutNarrow(relief, MAP_ACROSS, discCells, corner, true);
  const grooveless = withoutNarrow(relief, MAP_ACROSS, discCells, corner, false);
  const belongs = shave ? ridgeless : grooveless;

  // Where most of the surface under the brush is ridge and groove, that is its
  // texture — a thread, a knurl, the facets of a coarse cylinder — and only
  // what stands well clear of it is seam. On a smooth surface this is nothing,
  // and what is level is what a print would not show.
  const rough: number[] = [];
  for (let i = 0; i < MAP_ACROSS; i++) {
    for (let j = 0; j < MAP_ACROSS; j++) {
      const x = -half + i * mapPitch;
      const y = -half + j * mapPitch;
      if (x * x + y * y > radius * radius) continue;
      const span = grooveless[i * MAP_ACROSS + j] - ridgeless[i * MAP_ACROSS + j];
      if (Number.isFinite(span)) rough.push(Math.max(0, span));
    }
  }
  const level = Math.max(LEVEL_MM, rough.length > 0 ? 3 * median(rough) : 0);
  const shows = (x: number, y: number, above: number) => showsIn(map, MAP_ACROSS, half, x, y, above);

  /** How far a point stands off where the part belongs — if it is seam on the brush's side, and shows. */
  const offBy = (x: number, y: number, above: number): number | null => {
    const gi = Math.round((x + half) / mapPitch);
    const gj = Math.round((y + half) / mapPitch);
    if (gi < 0 || gj < 0 || gi >= MAP_ACROSS || gj >= MAP_ACROSS) return null;
    const height = above - sheet.height(x, y) - belongs[gi * MAP_ACROSS + gj];
    // Further off than the brush reaches — or beside a drop with no bottom — is not seam.
    if (!(Math.abs(height) <= depth)) return null;
    if (shave ? height <= level : height >= -level) return null;
    return shows(x, y, above) ? height : null;
  };

  // The ceiling starts at the highest point under the brush and comes down a
  // step per dab (the floor likewise comes up), so the worst goes first. What
  // counts as highest is weighed by how near the middle it is: the seam runs on
  // out of the brush at its full height, and if the rim had as much say as the
  // middle the ceiling would never come down past it. Where the seam is there
  // may be no vertex yet — a ridge can be two triangles from one end of the
  // part to the other — so the points of the map count as well as the vertices.
  // Anything further out than HEADROOM_MM is brought to it in one go: a 3 mm
  // slit should not take thirty dabs before its mouth begins to close.
  let worst = 0;
  const weigh = (height: number, distance: number) => {
    const weighed = height * weightAt(distance, radius);
    if (shave ? weighed > worst : weighed < worst) worst = weighed;
  };
  for (const vertex of nearby) {
    const at = inFrame(frame, point, mesh.positions[vertex * 3], mesh.positions[vertex * 3 + 1], mesh.positions[vertex * 3 + 2]);
    const distance = Math.hypot(at.x, at.y);
    if (distance >= radius) continue;
    const height = offBy(at.x, at.y, at.above);
    if (height !== null) weigh(height, distance);
  }
  for (let i = 0; i < MAP_ACROSS; i++) {
    for (let j = 0; j < MAP_ACROSS; j++) {
      const x = -half + i * mapPitch;
      const y = -half + j * mapPitch;
      const distance = Math.hypot(x, y);
      if (distance >= radius) continue;
      const height = relief[i * MAP_ACROSS + j] - belongs[i * MAP_ACROSS + j];
      if (!(Math.abs(height) <= depth)) continue;
      if (shave ? height <= level : height >= -level) continue;
      weigh(height, distance);
    }
  }
  if (worst === 0) return finish([], n);
  const extreme = shave ? Math.min(worst, HEADROOM_MM) : Math.max(worst, -HEADROOM_MM);
  const limit = shave ? Math.max(0, extreme - options.stepMm) : Math.min(0, extreme + options.stepMm);

  const moved = shapeUnder(
    mesh,
    point,
    frame,
    radius,
    depth,
    landed,
    shows,
    (x, y, above, distance) => {
      const height = offBy(x, y, above);
      if (height === null) return 0;
      const beyond = height - limit;
      if (shave ? beyond <= 0 : beyond >= 0) return 0;
      return -beyond * weightAt(distance, radius);
    },
    reshade,
    stroke
  );
  return finish(moved, n);
}

export interface CloneStampOptions {
  radiusMm: number;
  /** How much of the way to the source's shape one dab goes, 0–1. */
  strength: number;
}

export interface CloneStampDab extends SeamBrushDab {
  /** Where on the surface the dab took its shape from; null when there was nothing there to take. */
  source: Vec3 | null;
}

/** The value of a map at a point of its square, read between its four nearest points; NaN off the map or beside a drop. */
function sampleAt(map: Float32Array, across: number, half: number, x: number, y: number): number {
  const pitch = (2 * half) / (across - 1);
  const fi = (x + half) / pitch;
  const fj = (y + half) / pitch;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= across - 1 || j >= across - 1) {
    const ni = Math.round(fi);
    const nj = Math.round(fj);
    return ni < 0 || nj < 0 || ni >= across || nj >= across ? Number.NaN : map[ni * across + nj];
  }
  const ti = fi - i;
  const tj = fj - j;
  const value =
    map[i * across + j] * (1 - ti) * (1 - tj) +
    map[(i + 1) * across + j] * ti * (1 - tj) +
    map[i * across + j + 1] * (1 - ti) * tj +
    map[(i + 1) * across + j + 1] * ti * tj;
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * The height of the surface about its own lie: the map less its sheet, and
 * less the level most of it stands at — so that a patch of clean surface reads
 * as nothing at all, wherever it is and however it tilts. Gives that level too.
 */
function reliefOf(
  map: Float32Array,
  sheet: Sheet,
  across: number,
  half: number
): { relief: Float32Array; level: number } {
  const pitch = (2 * half) / (across - 1);
  const relief = new Float32Array(map.length);
  const levels: number[] = [];
  for (let i = 0; i < across; i++) {
    for (let j = 0; j < across; j++) {
      const x = -half + i * pitch;
      const y = -half + j * pitch;
      const value = map[i * across + j] - sheet.height(x, y);
      relief[i * across + j] = value;
      if (Number.isFinite(value) && x * x + y * y <= half * half) levels.push(value);
    }
  }
  const level = levels.length > 0 ? median(levels) : 0;
  for (let k = 0; k < relief.length; k++) relief[k] -= level;
  return { relief, level };
}

/**
 * One dab of the clone stamp: the surface under the brush takes on the shape
 * of the surface at `source` — a point on the part, usually some way off along
 * it, that the stroke carries along at the same distance.
 *
 * What is copied is the shape about the lie of the surface, not its height:
 * clean surface cloned onto a seam lays the seam flat into the surface around
 * it, and a knurl cloned onto a patch that lost it puts it back — on a curve or
 * a slope as on the flat. The source is read square to the brush, so it should
 * face much the same way; one that does not is left alone.
 */
export function cloneStampDab(
  mesh: SeamBrushMesh,
  point: Vec3,
  hint: Vec3,
  source: Vec3,
  options: CloneStampOptions,
  stroke?: SeamBrushStroke
): CloneStampDab {
  const radius = Math.max(options.radiusMm, 0.05);
  const strength = Math.min(Math.max(options.strength, 0), 1);
  const { depth, band } = reachOf(radius);
  const reshade = new Set<number>();
  const finish = (moved: number[], normal: Vec3, from: Vec3 | null): CloneStampDab => {
    for (const vertex of moved) reshade.add(vertex);
    if (reshade.size > 0) refreshSeamBrushNormals(mesh, reshade);
    return { vertices: moved, normal, source: from };
  };

  const nearby = verticesNear(mesh, point, Math.hypot(radius, depth));
  // Squared to the average lie of the surface, texture and all: squared to one
  // facet of a knurl — or of the ripples it is laying down — it would copy them askew.
  const { frame, facing } = squareTo(mesh, point, normalize(hint) ?? [0, 0, 1], radius, band, nearby, fitLie);
  if (!frame) return finish([], facing, null);
  const { n } = frame;

  // The source is wherever the surface is under the point it names, seen the
  // way the brush looks: it may lie a little above or below where it was named.
  const reach = band + CLONE_SEARCH_MM;
  const found = castRay(
    mesh,
    source[0] + reach * n[0],
    source[1] + reach * n[1],
    source[2] + reach * n[2],
    -n[0],
    -n[1],
    -n[2],
    2 * reach
  );
  // Found much further off than it was named, it is some other surface.
  if (!found || !facesAlong(mesh, found.triangle, n) || Math.abs(reach - found.t) > CLONE_SEARCH_MM) {
    return finish([], n, null);
  }
  const from: Vec3 = [
    source[0] + (reach - found.t) * n[0],
    source[1] + (reach - found.t) * n[1],
    source[2] + (reach - found.t) * n[2],
  ];

  const across = CLONE_ACROSS;
  const half = radius;
  const there = new Float32Array(across * across);
  readHeights(mesh, from, frame, band, across, half, there, null);
  const sourceSheet = fitLie(there, across, half);
  // Much steeper than the brush and it is another face, not a patch of this one.
  if (!sourceSheet || Math.hypot(...sourceSheet.slope) > CLONE_MAX_SLOPE) return finish([], n, from);
  const here = new Float32Array(across * across);
  const landed = new Set<number>();
  readHeights(mesh, point, frame, band, across, half, here, landed);
  const sheet = fitLie(here, across, half);
  if (!sheet) return finish([], n, from);

  const copied = reliefOf(there, sourceSheet, across, half).relief;
  const { relief: own, level } = reliefOf(here, sheet, across, half);
  // Where the surface here should stand: its own lie, and the source's shape about it.
  const wanted = (x: number, y: number) => sheet.height(x, y) + level + sampleAt(copied, across, half, x, y);
  const shows = (x: number, y: number, above: number) => showsIn(here, across, half, x, y, above);

  // Only if the surface under the brush is off its source somewhere is there anything to do.
  const pitch = (2 * half) / (across - 1);
  let off = false;
  for (let i = 0; i < across && !off; i++) {
    for (let j = 0; j < across && !off; j++) {
      const x = -half + i * pitch;
      const y = -half + j * pitch;
      if (x * x + y * y >= radius * radius) continue;
      const gap = copied[i * across + j] - own[i * across + j];
      if (Math.abs(gap) > LEVEL_MM && Math.abs(gap) <= depth) off = true;
    }
  }
  if (!off) return finish([], n, from);

  const moved = shapeUnder(
    mesh,
    point,
    frame,
    radius,
    depth,
    landed,
    shows,
    (x, y, above, distance) => {
      const gap = wanted(x, y) - above;
      if (!(Math.abs(gap) > LEVEL_MM && Math.abs(gap) <= depth)) return 0;
      if (!shows(x, y, above)) return 0;
      return gap * strength * weightAt(distance, radius);
    },
    reshade,
    stroke
  );
  return finish(moved, n, from);
}

/**
 * Re-shade the triangles around vertices that moved, in the same per-corner
 * layout and by the same crease rule as `smoothNormals`, without touching the
 * rest of a big mesh.
 */
export function refreshSeamBrushNormals(
  mesh: SeamBrushMesh,
  vertices: Iterable<number>,
  creaseDegrees = DEFAULT_CREASE_DEGREES
): void {
  const threshold = Math.cos((Math.min(Math.max(creaseDegrees, 0), 180) * Math.PI) / 180);
  const scratch: number[] = [];
  // Every face at a moved vertex has turned, and that re-shades all its corners.
  const touched = new Set<number>();
  for (const vertex of vertices) {
    for (const corner of cornersAt(mesh, vertex, scratch)) {
      const triangle = Math.floor(corner / 3);
      touched.add(mesh.vertexOf[triangle * 3]);
      touched.add(mesh.vertexOf[triangle * 3 + 1]);
      touched.add(mesh.vertexOf[triangle * 3 + 2]);
    }
  }

  const faces = new Map<number, Vec3>();
  const unitFace = (triangle: number): Vec3 => {
    let unit = faces.get(triangle);
    if (!unit) {
      unit = normalize(faceNormal(mesh.soup, triangle)) ?? [0, 0, 0];
      faces.set(triangle, unit);
    }
    return unit;
  };

  const around: number[] = [];
  for (const vertex of touched) {
    cornersAt(mesh, vertex, around);
    for (const corner of around) {
      const own = unitFace(Math.floor(corner / 3));
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const other of around) {
        const face = unitFace(Math.floor(other / 3));
        if (face[0] * own[0] + face[1] * own[1] + face[2] * own[2] < threshold) continue;
        sx += face[0];
        sy += face[1];
        sz += face[2];
      }
      const smooth = normalize([sx, sy, sz]) ?? own;
      mesh.normals[corner * 3] = smooth[0];
      mesh.normals[corner * 3 + 1] = smooth[1];
      mesh.normals[corner * 3 + 2] = smooth[2];
      mesh.dirty.add(Math.floor(corner / 3));
    }
  }
}

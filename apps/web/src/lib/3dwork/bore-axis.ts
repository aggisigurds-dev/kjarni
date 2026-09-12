/**
 * Where a pipe should run through a part: down the hole you can see straight
 * through it.
 *
 * "+ ⌀28" used to aim at the middle of the part's bounding box. A bore is
 * rarely there — the Valken receiver's runs 1.3 mm off it — and a pipe bored
 * off its axis thins one wall and leaves a lip at the mouth. So the part is cut
 * into thin sections across the pipe's axis and the sections are stacked into
 * one silhouette. A hole the part encloses in that silhouette is one you can
 * see through. Each section's widest circle inside it marks the bore's centre
 * at that depth, and the middle of those centres is the axis — a short stretch
 * that is narrower or sits off to one side does not pull it away from the bore
 * that runs most of the length.
 *
 * The seam between printed halves is shut before holes are looked for, so two
 * halves still read as one tube.
 */

export interface BoreAxis {
  /** Centre of the bore on the two other axes, in ascending axis order, mm. */
  center: [number, number];
  /** Across most of the length: the median section's widest circle, mm. */
  diameter: number;
  /** Widest pipe on that centre that clears every section, mm. */
  clearDiameter: number;
}

export interface BoreAxisOptions {
  /** Sections across the axis. More catches shorter ribs. */
  sections?: number;
  /** Silhouette cell, mm. A seam up to about one cell wide is shut. */
  cellMm?: number;
}

const DEFAULT_SECTIONS = 24;
const DEFAULT_CELL_MM = 0.25;
/** Holes narrower than this are screw holes and vents, not a bore, mm. */
const MIN_BORE_MM = 2;

interface Grid {
  u0: number;
  v0: number;
  cell: number;
  width: number;
  height: number;
}

/** Where the plane at `level` along `axis` cuts each triangle, as flat (u, v) segments. */
function sectionAt(soup: Float32Array, axis: number, u: number, v: number, level: number): Float64Array {
  const out: number[] = [];
  const hit = [0, 0, 0, 0];
  for (let t = 0; t + 8 < soup.length; t += 9) {
    let n = 0;
    for (let e = 0; e < 3 && n < 4; e++) {
      const i = t + e * 3;
      const j = t + ((e + 1) % 3) * 3;
      const a = soup[i + axis] - level;
      const b = soup[j + axis] - level;
      if ((a < 0) === (b < 0)) continue;
      const s = a / (a - b);
      hit[n++] = soup[i + u] + s * (soup[j + u] - soup[i + u]);
      hit[n++] = soup[i + v] + s * (soup[j + v] - soup[i + v]);
    }
    if (n === 4) out.push(hit[0], hit[1], hit[2], hit[3]);
  }
  return Float64Array.from(out);
}

/** Count a section's material into the silhouette, row by row, inside to outside. */
function fillSection(segments: Float64Array, grid: Grid, counts: Uint16Array): void {
  const { u0, v0, cell, width, height } = grid;
  const crossings: number[] = [];
  for (let row = 0; row < height; row++) {
    const y = v0 + (row + 0.5) * cell;
    crossings.length = 0;
    for (let s = 0; s < segments.length; s += 4) {
      const ay = segments[s + 1];
      const by = segments[s + 3];
      if ((ay <= y) === (by <= y)) continue;
      crossings.push(segments[s] + ((y - ay) / (by - ay)) * (segments[s + 2] - segments[s]));
    }
    crossings.sort((p, q) => p - q);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = Math.max(0, Math.ceil((crossings[k] - u0) / cell - 0.5));
      const to = Math.min(width - 1, Math.floor((crossings[k + 1] - u0) / cell - 0.5));
      for (let col = from; col <= to; col++) counts[row * width + col]++;
    }
  }
}

/** Distance from (pu, pv) to the nearest segment. */
function clearance(segments: Float64Array, pu: number, pv: number): number {
  let nearest = Infinity;
  for (let s = 0; s < segments.length; s += 4) {
    const au = segments[s];
    const av = segments[s + 1];
    const du = segments[s + 2] - au;
    const dv = segments[s + 3] - av;
    const length2 = du * du + dv * dv;
    let k = length2 > 0 ? ((pu - au) * du + (pv - av) * dv) / length2 : 0;
    k = k < 0 ? 0 : k > 1 ? 1 : k;
    const eu = au + k * du - pu;
    const ev = av + k * dv - pv;
    const d2 = eu * eu + ev * ev;
    if (d2 < nearest) nearest = d2;
  }
  return Math.sqrt(nearest);
}

/** The widest circle among these segments, searched outward from a starting centre. */
function widestCircle(segments: Float64Array, start: [number, number]): { u: number; v: number; r: number } {
  let u = start[0];
  let v = start[1];
  let r = clearance(segments, u, v);
  for (const [span, step] of [
    [2, 0.25],
    [0.25, 0.025],
    [0.025, 0.0025],
  ]) {
    let bestU = u;
    let bestV = v;
    let bestR = r;
    for (let du = -span; du <= span + 1e-9; du += step) {
      for (let dv = -span; dv <= span + 1e-9; dv += step) {
        const candidate = clearance(segments, u + du, v + dv);
        if (candidate > bestR) {
          bestR = candidate;
          bestU = u + du;
          bestV = v + dv;
        }
      }
    }
    u = bestU;
    v = bestV;
    r = bestR;
  }
  return { u, v, r };
}

/** Segments with a point within `reach` of (cu, cv) — the rest cannot touch a circle there. */
function segmentsNear(segments: Float64Array, cu: number, cv: number, reach: number): Float64Array {
  const out: number[] = [];
  for (let s = 0; s < segments.length; s += 4) {
    const minU = Math.min(segments[s], segments[s + 2]);
    const maxU = Math.max(segments[s], segments[s + 2]);
    const minV = Math.min(segments[s + 1], segments[s + 3]);
    const maxV = Math.max(segments[s + 1], segments[s + 3]);
    if (maxU < cu - reach || minU > cu + reach || maxV < cv - reach || minV > cv + reach) continue;
    out.push(segments[s], segments[s + 1], segments[s + 2], segments[s + 3]);
  }
  return Float64Array.from(out);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The bore a pipe laid along `axis` should follow, or null when nothing can be
 * seen through the part that way.
 */
export function findBoreAxis(
  soup: Float32Array,
  axis: 0 | 1 | 2,
  options: BoreAxisOptions = {}
): BoreAxis | null {
  if (soup.length < 9) return null;
  const [u, v] = [0, 1, 2].filter((other) => other !== axis);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < soup.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const value = soup[i + a];
      if (value < min[a]) min[a] = value;
      if (value > max[a]) max[a] = value;
    }
  }

  const cell = options.cellMm ?? DEFAULT_CELL_MM;
  const count = Math.max(2, options.sections ?? DEFAULT_SECTIONS);
  const grid: Grid = {
    u0: min[u] - 2 * cell,
    v0: min[v] - 2 * cell,
    cell,
    width: Math.ceil((max[u] - min[u]) / cell) + 4,
    height: Math.ceil((max[v] - min[v]) / cell) + 4,
  };
  const { width, height } = grid;

  const sections: Float64Array[] = [];
  const counts = new Uint16Array(width * height);
  for (let k = 0; k < count; k++) {
    const level = min[axis] + ((k + 0.5) / count) * (max[axis] - min[axis]);
    const segments = sectionAt(soup, axis, u, v, level);
    if (segments.length === 0) continue;
    sections.push(segments);
    fillSection(segments, grid, counts);
  }
  if (sections.length === 0) return null;

  // Material is what at least two sections agree on, so one badly closed
  // section cannot streak across the bore; the seam between halves is shut by
  // growing it one cell.
  const agree = sections.length >= 4 ? 2 : 1;
  const solid = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (counts[row * width + col] < agree) continue;
      const index = row * width + col;
      solid[index] = 1;
      if (col > 0) solid[index - 1] = 1;
      if (col < width - 1) solid[index + 1] = 1;
      if (row > 0) solid[index - width] = 1;
      if (row < height - 1) solid[index + width] = 1;
    }
  }

  // Everything reachable from the border without crossing material is outside.
  const outside = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let col = 0; col < width; col++) stack.push(col, (height - 1) * width + col);
  for (let row = 0; row < height; row++) stack.push(row * width, row * width + width - 1);
  while (stack.length > 0) {
    const index = stack.pop() as number;
    if (outside[index] || solid[index]) continue;
    outside[index] = 1;
    const row = (index / width) | 0;
    const col = index % width;
    if (col > 0) stack.push(index - 1);
    if (col < width - 1) stack.push(index + 1);
    if (row > 0) stack.push(index - width);
    if (row < height - 1) stack.push(index + width);
  }

  // The biggest enclosed hole is the bore.
  const label = new Int32Array(width * height).fill(-1);
  let bore = -1;
  let boreArea = 0;
  let holes = 0;
  for (let first = 0; first < width * height; first++) {
    if (solid[first] || outside[first] || label[first] >= 0) continue;
    const id = holes++;
    let area = 0;
    label[first] = id;
    stack.push(first);
    while (stack.length > 0) {
      const index = stack.pop() as number;
      area++;
      const row = (index / width) | 0;
      const col = index % width;
      for (const next of [
        col > 0 ? index - 1 : -1,
        col < width - 1 ? index + 1 : -1,
        row > 0 ? index - width : -1,
        row < height - 1 ? index + width : -1,
      ]) {
        if (next >= 0 && !solid[next] && !outside[next] && label[next] < 0) {
          label[next] = id;
          stack.push(next);
        }
      }
    }
    if (area > boreArea) {
      boreArea = area;
      bore = id;
    }
  }
  if (bore < 0) return null;

  // Its deepest cell — the farthest from any wall — is where to start looking.
  const depth = new Float64Array(width * height);
  for (let index = 0; index < depth.length; index++) depth[index] = label[index] === bore ? 1e9 : 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      if (depth[index] === 0) continue;
      if (col > 0) depth[index] = Math.min(depth[index], depth[index - 1] + 1);
      if (row > 0) {
        depth[index] = Math.min(depth[index], depth[index - width] + 1);
        if (col > 0) depth[index] = Math.min(depth[index], depth[index - width - 1] + Math.SQRT2);
        if (col < width - 1) depth[index] = Math.min(depth[index], depth[index - width + 1] + Math.SQRT2);
      }
    }
  }
  for (let row = height - 1; row >= 0; row--) {
    for (let col = width - 1; col >= 0; col--) {
      const index = row * width + col;
      if (depth[index] === 0) continue;
      if (col < width - 1) depth[index] = Math.min(depth[index], depth[index + 1] + 1);
      if (row < height - 1) {
        depth[index] = Math.min(depth[index], depth[index + width] + 1);
        if (col < width - 1) depth[index] = Math.min(depth[index], depth[index + width + 1] + Math.SQRT2);
        if (col > 0) depth[index] = Math.min(depth[index], depth[index + width - 1] + Math.SQRT2);
      }
    }
  }
  let deepest = -1;
  let deepestIndex = -1;
  for (let index = 0; index < depth.length; index++) {
    if (label[index] === bore && depth[index] > deepest) {
      deepest = depth[index];
      deepestIndex = index;
    }
  }
  // The silhouette was grown one cell into the hole, so it is a cell wider than it looks.
  if ((deepest + 1) * 2 * cell < MIN_BORE_MM) return null;
  const start: [number, number] = [
    grid.u0 + ((deepestIndex % width) + 0.5) * cell,
    grid.v0 + (((deepestIndex / width) | 0) + 0.5) * cell,
  ];

  const reach = (deepest + 3) * cell + 3;
  const circles = sections
    .map((segments) => segmentsNear(segments, start[0], start[1], reach))
    .filter((near) => near.length > 0)
    .map((near) => widestCircle(near, start));
  if (circles.length === 0) return null;

  const center: [number, number] = [median(circles.map((c) => c.u)), median(circles.map((c) => c.v))];
  const clear = Math.min(...sections.map((segments) => clearance(segments, center[0], center[1])));
  return {
    center,
    diameter: 2 * median(circles.map((c) => c.r)),
    clearDiameter: 2 * clear,
  };
}

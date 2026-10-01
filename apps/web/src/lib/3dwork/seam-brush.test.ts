// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { smoothNormals } from './normals';
import {
  beginSeamBrushStroke,
  createSeamBrushMesh,
  seamBrushDab,
  seamBrushPick,
  seamBrushSoup,
  undoSeamBrushStroke,
  type SeamBrushMesh,
  type SeamBrushOptions,
  type SeamBrushStroke,
  type Vec3,
} from './seam-brush';

const UP: Vec3 = [0, 0, 1];

/** A sheet facing +Z over the grid `xs` × `ys`, at the height `height(x, y)` gives. */
function grid(xs: number[], ys: number[], height: (x: number, y: number, column: number) => number): Float32Array {
  const out: number[] = [];
  const at = (i: number, j: number) => [xs[i], ys[j], height(xs[i], ys[j], i)];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      out.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
  }
  return new Float32Array(out);
}

function steps(from: number, to: number, pitch: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= Math.round((to - from) / pitch); k++) out.push(from + k * pitch);
  return out;
}

/** A finely meshed sheet over [-half, half]². */
function sheet(height: (x: number, y: number) => number, half = 8, pitch = 0.25): Float32Array {
  const axis = steps(-half, half, pitch);
  return grid(axis, axis, height);
}

/** Drag the brush along the Y axis at x = 0, over and over. */
function strokeAlongY(mesh: SeamBrushMesh, options: SeamBrushOptions, passes: number, z = 0, reach = 5): number {
  let moved = 0;
  for (let pass = 0; pass < passes; pass++) {
    let hint = UP;
    for (let y = -reach; y <= reach; y += options.radiusMm / 4) {
      const dab = seamBrushDab(mesh, [0, y, z], hint, options);
      hint = dab.normal;
      moved += dab.vertices.length;
    }
  }
  return moved;
}

/** Highest and lowest the mesh stands in the strip |x| < half, |y| < along. */
function extremes(mesh: SeamBrushMesh, half: number, along = 4): { max: number; min: number } {
  let max = -Infinity;
  let min = Infinity;
  for (let v = 0; v < mesh.vertexCount; v++) {
    if (Math.abs(mesh.positions[v * 3]) > half || Math.abs(mesh.positions[v * 3 + 1]) > along) continue;
    max = Math.max(max, mesh.positions[v * 3 + 2]);
    min = Math.min(min, mesh.positions[v * 3 + 2]);
  }
  return { max, min };
}

/** How many vertices are somewhere other than where they started. */
function movedCount(mesh: SeamBrushMesh): number {
  let count = 0;
  for (let v = 0; v < mesh.vertexCount; v++) {
    if (
      mesh.positions[v * 3] !== mesh.origin[v * 3] ||
      mesh.positions[v * 3 + 1] !== mesh.origin[v * 3 + 1] ||
      mesh.positions[v * 3 + 2] !== mesh.origin[v * 3 + 2]
    ) {
      count++;
    }
  }
  return count;
}

function area(soup: Float32Array): number {
  let sum = 0;
  for (let t = 0; t < soup.length; t += 9) {
    const ux = soup[t + 3] - soup[t];
    const uy = soup[t + 4] - soup[t + 1];
    const uz = soup[t + 5] - soup[t + 2];
    const vx = soup[t + 6] - soup[t];
    const vy = soup[t + 7] - soup[t + 1];
    const vz = soup[t + 8] - soup[t + 2];
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return sum;
}

/** Edges used by one triangle only, as the pair of their end points. */
function openEdges(soup: Float32Array): [number[], number[]][] {
  const key = (i: number) => `${soup[i].toFixed(5)},${soup[i + 1].toFixed(5)},${soup[i + 2].toFixed(5)}`;
  const uses = new Map<string, { count: number; ends: [number[], number[]] }>();
  for (let t = 0; t < soup.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      const p = t + k * 3;
      const q = t + ((k + 1) % 3) * 3;
      const a = key(p);
      const b = key(q);
      const id = a < b ? `${a}|${b}` : `${b}|${a}`;
      const entry = uses.get(id);
      if (entry) entry.count++;
      else uses.set(id, { count: 1, ends: [Array.from(soup.subarray(p, p + 3)), Array.from(soup.subarray(q, q + 3))] });
    }
  }
  return [...uses.values()].filter((entry) => entry.count === 1).map((entry) => entry.ends);
}

const shave: SeamBrushOptions = { radiusMm: 2, stepMm: 0.05, mode: 'shave' };
const fill: SeamBrushOptions = { radiusMm: 2, stepMm: 0.05, mode: 'fill' };

describe('seam brush', () => {
  it('shaves a ridge down to the surface it stands on, and no further', () => {
    const mesh = createSeamBrushMesh(sheet((x) => (Math.abs(x) < 0.3 ? 0.2 : 0)));
    expect(extremes(mesh, 0.3).max).toBeCloseTo(0.2, 5);
    strokeAlongY(mesh, shave, 8, 0.2);
    // Level to within what the brush calls level — far finer than a print shows.
    const after = extremes(mesh, 3);
    expect(after.max).toBeLessThan(0.02);
    expect(after.min).toBeGreaterThan(-0.02);
  });

  it('fills a groove up to the surface around it, and no higher', () => {
    const mesh = createSeamBrushMesh(sheet((x) => (Math.abs(x) < 0.3 ? -0.5 : 0)));
    strokeAlongY(mesh, fill, 14);
    // Away from the ends of the stroke, where the deepest-first rule is still catching up.
    const after = extremes(mesh, 3, 3);
    expect(after.min).toBeGreaterThan(-0.02);
    expect(after.max).toBeLessThan(0.02);
  });

  it('takes the highest first: one dab lowers only what stands above the new ceiling', () => {
    // A 0.3 mm ridge for y < 0 and a 0.1 mm one for y > 0, both under the brush.
    const mesh = createSeamBrushMesh(sheet((x, y) => (Math.abs(x) < 0.3 ? (y < 0 ? 0.3 : 0.1) : 0)));
    seamBrushDab(mesh, [0, 0, 0.3], UP, shave);
    let tall = -Infinity;
    let short = -Infinity;
    for (let v = 0; v < mesh.vertexCount; v++) {
      const x = mesh.positions[v * 3];
      const y = mesh.positions[v * 3 + 1];
      if (Math.abs(x) > 0.3 || Math.abs(y) > 0.9) continue;
      if (y < -0.2) tall = Math.max(tall, mesh.positions[v * 3 + 2]);
      if (y > 0.2) short = Math.max(short, mesh.positions[v * 3 + 2]);
    }
    expect(tall).toBeCloseTo(0.25, 2);
    expect(short).toBeCloseTo(0.1, 5);
  });

  it('shaving leaves a groove alone, and filling leaves a ridge alone', () => {
    const groove = createSeamBrushMesh(sheet((x) => (Math.abs(x) < 0.3 ? -0.5 : 0)));
    expect(strokeAlongY(groove, shave, 2)).toBe(0);
    const ridge = createSeamBrushMesh(sheet((x) => (Math.abs(x) < 0.3 ? 0.2 : 0)));
    expect(strokeAlongY(ridge, fill, 2, 0.2)).toBe(0);
  });

  it('leaves a wide raised feature alone — a rail tooth is not a seam', () => {
    // A 6 mm wide, 2 mm tall block; the brush runs along its edge and over its top.
    const mesh = createSeamBrushMesh(sheet((x) => (x > 1 && x < 7 ? 2 : 0)));
    for (const x of [0, 1, 2, 4]) {
      for (let y = -5; y <= 5; y += 0.5) seamBrushDab(mesh, [x, y, x > 1 ? 2 : 0], UP, shave);
    }
    expect(movedCount(mesh)).toBe(0);
  });

  it('leaves the corners of a wide raised feature alone too', () => {
    // A 6 × 6 mm block, 1.2 mm tall; the brush goes round one of its corners and over it.
    const mesh = createSeamBrushMesh(sheet((x, y) => (x > 1 && x < 7 && y > -3 && y < 3 ? 1.2 : 0)));
    for (const mode of ['shave', 'fill'] as const) {
      for (let x = -0.5; x <= 3; x += 0.5) {
        for (let y = -4.5; y <= -1; y += 0.5) {
          const top = x > 1 && y > -3;
          seamBrushDab(mesh, [x, y, top ? 1.2 : 0], UP, { radiusMm: 2, stepMm: 0.1, mode });
        }
      }
    }
    expect(movedCount(mesh)).toBe(0);
  });

  it('levels a seam across a step, each side to its own level', () => {
    // Two halves that did not line up: one 0.25 mm higher than the other, with a
    // 1 mm fin standing on the join and a groove cut into it further along.
    const floor = (x: number) => (x > 0 ? 0.25 : 0);
    const mesh = createSeamBrushMesh(
      sheet((x, y) => (Math.abs(x) < 0.2 ? (y < 0 ? 1 : -0.4) : floor(x)), 5, 0.125)
    );
    strokeAlongY(mesh, shave, 14, 0.25, 3);
    strokeAlongY(mesh, fill, 12, 0.25, 3);
    for (let v = 0; v < mesh.vertexCount; v++) {
      const x = mesh.positions[v * 3];
      const y = mesh.positions[v * 3 + 1];
      const z = mesh.positions[v * 3 + 2];
      if (Math.abs(y) > 2) continue;
      // Either side of the join the halves stand exactly where they stood…
      if (Math.abs(x) > 0.3) expect(z).toBe(floor(x));
      // …and on it nothing stands above the higher half or lies below the lower one.
      else {
        expect(z).toBeLessThan(0.25 + 0.03);
        expect(z).toBeGreaterThan(-0.03);
      }
    }
  });

  it('takes the facets of a coarse cylinder for what they are, not for seams', () => {
    // A 24-sided round of radius 14: a crease every 3.7 mm, standing 0.12 mm proud of the chords.
    const R = 14;
    const sides = 24;
    const xs: number[] = [];
    for (let k = -3; k <= 3; k++) xs.push(R * Math.sin((k * 2 * Math.PI) / sides));
    const mesh = createSeamBrushMesh(grid(xs, steps(-8, 8, 1), (x) => Math.sqrt(R * R - x * x) - R));
    for (const mode of ['shave', 'fill'] as const) {
      for (const radiusMm of [1, 2, 4]) {
        for (let x = -5; x <= 5; x += 0.5) {
          const slope = -x / Math.sqrt(R * R - x * x);
          const length = Math.hypot(slope, 1);
          for (let y = -3; y <= 3; y += 3) {
            const z = Math.sqrt(R * R - x * x) - R;
            seamBrushDab(mesh, [x, y, z], [-slope / length, 0, 1 / length], { radiusMm, stepMm: 0.1, mode });
          }
        }
      }
    }
    expect(movedCount(mesh)).toBe(0);
  });

  it('does not take an edge between two faces for a ridge, nor an inside corner for a groove', () => {
    // A roof and a valley, their faces 22° either side of level; the brush runs along the fold and beside it.
    for (const fold of [-0.4, 0.4]) {
      const mesh = createSeamBrushMesh(sheet((x) => fold * Math.abs(x)));
      for (const mode of ['shave', 'fill'] as const) {
        for (const radiusMm of [1, 2, 4]) {
          for (const x of [0, 0.5, 1.5]) {
            for (let y = -4; y <= 4; y += 1) {
              seamBrushDab(mesh, [x, y, fold * x], UP, { radiusMm, stepMm: 0.1, mode });
            }
          }
        }
      }
      expect(movedCount(mesh)).toBe(0);
    }
  });

  it('follows a curved surface instead of flattening it', () => {
    const R = 14;
    const round = (x: number) => Math.sqrt(R * R - x * x) - R;
    // A ridge running round the curve (along X), so every dab sits on curved ground.
    const mesh = createSeamBrushMesh(sheet((x, y) => round(x) + (Math.abs(y) < 0.3 ? 0.2 : 0)));
    const options: SeamBrushOptions = { radiusMm: 3, stepMm: 0.05, mode: 'shave' };
    for (let pass = 0; pass < 8; pass++) {
      for (let x = -4; x <= 4; x += 0.75) {
        const slope = -x / Math.sqrt(R * R - x * x);
        const length = Math.hypot(slope, 1);
        seamBrushDab(mesh, [x, 0, round(x) + 0.2], [-slope / length, 0, 1 / length], options);
      }
    }
    let worst = 0;
    for (let v = 0; v < mesh.vertexCount; v++) {
      const x = mesh.positions[v * 3];
      if (Math.abs(x) > 3.5 || Math.abs(mesh.positions[v * 3 + 1]) > 2) continue;
      worst = Math.max(worst, Math.abs(mesh.positions[v * 3 + 2] - round(x)));
    }
    expect(worst).toBeLessThan(0.03);
  });

  it('does not pull the back of a thin wall through it', () => {
    // A grooved top sheet, and a second sheet 1 mm below it facing the other way.
    const top = sheet((x) => (Math.abs(x) < 0.3 ? -0.4 : 0));
    const under = sheet(() => -1);
    for (let t = 0; t < under.length; t += 9) {
      for (let k = 0; k < 3; k++) {
        const swap = under[t + 3 + k];
        under[t + 3 + k] = under[t + 6 + k];
        under[t + 6 + k] = swap;
      }
    }
    const soup = new Float32Array(top.length + under.length);
    soup.set(top);
    soup.set(under, top.length);
    const mesh = createSeamBrushMesh(soup);
    // Kept clear of the sheets' open edges, where nothing lies above the lower one.
    strokeAlongY(mesh, { radiusMm: 3, stepMm: 0.1, mode: 'fill' }, 8, 0, 3);
    // The groove is filled…
    expect(extremes(mesh, 2, 2).min).toBeCloseTo(-1, 5);
    let deepest = 0;
    for (let v = 0; v < mesh.vertexCount; v++) {
      if (mesh.origin[v * 3 + 2] > -0.9 && Math.abs(mesh.positions[v * 3 + 1]) < 2) {
        deepest = Math.min(deepest, mesh.positions[v * 3 + 2]);
      }
    }
    expect(deepest).toBeGreaterThan(-0.02);
    // …and the sheet underneath has not moved.
    for (let v = 0; v < mesh.vertexCount; v++) {
      if (mesh.origin[v * 3 + 2] < -0.9) expect(mesh.positions[v * 3 + 2]).toBe(-1);
    }
  });

  describe('on a mesh of long thin triangles', () => {
    // What an exact join leaves: a ridge between two flats, each a pair of triangles 16 mm long.
    const xs = [-8, -0.35, -0.3, 0.3, 0.35, 8];
    const coarse = () => grid(xs, [-8, 8], (_x, _y, column) => (column === 2 || column === 3 ? 0.2 : 0));

    it('splits the triangles under the brush, so the ridge can be shaved where it was stroked', () => {
      const mesh = createSeamBrushMesh(coarse());
      expect(mesh.triangleCount).toBe(10);
      strokeAlongY(mesh, shave, 8, 0.2, 3);
      expect(mesh.triangleCount).toBeGreaterThan(200);
      // Level where the brush went…
      expect(extremes(mesh, 3, 2).max).toBeLessThan(0.02);
      // …and the ridge still stands where it did not.
      expect(extremes(mesh, 0.3, 8).max).toBeCloseTo(0.2, 5);
      let farEnd = -Infinity;
      for (let v = 0; v < mesh.vertexCount; v++) {
        if (Math.abs(mesh.positions[v * 3]) < 0.31 && Math.abs(mesh.positions[v * 3 + 1]) > 7) {
          farEnd = Math.max(farEnd, mesh.positions[v * 3 + 2]);
        }
      }
      expect(farEnd).toBeCloseTo(0.2, 5);
    });

    it('opens nothing up: every split edge is split on both sides', () => {
      const before = coarse();
      const mesh = createSeamBrushMesh(before.slice());
      strokeAlongY(mesh, shave, 4, 0.2, 3);
      // Only the rim of the sheet is open, before and after.
      for (const [a, b] of openEdges(seamBrushSoup(mesh))) {
        const onRim = (p: number[]) => Math.abs(Math.abs(p[0]) - 8) < 1e-4 || Math.abs(Math.abs(p[1]) - 8) < 1e-4;
        expect(onRim(a) && onRim(b)).toBe(true);
      }
    });

    it('leaves a clean surface exactly as it is, not even split', () => {
      const flat = grid([-8, 8], [-8, 8], () => 0);
      const mesh = createSeamBrushMesh(flat.slice());
      expect(strokeAlongY(mesh, shave, 1)).toBe(0);
      expect(strokeAlongY(mesh, fill, 1)).toBe(0);
      expect(Array.from(seamBrushSoup(mesh))).toEqual(Array.from(flat));
    });

    it('splits under the brush and no further: the flats keep their shape, and stay coarse away from it', () => {
      const before = coarse();
      const mesh = createSeamBrushMesh(before.slice());
      strokeAlongY(mesh, shave, 8, 0.2, 3);
      const after = seamBrushSoup(mesh);
      const flats = (soup: Float32Array, beyond: number) => {
        const kept: number[] = [];
        for (let t = 0; t < soup.length; t += 9) {
          if ([0, 3, 6].every((k) => Math.abs(soup[t + k]) >= beyond - 1e-6)) kept.push(...soup.subarray(t, t + 9));
        }
        return new Float32Array(kept);
      };
      // Splitting changes no shape by itself, so the flats still cover what they did, at the height they were.
      const flat = flats(after, 0.35);
      expect(area(flat)).toBeCloseTo(area(flats(before, 0.35)), 3);
      for (let i = 2; i < flat.length; i += 3) expect(flat[i]).toBe(0);
      // Fine under the 2 mm brush, and only a handful of triangles beyond it.
      expect(flat.length / 9).toBeGreaterThan(200);
      expect(flats(after, 4).length / 9).toBeLessThan(40);
    });
  });

  it('takes strokes back in turn, splits and all', () => {
    const xs = [-8, -0.35, -0.3, 0.3, 0.35, 8];
    const given = grid(xs, [-8, 8], (_x, _y, column) => (column === 2 || column === 3 ? 0.2 : 0));
    const mesh = createSeamBrushMesh(given.slice());
    const strokes: SeamBrushStroke[] = [];
    for (let pass = 0; pass < 3; pass++) {
      const stroke = beginSeamBrushStroke(mesh);
      for (let y = -3; y <= 3; y += 0.5) seamBrushDab(mesh, [0, y, 0.2], UP, shave, stroke);
      strokes.push(stroke);
    }
    expect(movedCount(mesh)).toBeGreaterThan(0);
    const afterTwo = extremes(mesh, 0.3, 2).max;
    expect(afterTwo).toBeLessThan(0.2);
    undoSeamBrushStroke(mesh, strokes.pop() as SeamBrushStroke);
    // One stroke back: higher than it was, not yet where it started.
    expect(extremes(mesh, 0.3, 2).max).toBeGreaterThan(afterTwo);
    expect(movedCount(mesh)).toBeGreaterThan(0);
    while (strokes.length > 0) undoSeamBrushStroke(mesh, strokes.pop() as SeamBrushStroke);
    // Every vertex is where it started — those the splits made, in the plane of the triangle they split.
    expect(movedCount(mesh)).toBe(0);
    expect(area(seamBrushSoup(mesh))).toBeCloseTo(area(given), 3);
  });

  it('finds what the pointer is over, and which way it faces', () => {
    const mesh = createSeamBrushMesh(sheet((x) => (Math.abs(x) < 0.3 ? 0.2 : 0)));
    // Straight down onto the ridge; at a slant onto the flat beside it; past the edge of the sheet.
    expect(seamBrushPick(mesh, [0, 1, 10], [0, 0, -1])).toEqual({ point: [0, 1, expect.closeTo(0.2, 5)], normal: [0, 0, 1] });
    const slanted = seamBrushPick(mesh, [7, 1, 5], [-1, 0, -1]);
    expect(slanted?.point[0]).toBeCloseTo(2, 5);
    expect(slanted?.point[2]).toBeCloseTo(0, 5);
    expect(slanted?.normal).toEqual([0, 0, 1]);
    // Seen from underneath, the face is turned towards the eye.
    expect(seamBrushPick(mesh, [2, 1, -5], [0, 0, 1])?.normal[2]).toBe(-1);
    expect(seamBrushPick(mesh, [20, 1, 10], [0, 0, -1])).toBeNull();
  });

  it('keeps its shading the same as a full re-shade would give', () => {
    const mesh = createSeamBrushMesh(sheet((x) => (Math.abs(x) < 0.3 ? 0.2 : 0), 4));
    let moved = 0;
    for (let y = -2; y <= 2; y += 0.5) moved += seamBrushDab(mesh, [0, y, 0.2], UP, shave).vertices.length;
    expect(moved).toBeGreaterThan(0);
    const soup = seamBrushSoup(mesh);
    const full = smoothNormals(soup);
    for (let i = 0; i < full.length; i++) expect(mesh.normals[i]).toBeCloseTo(full[i], 3);
  });
});

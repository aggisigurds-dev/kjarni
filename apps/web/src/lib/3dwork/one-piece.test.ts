// @vitest-environment node
import Module, { type ManifoldToplevel } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { kernelToSoup } from './kernel-prep';
import { makeOnePiece, type OnePiecePipe } from './one-piece';

let wasm: ManifoldToplevel;

beforeAll(async () => {
  wasm = await Module();
  wasm.setup();
});

function moved(soup: Float32Array, dx: number, dy = 0, dz = 0): Float32Array {
  const out = soup.slice();
  for (let i = 0; i < out.length; i += 3) {
    out[i] += dx;
    out[i + 1] += dy;
    out[i + 2] += dz;
  }
  return out;
}

/** A 40 mm cube centred on the origin. */
const block = () => moved(cubeSoup(40), -20, -20, -20);

/** A closed box between two corners. */
function box(min: [number, number, number], max: [number, number, number]): Float32Array {
  const unit = cubeSoup(1);
  const out = new Float32Array(unit.length);
  for (let i = 0; i < unit.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) out[i + axis] = min[axis] + unit[i + axis] * (max[axis] - min[axis]);
  }
  return out;
}

/** The same triangles wound the other way, as an inside-out export has them. */
function insideOut(soup: Float32Array): Float32Array {
  const out = soup.slice();
  for (let t = 0; t < out.length; t += 9) {
    for (let c = 0; c < 3; c++) {
      const swap = out[t + 3 + c];
      out[t + 3 + c] = out[t + 6 + c];
      out[t + 6 + c] = swap;
    }
  }
  return out;
}

/** Column-major translation, the layout three.js Matrix4.elements uses. */
const translate = (x: number, y: number, z: number) => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1,
];

const pipe = (diameter: number, length: number, matrix: number[]): OnePiecePipe => ({
  name: `pipe ${diameter}`,
  diameter,
  length,
  matrix,
});

const options = { gapMm: 0, crumbMm3: 0, seamMm: 0 };

describe('makeOnePiece', () => {
  it('joins two overlapping bodies into one solid', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [
        { name: 'left', soup: cubeSoup(10) },
        { name: 'right', soup: moved(cubeSoup(10), 5) },
      ],
      pipes: [],
      options,
    });
    expect(report.pieces).toBe(1);
    expect(report.volume).toBeCloseTo(1500, 2);
    expect(report.bodies.map((body) => body.outcome)).toEqual(['as-is', 'as-is']);
  });

  it('fuses overlapping shells that arrived inside a single body', () => {
    const soup = new Float32Array([...cubeSoup(10), ...moved(cubeSoup(10), 5)]);
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'stacked', soup }],
      pipes: [],
      options,
    });
    expect(report.pieces).toBe(1);
    expect(report.volume).toBeCloseTo(1500, 2);
    expect(report.bodies[0].detail).toContain('2 shells');
  });

  it('closes a hairline seam between halves that do not quite touch', () => {
    const halves = [
      { name: 'left', soup: cubeSoup(10) },
      { name: 'right', soup: moved(cubeSoup(10), 10.05) },
    ];
    const apart = makeOnePiece(wasm, { bodies: halves, pipes: [], options });
    expect(apart.report.pieces).toBe(2);

    const closed = makeOnePiece(wasm, {
      bodies: halves.map((half) => ({ ...half, soup: half.soup.slice() })),
      pipes: [],
      options: { ...options, seamMm: 0.2 },
    });
    expect(closed.report.pieces).toBe(1);
    expect(closed.report.seamMm).toBe(0.2);
    expect(closed.report.seamsBridged).toBe(1);
    // The halves keep their exact size; only the 0.05 mm gap, and a hair
    // either side of it, is filled.
    expect(closed.report.volume).toBeGreaterThan(2000);
    expect(closed.report.volume).toBeLessThan(2010);
  });

  it('fills a pocket sealed inside a body', () => {
    const soup = new Float32Array([...cubeSoup(10), ...insideOut(moved(cubeSoup(4), 3, 3, 3))]);
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'hollow', soup }],
      pipes: [],
      options,
    });
    expect(report.volume).toBeCloseTo(1000, 2);
    expect(report.pocketsFilled).toBe(1);
  });

  it('turns an inside-out shell sitting in a hollow, rather than treating it as a pocket', () => {
    // A square tube: its bounding box holds the little cube, its material does not.
    const block = wasm.Manifold.cube([10, 10, 10]);
    const channel = wasm.Manifold.cube([6, 6, 12]).translate([2, 2, -1]);
    const tube = block.subtract(channel);
    const mesh = tube.getMesh();
    const tubeSoup = kernelToSoup(mesh.vertProperties, mesh.triVerts);
    for (const manifold of [block, channel, tube]) manifold.delete();

    const soup = new Float32Array([...tubeSoup, ...insideOut(moved(cubeSoup(2), 4, 4, 4))]);
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'tube and stray', soup }],
      pipes: [],
      options,
    });
    expect(report.pocketsFilled).toBe(0);
    expect(report.pieces).toBe(2);
    expect(report.volume).toBeCloseTo(640 + 8, 2);
  });

  it('turns a body that was exported inside out instead of losing it', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'inverted', soup: insideOut(cubeSoup(10)) }],
      pipes: [],
      options,
    });
    expect(report.volume).toBeCloseTo(1000, 2);
    expect(report.bodies[0].detail).toContain('1 inside-out shell turned');
  });

  it('bores a pipe through with the fit gap added to its diameter', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [pipe(10, 60, translate(0, 0, 0))],
      options: { ...options, gapMm: 0.4 },
    });
    const bore = Math.PI * 5.2 ** 2 * 40;
    // Facets sit inside the true circle, so slightly less than a round bore comes out.
    expect(report.volume).toBeGreaterThan(64000 - bore);
    expect(report.volume).toBeLessThan(64000 - bore * 0.995);
    expect(report.pieces).toBe(1);
  });

  it('cuts only where the pipe actually is', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [pipe(10, 60, translate(0, 40, 0))],
      options,
    });
    expect(report.volume).toBeCloseTo(64000, 2);
  });

  it('turns the bore with the pipe', () => {
    // A 40 × 40 × 10 slab. The pipe is rotated from +X onto +Z, so the bore
    // should pass through the slab's thin side: 10 mm of a ⌀10 cylinder.
    const slab = moved(cubeSoup(40), -20, -20, -20).map((value, index) =>
      index % 3 === 2 ? value / 4 : value
    );
    const alongZ = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'slab', soup: slab }],
      pipes: [pipe(10, 60, alongZ)],
      options,
    });
    expect(report.volume).toBeGreaterThan(16000 - Math.PI * 25 * 10);
    expect(report.volume).toBeLessThan(16000 - Math.PI * 25 * 10 * 0.99);
  });

  it('caps an open body before joining it, and says so', () => {
    const cube = cubeSoup(10);
    const open = new Float32Array([...cube.subarray(0, 18), ...cube.subarray(36)]);
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'open', soup: open }],
      pipes: [],
      options,
    });
    expect(report.bodies[0].outcome).toBe('capped');
    expect(report.volume).toBeCloseTo(1000, 2);
  });

  it('drops loose bits below the size limit and counts the rest as pieces', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [
        { name: 'body', soup: cubeSoup(10) },
        { name: 'crumb', soup: moved(cubeSoup(1), 30) },
      ],
      pipes: [],
      options: { ...options, crumbMm3: 5 },
    });
    expect(report.pieces).toBe(1);
    expect(report.crumbsRemoved).toBe(1);
    expect(report.volume).toBeCloseTo(1000, 2);
  });

  it('returns the mesh it reports on', () => {
    const { soup, report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [],
      options,
    });
    expect(soup.length / 9).toBe(report.triangles);
    expect(report.triangles).toBeGreaterThanOrEqual(12);
  });

  it('cuts a cutter part out exactly', () => {
    // A 10 mm cube reaching 5 mm into the block's +X face.
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [],
      cutters: [{ name: 'cube', soup: moved(cubeSoup(10), 15, -5, -5) }],
      options,
    });
    expect(report.volume).toBeCloseTo(64000 - 500, 2);
    expect(report.pieces).toBe(1);
    expect(report.cutters.map((cutter) => cutter.outcome)).toEqual(['as-is']);
  });

  it('grows the cutter by the clearance', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [],
      cutters: [{ name: 'cube', soup: moved(cubeSoup(10), 15, -5, -5) }],
      options: { ...options, clearanceMm: 0.5 },
    });
    expect(report.volume).toBeLessThan(64000 - 500);
    expect(report.volume).toBeGreaterThan(64000 - 5.5 * 11 * 11);
  });

  it('keeps a hollow the cutter leaves sealed inside', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [],
      cutters: [{ name: 'core', soup: moved(cubeSoup(10), -5, -5, -5) }],
      options,
    });
    expect(report.volume).toBeCloseTo(64000 - 1000, 2);
    expect(report.pocketsFilled).toBe(0);
    expect(report.pieces).toBe(1);
  });

  it('caps an open cutter the same way as a body', () => {
    const cube = moved(cubeSoup(10), 15, -5, -5);
    const open = new Float32Array([...cube.subarray(0, 18), ...cube.subarray(36)]);
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'block', soup: block() }],
      pipes: [],
      cutters: [{ name: 'open cube', soup: open }],
      options,
    });
    expect(report.cutters[0].outcome).toBe('capped');
    expect(report.volume).toBeCloseTo(64000 - 500, 2);
  });

  /** A closed cube with one corner sent to infinity: no exact repair makes that a solid. */
  function corrupt(): Float32Array {
    const soup = cubeSoup(10);
    for (let i = 0; i < soup.length; i += 3) {
      if (soup[i] === 10 && soup[i + 1] === 10 && soup[i + 2] === 10) soup[i] = Infinity;
    }
    return soup;
  }

  it('closes cubes that share only an edge exactly, with no voxels', () => {
    const bowtie = new Float32Array([...cubeSoup(10), ...moved(cubeSoup(10), 10, 10)]);
    const { report } = makeOnePiece(wasm, {
      bodies: [{ name: 'bowtie', soup: bowtie }],
      pipes: [],
      options: { ...options, allowRebuild: false },
    });
    expect(report.bodies[0].outcome).not.toBe('rebuilt');
    expect(report.volume).toBeCloseTo(2000, 2);
  });

  it('leaves out a body it cannot close exactly when rebuilding is off, rather than melting it', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [
        { name: 'block', soup: moved(cubeSoup(10), 50) },
        { name: 'broken', soup: corrupt() },
      ],
      pipes: [],
      options: { ...options, allowRebuild: false },
    });
    expect(report.bodies.map((body) => body.outcome)).toEqual(['as-is', 'skipped']);
    expect(report.volume).toBeCloseTo(1000, 2);
  });

  it('names the body that could not be closed when nothing else is left', () => {
    expect(() =>
      makeOnePiece(wasm, {
        bodies: [{ name: 'broken', soup: corrupt() }],
        pipes: [],
        options: { ...options, allowRebuild: false },
      })
    ).toThrow('broken could not be closed');
  });

  // A box is all corners, and a corner grows only about 0.58 of the distance, so
  // these seams are set a little wider than the gaps they close.
  it('closes a seam wider than half the setting, instead of leaving a sliver floating in it', () => {
    const { report } = makeOnePiece(wasm, {
      bodies: [
        { name: 'left', soup: cubeSoup(10) },
        { name: 'right', soup: moved(cubeSoup(10), 10.15) },
      ],
      pipes: [],
      options: { ...options, seamMm: 0.3 },
    });
    expect(report.pieces).toBe(1);
    expect(report.seamsBridged).toBe(1);
    expect(report.volume).toBeGreaterThan(2000);
    expect(report.volume).toBeLessThan(2030);
  });

  it('leaves nothing floating in a gap a little wider than the seam', () => {
    // Grown by the seam and half of it, the cubes still overlap across a 0.3 gap,
    // but only in slabs that touch neither cube. Kept, those came out as two
    // extra pieces.
    const { report } = makeOnePiece(wasm, {
      bodies: [
        { name: 'left', soup: cubeSoup(10) },
        { name: 'right', soup: moved(cubeSoup(10), 10.3) },
      ],
      pipes: [],
      options: { ...options, seamMm: 0.3 },
    });
    expect(report.pieces).toBe(2);
    expect(report.seamsBridged).toBe(0);
    expect(report.volume).toBeCloseTo(2000, 0);
  });

  it('joins halves again when the bore takes away the only thing holding them together', () => {
    const run = (seamMm: number) =>
      makeOnePiece(wasm, {
        bodies: [
          { name: 'left', soup: box([-20, -10, -10], [20, 10, -0.075]) },
          { name: 'right', soup: box([-20, -10, 0.075], [20, 10, 10]) },
          // The only link between the halves, right where the pipe bores through.
          { name: 'link', soup: box([-2, -2, -1], [2, 2, 1]) },
        ],
        pipes: [pipe(8, 60, translate(0, 0, 0))],
        options: { ...options, seamMm },
      }).report;
    expect(run(0).pieces).toBe(2);
    const joined = run(0.3);
    expect(joined.pieces).toBe(1);
    // The seam is filled around the bore, not inside it.
    const halves = 40 * 20 * 19.85;
    const bore = Math.PI * 16 * 40;
    expect(joined.volume).toBeGreaterThan(halves - bore);
    expect(joined.volume).toBeLessThan(halves - bore + 480 * 0.4);
  });
});

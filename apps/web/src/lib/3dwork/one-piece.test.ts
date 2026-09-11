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
});

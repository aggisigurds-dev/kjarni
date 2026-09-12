import { describe, expect, it } from 'vitest';
import { findBoreAxis } from './bore-axis';

type Vec3 = [number, number, number];

/** A closed box between two corners, as triangles wound outward. */
function box(min: Vec3, max: Vec3): number[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corner: Vec3[] = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
    [0, 4, 7, 3],
    [1, 2, 6, 5],
  ];
  const out: number[] = [];
  for (const [a, b, c, d] of faces) {
    out.push(...corner[a], ...corner[b], ...corner[c], ...corner[a], ...corner[c], ...corner[d]);
  }
  return out;
}

const LENGTH = 60;
const OUTER = 20;
const BORE_HALF = 8;
const BORE_Y = 3;
const BORE_Z = -2;

/**
 * A 120 mm square tube along X with a 16 mm square bore that is not in the
 * middle of the tube, built from four walls the way halves arrive.
 */
function tube(options: { seam?: number } = {}): number[] {
  const y0 = BORE_Y - BORE_HALF;
  const y1 = BORE_Y + BORE_HALF;
  const z0 = BORE_Z - BORE_HALF;
  const z1 = BORE_Z + BORE_HALF;
  const seam = options.seam ?? 0;
  const right =
    seam > 0
      ? [
          ...box([-LENGTH, y0, z1], [LENGTH, BORE_Y - seam / 2, OUTER]),
          ...box([-LENGTH, BORE_Y + seam / 2, z1], [LENGTH, y1, OUTER]),
        ]
      : box([-LENGTH, y0, z1], [LENGTH, y1, OUTER]);
  return [
    ...box([-LENGTH, y1, -OUTER], [LENGTH, OUTER, OUTER]),
    ...box([-LENGTH, -OUTER, -OUTER], [LENGTH, y0, OUTER]),
    ...box([-LENGTH, y0, -OUTER], [LENGTH, y1, z0]),
    ...right,
  ];
}

/** A block standing on top of the tube along half its length, pulling its bounding box upward. */
const frame = () => box([-LENGTH / 2, OUTER, -OUTER], [LENGTH / 2, OUTER + 30, OUTER]);

describe('findBoreAxis', () => {
  it('finds the bore, not the middle of the bounding box', () => {
    const bore = findBoreAxis(new Float32Array([...tube(), ...frame()]), 0);
    expect(bore).not.toBeNull();
    expect(bore?.center[0]).toBeCloseTo(BORE_Y, 1);
    expect(bore?.center[1]).toBeCloseTo(BORE_Z, 1);
    expect(bore?.diameter).toBeCloseTo(2 * BORE_HALF, 1);
    expect(bore?.clearDiameter).toBeCloseTo(2 * BORE_HALF, 1);
  });

  it('reads two halves with a hairline seam between them as one tube', () => {
    const bore = findBoreAxis(new Float32Array(tube({ seam: 0.1 })), 0);
    expect(bore?.center[0]).toBeCloseTo(BORE_Y, 1);
    expect(bore?.center[1]).toBeCloseTo(BORE_Z, 1);
  });

  it('keeps to the long bore when a short stretch of it is narrower', () => {
    // A 3 mm ledge along the last sixth of the bore's roof.
    const ledge = box([40, BORE_Y + BORE_HALF - 3, -OUTER], [LENGTH, BORE_Y + BORE_HALF, OUTER]);
    const bore = findBoreAxis(new Float32Array([...tube(), ...ledge]), 0);
    expect(bore?.center[0]).toBeCloseTo(BORE_Y, 1);
    expect(bore?.center[1]).toBeCloseTo(BORE_Z, 1);
    expect(bore?.diameter).toBeCloseTo(2 * BORE_HALF, 1);
    // A pipe on that axis clears the ledge only if it is 10 mm or less.
    expect(bore?.clearDiameter).toBeCloseTo(10, 1);
  });

  it('finds nothing when the part cannot be seen through that way', () => {
    expect(findBoreAxis(new Float32Array(box([-30, -10, -10], [30, 10, 10])), 0)).toBeNull();
    // An end wall a sixth of the length thick, so the sections cannot miss it.
    const capped = [...tube(), ...box([LENGTH - 20, -OUTER, -OUTER], [LENGTH, OUTER, OUTER])];
    expect(findBoreAxis(new Float32Array(capped), 0)).toBeNull();
  });

  it('works along any axis', () => {
    // The same tube stood up along Y: (x, y, z) → (y, x, z).
    const soup = new Float32Array(tube());
    for (let i = 0; i < soup.length; i += 3) {
      const x = soup[i];
      soup[i] = soup[i + 1];
      soup[i + 1] = x;
    }
    const bore = findBoreAxis(soup, 1);
    expect(bore?.center[0]).toBeCloseTo(BORE_Y, 1);
    expect(bore?.center[1]).toBeCloseTo(BORE_Z, 1);
  });
});

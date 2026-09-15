import { describe, expect, it } from 'vitest';
import {
  DOWEL_WALL_MM,
  dowelHoles,
  pinLength,
  pinSoup,
  placeDowels,
  pointOnPlane,
} from './dowels';
import { computeBounds } from './mesh';

/** A square rim of the given half-width, centred on the origin. */
const square = (half: number): [number, number][] => [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half],
];

const spec = { diameter: 4, depth: 8, count: 3, clearance: 0.3 };

describe('placeDowels', () => {
  it('spreads pins over a face, clear of its edges', () => {
    const pins = placeDowels([square(20)], { diameter: 4, count: 3 });

    expect(pins).toHaveLength(3);
    const margin = 2 + DOWEL_WALL_MM;
    for (const [u, v] of pins) {
      expect(Math.max(Math.abs(u), Math.abs(v))).toBeLessThanOrEqual(20 - margin + 1e-9);
    }
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        expect(Math.hypot(pins[i][0] - pins[j][0], pins[i][1] - pins[j][1])).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('keeps pins in the wall of a ring, never in its hole', () => {
    // A 10 mm wall around a 20 mm hole.
    const pins = placeDowels([square(20), square(10)], { diameter: 3, count: 4 });

    expect(pins.length).toBeGreaterThanOrEqual(2);
    const margin = 1.5 + DOWEL_WALL_MM;
    for (const [u, v] of pins) {
      const reach = Math.max(Math.abs(u), Math.abs(v));
      expect(reach).toBeGreaterThanOrEqual(10 + margin - 1e-9);
      expect(reach).toBeLessThanOrEqual(20 - margin + 1e-9);
    }
  });

  it('places nothing where the wall is too thin', () => {
    // A 4 mm wall cannot take a ⌀4 pin with material either side of it.
    expect(placeDowels([square(20), square(16)], { diameter: 4, count: 2 })).toEqual([]);
  });

  it('puts a lone pin where there is most room', () => {
    const [pin] = placeDowels([square(20)], { diameter: 4, count: 1 });
    expect(Math.abs(pin[0])).toBeLessThan(2);
    expect(Math.abs(pin[1])).toBeLessThan(2);
  });

  it('has nothing to say about an empty cut', () => {
    expect(placeDowels([], { diameter: 4, count: 3 })).toEqual([]);
  });
});

describe('pointOnPlane', () => {
  it('puts (u, v) on the two axes left when the cut axis is dropped', () => {
    expect(pointOnPlane('x', 7, [1, 2])).toEqual([7, 1, 2]);
    expect(pointOnPlane('y', 7, [1, 2])).toEqual([1, 7, 2]);
    expect(pointOnPlane('z', 7, [1, 2])).toEqual([1, 2, 7]);
  });
});

describe('dowelHoles', () => {
  it('drills each half from the cut face, a little past it', () => {
    const { lower, upper } = dowelHoles([[3, 5]], 'y', 10, spec);

    expect(lower).toHaveLength(1);
    expect(upper).toHaveLength(1);
    expect(lower[0].diameter).toBeCloseTo(4.3, 6);
    expect(lower[0].length).toBeCloseTo(9, 6);
    // Column-major: the translation is elements 12–14. On a Y cut, (u, v) are (x, z).
    expect(lower[0].matrix[12]).toBeCloseTo(3, 6);
    expect(lower[0].matrix[13]).toBeCloseTo(6.5, 6);
    expect(lower[0].matrix[14]).toBeCloseTo(5, 6);
    expect(upper[0].matrix[13]).toBeCloseTo(13.5, 6);
  });

  it('turns the bore onto the cut axis', () => {
    // The kernel's stock runs along +X; on a Z cut the frame must send +X to ±Z.
    const { lower } = dowelHoles([[0, 0]], 'z', 0, spec);
    const column = lower[0].matrix.slice(0, 3);
    expect(column[0]).toBeCloseTo(0, 6);
    expect(column[1]).toBeCloseTo(0, 6);
    expect(Math.abs(column[2])).toBeCloseTo(1, 6);
  });
});

describe('pinSoup', () => {
  it('is a cylinder along the cut axis, a little shorter than the two holes together', () => {
    expect(pinLength(spec)).toBe(15);

    const size = computeBounds(pinSoup(spec, 'z')).size;
    expect(size[2]).toBeCloseTo(15, 5);
    expect(size[0]).toBeCloseTo(4, 3);
    expect(size[1]).toBeCloseTo(4, 3);

    const alongX = computeBounds(pinSoup(spec, 'x')).size;
    expect(alongX[0]).toBeCloseTo(15, 5);
    expect(alongX[1]).toBeCloseTo(4, 3);
  });
});

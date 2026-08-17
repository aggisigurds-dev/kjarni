import { describe, expect, it } from 'vitest';
import { DEFAULT_SHELL, shellSurface } from './shell';
import { computeBounds, inspect } from './mesh';
import { cubeSoup } from './fixtures';

/** A flat open square in the XZ plane, two triangles, no thickness. */
function plate(size = 10): Float32Array {
  const h = size / 2;
  return new Float32Array([
    -h, 0, -h, h, 0, -h, h, 0, h,
    -h, 0, -h, h, 0, h, -h, 0, h,
  ]);
}

describe('shellSurface on a closed part', () => {
  it('hollows it while leaving the outside untouched', () => {
    const solid = cubeSoup(40);
    const before = computeBounds(solid);
    const { soup, report } = shellSurface(solid, { thickness: 2, direction: 'inward' });
    const after = computeBounds(soup);

    expect(report.wasClosed).toBe(true);
    expect(report.rimEdges).toBe(0);
    // The outside is the input's own surface, so not a micron moves.
    expect(after.size[0]).toBeCloseTo(before.size[0], 6);
    expect(after.size[1]).toBeCloseTo(before.size[1], 6);
    expect(after.size[2]).toBeCloseTo(before.size[2], 6);
  });

  it('leaves a closed solid with a closed cavity', () => {
    const topology = inspect(shellSurface(cubeSoup(40), { thickness: 2, direction: 'inward' }).soup);
    expect(topology.boundaryEdges).toBe(0);
    expect(topology.watertight).toBe(true);
  });

  it('leaves a wall of the thickness asked for, not a thinner one', () => {
    // The test the mitre exists for. A corner normal points down the diagonal,
    // so sliding corners along it by 2 mm would leave a 1.15 mm wall and a
    // 37.7 mm cavity. Mitred, the cavity is exactly 36 mm on every side.
    const { report } = shellSurface(cubeSoup(40), { thickness: 2, direction: 'inward' });

    // Tolerance is Float32 storage on a 17,000 mm³ figure, not slack: the bug
    // this guards against would land near 10,400.
    expect(report.wallVolume).toBeCloseTo(40 ** 3 - 36 ** 3, 1);
  });

  it('pads outward by the full thickness too', () => {
    const { soup } = shellSurface(cubeSoup(40), { thickness: 2, direction: 'outward' });
    expect(computeBounds(soup).size[0]).toBeCloseTo(44, 4);
  });

  it('warns when the wall cannot fit inside the part', () => {
    const { report } = shellSurface(cubeSoup(10), { thickness: 6, direction: 'inward' });
    expect(report.warnings.join(' ')).toMatch(/pass through each other/);
  });
});

describe('shellSurface on an open surface', () => {
  it('thickens a plate into a closed solid', () => {
    const { soup, report } = shellSurface(plate(10), { thickness: 2, direction: 'centred' });

    expect(report.wasClosed).toBe(false);
    // Four sides of a square rim.
    expect(report.rimEdges).toBe(4);
    expect(inspect(soup).watertight).toBe(true);
  });

  it('gives the plate exactly the thickness asked for', () => {
    const { soup } = shellSurface(plate(10), { thickness: 2, direction: 'centred' });
    const bounds = computeBounds(soup);

    expect(bounds.size[1]).toBeCloseTo(2, 6);
    // And does not spread it in the plane it already filled.
    expect(bounds.size[0]).toBeCloseTo(10, 6);
    expect(bounds.size[2]).toBeCloseTo(10, 6);
  });

  it('puts a centred wall half either side of where the surface was', () => {
    const { soup } = shellSurface(plate(10), { thickness: 2, direction: 'centred' });
    const bounds = computeBounds(soup);
    expect(bounds.min[1]).toBeCloseTo(-1, 6);
    expect(bounds.max[1]).toBeCloseTo(1, 6);
  });

  it('measures a plate wall as its area times its thickness', () => {
    const { report } = shellSurface(plate(10), { thickness: 2, direction: 'centred' });
    expect(report.wallVolume).toBeCloseTo(10 * 10 * 2, 3);
  });

  it('defaults to hollowing inward at 2 mm', () => {
    expect(DEFAULT_SHELL).toEqual({ thickness: 2, direction: 'inward' });
  });
});

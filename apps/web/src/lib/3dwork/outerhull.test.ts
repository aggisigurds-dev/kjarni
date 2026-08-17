import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { computeBounds } from './mesh';
import { outerHull } from './outerhull';

function shift(soup: Float32Array, dx: number, dy: number, dz: number): Float32Array {
  return Float32Array.from(soup, (v, i) => v + [dx, dy, dz][i % 3]);
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('outerHull', () => {
  it('drops a cube sealed inside another cube', () => {
    // A 10 mm cube floating in the middle of a 40 mm one: exactly the buried
    // wall left behind when two parts are merged without a boolean.
    const nested = concat(cubeSoup(40), shift(cubeSoup(10), 15, 15, 15));

    const { report } = outerHull(nested, { resolution: 60, sealMm: 0 });

    expect(report.trianglesBefore).toBe(24);
    expect(report.trianglesAfter).toBe(12);
    expect(report.trianglesRemoved).toBe(12);
  });

  it('keeps the original vertices untouched', () => {
    const outer = cubeSoup(40);
    const nested = concat(outer, shift(cubeSoup(10), 15, 15, 15));

    const { soup } = outerHull(nested, { resolution: 60, sealMm: 0 });

    // The surviving triangles are the input's own, not a resampled copy —
    // this is the whole point of the hull over a voxel rebuild.
    expect(Array.from(soup)).toEqual(Array.from(outer));
    expect(computeBounds(soup).size).toEqual([40, 40, 40]);
  });

  it('keeps every part that is visible from outside', () => {
    const pair = concat(cubeSoup(20), shift(cubeSoup(20), 40, 0, 0));

    const { report } = outerHull(pair, { resolution: 60, sealMm: 0 });

    expect(report.trianglesAfter).toBe(24);
    expect(report.trianglesRemoved).toBe(0);
  });

  it('reports the grid it used and never exceeds its ceiling', () => {
    const { report } = outerHull(cubeSoup(20), { resolution: 4000, sealMm: 0 });
    const cells = report.grid[0] * report.grid[1] * report.grid[2];

    expect(cells).toBeLessThanOrEqual(20_000_000);
    expect(report.voxelSize).toBeGreaterThan(0);
  });

  it('handles an empty mesh', () => {
    const { report } = outerHull(new Float32Array(0), { resolution: 32, sealMm: 0 });
    expect(report.trianglesAfter).toBe(0);
  });
});

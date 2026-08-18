import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { computeBounds, inspect } from './mesh';
import { boreCylinder } from './bore';

describe('boreCylinder', () => {
  it('removes the right amount of material for a through hole', () => {
    // 40 mm cube, 28 mm bore down Z through the middle.
    const { soup, report } = boreCylinder(cubeSoup(40), {
      axis: 'z',
      diameter: 28,
      center: [20, 20],
    });

    const before = Math.abs(inspect(cubeSoup(40)).signedVolume);
    const after = Math.abs(inspect(soup).signedVolume);
    const expected = Math.PI * 14 * 14 * 40; // 24,630 mm3

    expect(before).toBeCloseTo(64000, 0);
    // Within a percent: the rim is chorded, not exact.
    expect(before - after).toBeGreaterThan(expected * 0.97);
    expect(before - after).toBeLessThan(expected * 1.03);
    expect(report.wallTriangles).toBeGreaterThan(0);
    expect(report.encirclingLoops).toBe(2);
  });

  it('leaves the outside of the part untouched', () => {
    const { soup } = boreCylinder(cubeSoup(40), { axis: 'z', diameter: 28, center: [20, 20] });
    const bounds = computeBounds(soup);

    // The bore is interior, so the block keeps its exact outer dimensions.
    expect(bounds.size[0]).toBeCloseTo(40, 6);
    expect(bounds.size[1]).toBeCloseTo(40, 6);
    expect(bounds.size[2]).toBeCloseTo(40, 6);
  });

  it('makes a round hole regardless of how coarse the part is', () => {
    // The cube has just 12 triangles; the wall is generated, not resampled.
    const { soup } = boreCylinder(cubeSoup(40), {
      axis: 'z',
      diameter: 28,
      center: [20, 20],
      segments: 128,
    });

    // Wall and rim vertices are pinned onto the cylinder, so they should sit at
    // exactly 14 mm. The band is tight on purpose: a loose one also catches
    // subdivided face vertices that merely pass near the bore radius.
    let onWall = 0;
    let worst = 0;
    for (let i = 0; i + 2 < soup.length; i += 3) {
      const r = Math.hypot(soup[i] - 20, soup[i + 1] - 20);
      if (Math.abs(r - 14) < 0.02) {
        onWall++;
        worst = Math.max(worst, Math.abs(r - 14));
      }
    }
    expect(onWall).toBeGreaterThan(100);
    expect(worst).toBeLessThan(1e-4);
  });

  it('does nothing when the bore misses the part', () => {
    const soup = cubeSoup(40);
    const { soup: out, report } = boreCylinder(soup, {
      axis: 'z',
      diameter: 10,
      center: [500, 500],
    });

    expect(report.trianglesRemoved).toBe(0);
    expect(report.trianglesSplit).toBe(0);
    expect(Array.from(out)).toEqual(Array.from(soup));
  });

  it('handles an empty mesh', () => {
    const { report } = boreCylinder(new Float32Array(0), {
      axis: 'x', diameter: 28, center: [0, 0],
    });
    expect(report.trianglesAfter).toBe(0);
  });
});

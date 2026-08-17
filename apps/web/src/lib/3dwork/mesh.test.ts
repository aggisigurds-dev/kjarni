import { describe, expect, it } from 'vitest';
import { cubeSoup } from './fixtures';
import { autoFix, computeBounds, inspect, weld } from './mesh';

/** Reverse the winding of one triangle, leaving the rest alone. */
function flipTriangle(soup: Float32Array, index: number): Float32Array {
  const copy = Float32Array.from(soup);
  const at = index * 9;
  for (let c = 0; c < 3; c++) {
    const b = copy[at + 3 + c];
    copy[at + 3 + c] = copy[at + 6 + c];
    copy[at + 6 + c] = b;
  }
  return copy;
}

/** Drop one triangle to punch a three-edge hole in the shell. */
function removeTriangle(soup: Float32Array, index: number): Float32Array {
  const kept = Array.from(soup);
  kept.splice(index * 9, 9);
  return new Float32Array(kept);
}

describe('weld', () => {
  it('collapses a triangle soup back onto its shared corners', () => {
    const { mesh, welded } = weld(cubeSoup(10));

    expect(mesh.indices.length).toBe(36);
    expect(mesh.positions.length / 3).toBe(8);
    expect(welded).toBe(28);
  });

  it('merges corners that straddle a hash-cell boundary', () => {
    const soup = cubeSoup(10);
    const nudged = Float32Array.from(soup);
    nudged[0] = 1e-9; // same corner, a hair off

    expect(weld(nudged).mesh.positions.length / 3).toBe(8);
  });
});

describe('inspect', () => {
  it('reports a clean cube as watertight with the right volume and area', () => {
    const topology = inspect(cubeSoup(10));

    expect(topology.watertight).toBe(true);
    expect(topology.holes).toBe(0);
    expect(topology.signedVolume).toBeCloseTo(1000, 6);
    expect(topology.area).toBeCloseTo(600, 6);
  });

  it('counts a missing triangle as one three-edge hole', () => {
    const topology = inspect(removeTriangle(cubeSoup(10), 0));

    expect(topology.watertight).toBe(false);
    expect(topology.boundaryEdges).toBe(3);
    expect(topology.holes).toBe(1);
  });

  it('flags a reversed triangle as inconsistent winding', () => {
    const topology = inspect(flipTriangle(cubeSoup(10), 5));

    expect(topology.inconsistentEdges).toBeGreaterThan(0);
    expect(topology.watertight).toBe(false);
  });
});

describe('autoFix', () => {
  it('leaves a healthy mesh alone', () => {
    const { report } = autoFix(cubeSoup(10));

    expect(report.after.watertight).toBe(true);
    expect(report.flippedTriangles).toBe(0);
    expect(report.removedDegenerate).toBe(0);
    expect(report.filledHoles).toBe(0);
  });

  it('re-winds a flipped triangle', () => {
    const { report } = autoFix(flipTriangle(cubeSoup(10), 5));

    expect(report.before.inconsistentEdges).toBeGreaterThan(0);
    expect(report.after.inconsistentEdges).toBe(0);
    expect(report.after.watertight).toBe(true);
    expect(report.flippedTriangles).toBeGreaterThan(0);
  });

  it('turns an inside-out solid the right way round', () => {
    let soup = cubeSoup(10);
    for (let t = 0; t < 12; t++) soup = flipTriangle(soup, t);

    const { report } = autoFix(soup);

    expect(report.invertedSolid).toBe(true);
    expect(report.after.signedVolume).toBeCloseTo(1000, 6);
  });

  it('patches a hole and restores the enclosed volume', () => {
    const { report } = autoFix(removeTriangle(cubeSoup(10), 0));

    expect(report.before.holes).toBe(1);
    expect(report.filledHoles).toBe(1);
    expect(report.after.watertight).toBe(true);
    expect(report.after.signedVolume).toBeCloseTo(1000, 6);
  });

  it('drops zero-area and duplicated triangles', () => {
    const soup = cubeSoup(10);
    const withJunk = new Float32Array(soup.length + 18);
    withJunk.set(soup, 0);
    // A degenerate sliver, then a repeat of the first face.
    withJunk.set([0, 0, 0, 1, 1, 1, 2, 2, 2], soup.length);
    withJunk.set(soup.slice(0, 9), soup.length + 9);

    const { report } = autoFix(withJunk);

    expect(report.removedDegenerate).toBe(1);
    expect(report.removedDuplicateTriangles).toBe(1);
    expect(report.after.triangles).toBe(12);
  });

  it('sits the part on the table when asked', () => {
    const soup = cubeSoup(10);
    const lifted = Float32Array.from(soup, (value, i) => (i % 3 === 1 ? value + 55 : value));

    const fixed = autoFix(lifted, { dropToTable: true });

    expect(computeBounds(fixed.soup).min[1]).toBeCloseTo(0, 5);
  });
});

import { describe, expect, it } from 'vitest';

import { buildCornerWedge, concaveEdgesNear, findConcaveEdges } from './addvolume';

/**
 * An inner corner (kverk): a floor quad in z=0 (normal +Z) meeting a wall quad
 * in x=0 (normal +X) along the shared edge (0,0,0)-(0,10,0).
 */
function lCornerSoup(): Float32Array {
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  const A = [0, 0, 0];
  const B = [10, 0, 0];
  const C = [10, 10, 0];
  const D = [0, 10, 0];
  const F = [0, 10, 0];
  const G = [0, 10, 10];
  const H = [0, 0, 10];
  return Float32Array.from([
    ...tri(A, B, C),
    ...tri(A, C, D), // floor, +Z
    ...tri(A, F, G),
    ...tri(A, G, H), // wall, +X
  ]);
}

describe('addvolume', () => {
  it('finds the concave corner edge', () => {
    const edges = findConcaveEdges(lCornerSoup());
    expect(edges.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores flat / convex edges', () => {
    // a single flat quad has no concave fold
    const flat = Float32Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 0, 10, 10, 0, 0, 10, 0]);
    expect(findConcaveEdges(flat).length).toBe(0);
  });

  it('builds a wedge of solid triangles at the clicked corner', () => {
    const soup = lCornerSoup();
    const edges = concaveEdgesNear(soup, [0, 5, 0], 8);
    expect(edges.length).toBeGreaterThanOrEqual(1);
    const wedge = buildCornerWedge(edges, 2);
    expect(wedge.length).toBeGreaterThan(0);
    expect(wedge.length % 9).toBe(0);
    expect(Number.isFinite(wedge[0])).toBe(true);
  });

  it('returns nothing for an empty cluster', () => {
    expect(buildCornerWedge([], 2).length).toBe(0);
  });
});

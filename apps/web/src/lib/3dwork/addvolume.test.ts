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

  const axis = (soup: Float32Array, which: 0 | 1 | 2) => [...soup].filter((_, i) => i % 3 === which);

  it('finds a long corner from a tap near its end', () => {
    // The corner is one 10 mm edge whose middle is at y = 5; the tap is at y = 9.
    const edges = concaveEdgesNear(lCornerSoup(), [0.4, 9, 0.3], 2.6);
    expect(edges.length).toBe(1);
    // Past the end of the edge is still not the corner.
    expect(concaveEdgesNear(lCornerSoup(), [0.4, 13, 0.3], 2.6).length).toBe(0);
  });

  it('fills a straight corner from end to end, and no further', () => {
    const edges = concaveEdgesNear(lCornerSoup(), [0.4, 9, 0.3], 2.6);
    const wedge = buildCornerWedge(edges, 2);
    const along = axis(wedge, 1);
    expect(Math.min(...along)).toBeCloseTo(0, 6);
    expect(Math.max(...along)).toBeCloseTo(10, 6);
    // 2 mm up each face from the corner.
    expect(Math.max(...axis(wedge, 0))).toBeCloseTo(2, 6);
    expect(Math.max(...axis(wedge, 2))).toBeCloseTo(2, 6);
  });

  it('keeps to the nearer corner of a narrow slot', () => {
    // A 4 mm slot: floor in z=0 between walls at x=0 and x=4, corners 4 mm apart.
    const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
    const slot = Float32Array.from([
      ...tri([0, 0, 0], [4, 0, 0], [4, 10, 0]),
      ...tri([0, 0, 0], [4, 10, 0], [0, 10, 0]), // floor, +Z
      ...tri([0, 0, 0], [0, 10, 0], [0, 10, 10]),
      ...tri([0, 0, 0], [0, 10, 10], [0, 0, 10]), // wall at x=0, +X
      ...tri([4, 0, 0], [4, 0, 10], [4, 10, 10]),
      ...tri([4, 0, 0], [4, 10, 10], [4, 10, 0]), // wall at x=4, −X
    ]);
    expect(findConcaveEdges(slot).length).toBe(2);
    // On the floor, 1.5 mm from one corner and 2.5 mm from the other: both in reach.
    const edges = concaveEdgesNear(slot, [1.5, 5, 0], 2.6);
    expect(edges.length).toBe(1);
    expect(edges[0].a[0]).toBe(0);
    expect(edges[0].b[0]).toBe(0);
  });

  it('builds the same wedge whichever face each edge lists first', () => {
    const floor: [number, number, number] = [0, 0, 1];
    const wall: [number, number, number] = [1, 0, 0];
    const wedge = buildCornerWedge(
      [
        { a: [0, 0, 0], b: [0, 5, 0], n1: wall, n2: floor },
        { a: [0, 5, 0], b: [0, 10, 0], n1: floor, n2: wall },
      ],
      2
    );
    expect(Math.max(...axis(wedge, 0))).toBeCloseTo(2, 6);
    expect(Math.max(...axis(wedge, 2))).toBeCloseTo(2, 6);
    expect(Math.min(...axis(wedge, 1))).toBeCloseTo(0, 6);
    expect(Math.max(...axis(wedge, 1))).toBeCloseTo(10, 6);
  });
});

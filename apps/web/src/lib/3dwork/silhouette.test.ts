import { describe, expect, it } from 'vitest';
import { cubeSoup, tubeSoup } from './fixtures';
import { planeExtent, silhouette } from './silhouette';

describe('silhouette', () => {
  it('outlines a cube as its 10 mm square face', () => {
    const outline = silhouette(cubeSoup(10), 'xy');

    expect(outline.bounds.width).toBeCloseTo(10, 6);
    expect(outline.bounds.height).toBeCloseTo(10, 6);
    expect(outline.segments.length).toBeGreaterThan(0);
  });

  it('drops the edges that face the viewer, keeping only the turning ones', () => {
    const outline = silhouette(cubeSoup(10), 'xy');
    const drawn = outline.segments.length / 4;

    // A welded cube has 18 edges; only the 4 rim edges of the square turn away
    // from a viewer looking down Z, plus the diagonals of the two side faces
    // that are exactly edge-on. Far fewer than drawing everything.
    expect(drawn).toBeLessThan(18);
    expect(drawn).toBeGreaterThanOrEqual(4);
  });

  it('gives a tube its full length and diameter from the side', () => {
    const outline = silhouette(tubeSoup(100, 20, 16), 'xy');

    expect(outline.bounds.width).toBeCloseTo(100, 1);
    expect(outline.bounds.height).toBeCloseTo(40, 1);
  });

  it('gives the same tube a circular end view', () => {
    const outline = silhouette(tubeSoup(100, 20, 16), 'zy');

    expect(outline.bounds.width).toBeCloseTo(40, 1);
    expect(outline.bounds.height).toBeCloseTo(40, 1);
  });

  it('returns an empty page rather than throwing on empty input', () => {
    const outline = silhouette(new Float32Array(0), 'xy');

    expect(outline.segments.length).toBe(0);
    expect(outline.bounds.width).toBe(0);
  });
});

describe('planeExtent', () => {
  it('reports the two axes that face the page', () => {
    expect(planeExtent(tubeSoup(100, 20, 16), 'xy')).toEqual({ width: 100, height: 40 });
    expect(planeExtent(cubeSoup(10), 'xz')).toEqual({ width: 10, height: 10 });
  });
});

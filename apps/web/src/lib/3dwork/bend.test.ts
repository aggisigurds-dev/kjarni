import { describe, expect, it } from 'vitest';
import { DEFAULT_BEND, bendMesh, bendReport } from './bend';
import { computeBounds, inspect } from './mesh';

describe('bendReport', () => {
  it('spends stock on the arc rather than adding to it', () => {
    const report = bendReport({ length: 300, diameter: 28, wall: 1.5, angle: 90, radius: 100, start: 100 });

    // A quarter turn of R100 is 100 * pi/2.
    expect(report.arcLength).toBeCloseTo(157.08, 2);
    expect(report.legIn).toBe(100);
    expect(report.legOut).toBeCloseTo(300 - 100 - 157.08, 2);
    // Bending moves material, it does not create it.
    expect(report.developedLength).toBeCloseTo(300, 6);
  });

  it('measures the span shorter than the stock once bent', () => {
    const straight = bendReport({ ...DEFAULT_BEND, angle: 0 });
    const bent = bendReport(DEFAULT_BEND);

    expect(straight.span).toBeCloseTo(straight.developedLength, 6);
    expect(bent.span).toBeLessThan(bent.developedLength);
  });

  it('warns when the arc runs off the end of the stock', () => {
    const report = bendReport({ length: 100, diameter: 20, angle: 90, radius: 100, start: 90 });
    expect(report.warnings.join(' ')).toMatch(/past the end/);
  });

  it('warns when a leg is too short for the die to grip', () => {
    // R80 at 90 degrees needs 80 mm of tangent each side; 10 mm is not enough.
    const report = bendReport({ length: 400, diameter: 20, angle: 90, radius: 80, start: 10 });
    expect(report.warnings.join(' ')).toMatch(/cannot grip/);
  });

  it('warns about a radius tight enough to kink the wall', () => {
    const report = bendReport({ length: 400, diameter: 28, wall: 1.5, angle: 45, radius: 28, start: 150 });
    expect(report.radiusToDiameter).toBeCloseTo(1, 6);
    expect(report.warnings.join(' ')).toMatch(/kink/);
  });

  it('leaves a sound bend without warnings', () => {
    expect(bendReport(DEFAULT_BEND).warnings).toEqual([]);
  });
});

describe('bendMesh', () => {
  it('builds a closed pipe', () => {
    const topology = inspect(bendMesh(DEFAULT_BEND));
    expect(topology.boundaryEdges).toBe(0);
    expect(topology.nonManifoldEdges).toBe(0);
    expect(topology.watertight).toBe(true);
  });

  it('builds a closed solid rod when there is no wall', () => {
    const topology = inspect(bendMesh({ ...DEFAULT_BEND, wall: 0 }));
    expect(topology.watertight).toBe(true);
  });

  it('keeps a straight run straight at zero degrees', () => {
    const bounds = computeBounds(bendMesh({ ...DEFAULT_BEND, angle: 0 }));
    expect(bounds.size[0]).toBeCloseTo(300, 3);
    expect(bounds.size[1]).toBeCloseTo(28, 1);
    expect(bounds.size[2]).toBeCloseTo(28, 1);
  });

  it('turns the free end out of line once bent', () => {
    const bounds = computeBounds(bendMesh({ ...DEFAULT_BEND, angle: 90 }));
    // A 90 degree bend puts real extent on both axes of the bend plane.
    expect(bounds.size[0]).toBeGreaterThan(50);
    expect(bounds.size[1]).toBeGreaterThan(50);
    // And none out of it beyond the pipe's own diameter.
    expect(bounds.size[2]).toBeCloseTo(28, 1);
  });

  it('encloses the volume of the stock it was bent from', () => {
    // Bending moves material without adding any, so the solid should hold what
    // a straight 300 mm bar of the same diameter holds. A frame that pinched
    // or opened out on the arc would show here before it showed anywhere else.
    const exact = Math.PI * 14 * 14 * 300;
    const bent = inspect(bendMesh({ ...DEFAULT_BEND, wall: 0, angle: 90 })).signedVolume;

    // 48 facets inscribe the circle, so the mesh is a fraction under.
    expect(bent).toBeGreaterThan(exact * 0.99);
    expect(bent).toBeLessThan(exact);
  });

  it('holds its diameter around the outside of the bend', () => {
    // Every point should sit within half a diameter of the centreline; a frame
    // that twisted or collapsed would show up as a section narrower than that.
    const soup = bendMesh({ length: 200, diameter: 20, wall: 2, angle: 90, radius: 60, start: 60 });
    const bounds = computeBounds(soup);
    expect(bounds.size[2]).toBeCloseTo(20, 2);
  });
});

import { describe, expect, it } from 'vitest';
import { cubeSoup, tubeSoup } from './fixtures';
import {
  analyzeTube,
  bendLength,
  describePart,
  evaluateCutItem,
  massGrams,
  materialById,
  profileSection,
} from './measure';

const STEEL = materialById('steel').density;

describe('describePart', () => {
  it('measures a cube', () => {
    const part = describePart(cubeSoup(10));

    expect(part.bounds.size).toEqual([10, 10, 10]);
    expect(part.volume).toBeCloseTo(1000, 6);
    expect(part.area).toBeCloseTo(600, 6);
    expect(part.watertight).toBe(true);
    expect(part.fillRatio).toBeCloseTo(1, 6);
  });
});

describe('massGrams', () => {
  it('converts a cubic centimetre of steel to 7.85 g', () => {
    expect(massGrams(1000, STEEL)).toBeCloseTo(7.85, 6);
  });
});

describe('profileSection', () => {
  // Checked against merchant stock tables, which quote 2.47 kg/m.
  it('matches the catalogue for 20 mm round steel bar', () => {
    const section = profileSection({ kind: 'round-bar', a: 20 }, STEEL);

    expect(section.area).toBeCloseTo(314.159, 3);
    expect(section.massPerMetre).toBeCloseTo(2.466, 3);
  });

  // DN25 medium pipe, 33.7 x 3.2, quoted at about 2.41 kg/m.
  it('matches the catalogue for 33.7 x 3.2 pipe', () => {
    const section = profileSection({ kind: 'round-pipe', a: 33.7, t: 3.2 }, STEEL);

    expect(section.massPerMetre).toBeCloseTo(2.407, 2);
  });

  // 40 x 40 x 3 SHS is quoted at about 3.41 kg/m before corner radii.
  it('matches the catalogue for 40 x 40 x 3 square tube', () => {
    const section = profileSection({ kind: 'square-tube', a: 40, t: 3 }, STEEL);

    expect(section.massPerMetre).toBeCloseTo(3.485, 2);
  });

  it('treats a hex bar by its across-flats size', () => {
    const section = profileSection({ kind: 'hex-bar', a: 20 }, STEEL);

    expect(section.area).toBeCloseTo(346.41, 2);
    expect(section.perimeter).toBeCloseTo(69.282, 2);
  });

  it('gives a hollow section less area than the solid of the same size', () => {
    const solid = profileSection({ kind: 'square-bar', a: 40 }, STEEL);
    const hollow = profileSection({ kind: 'square-tube', a: 40, t: 3 }, STEEL);

    expect(hollow.area).toBeLessThan(solid.area);
    expect(hollow.perimeter).toBeCloseTo(solid.perimeter, 6);
  });
});

describe('evaluateCutItem', () => {
  it('totals a cut list row', () => {
    const result = evaluateCutItem({
      id: 'a',
      label: 'Uprights',
      profile: { kind: 'round-pipe', a: 33.7, t: 3.2 },
      length: 2000,
      quantity: 4,
      materialId: 'steel',
    });

    expect(result.massEach).toBeCloseTo(4.81, 1);
    expect(result.massTotal).toBeCloseTo(19.26, 1);
    expect(result.totalLength).toBe(8000);
  });

  it('measures plate by the piece rather than per metre', () => {
    const result = evaluateCutItem({
      id: 'b',
      label: 'Base plate',
      profile: { kind: 'plate', a: 200, t: 10 },
      length: 300,
      quantity: 2,
      materialId: 'steel',
    });

    // 200 x 300 x 10 mm of steel is 600 cm3, so 4.71 kg each.
    expect(result.massEach).toBeCloseTo(4.71, 2);
    expect(result.massTotal).toBeCloseTo(9.42, 2);
  });
});

describe('analyzeTube', () => {
  it('recovers the wall of a modelled tube', () => {
    const analysis = analyzeTube(tubeSoup(100, 20, 16));

    expect(analysis.axis).toBe('x');
    expect(analysis.length).toBeCloseTo(100, 3);
    expect(analysis.hollow).toBe(true);
    // Sampling across the facets reads a hair inside the true radius, so the
    // wall comes out within a tenth of a millimetre rather than exact.
    expect(analysis.outerDiameter).toBeCloseTo(40, 1);
    expect(analysis.innerDiameter).toBeCloseTo(32, 0);
    expect(analysis.wallThickness).toBeCloseTo(4, 1);
    expect(analysis.roundness).toBeGreaterThan(0.9);
  });

  it('does not claim a solid block is hollow', () => {
    const analysis = analyzeTube(cubeSoup(10));

    expect(analysis.hollow).toBe(false);
    expect(analysis.wallThickness).toBe(0);
    expect(analysis.roundness).toBeLessThan(0.9);
  });
});

describe('bendLength', () => {
  it('measures a 90 degree bend along its centreline', () => {
    expect(bendLength(100, 90)).toBeCloseTo(157.08, 2);
  });
});
